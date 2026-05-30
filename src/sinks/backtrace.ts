import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentEvent, DumpMode, IncidentSnapshot } from "../core/types.js";
import type { EventSink } from "../core/sink.js";
import { assertSafeWritePath, chmodBestEffort, ensurePrivateDirectory } from "../core/storage.js";
import { redactAndTruncate } from "../core/redaction.js";

export interface BacktraceSinkOptions {
  stateRoot: string;
  dumpPath: string;
  dumpMode: DumpMode;
  stdoutTailChars?: number;
  stderrTailChars?: number;
  argsMaxChars?: number;
  diffMaxChars?: number;
}

export class BacktraceSink implements EventSink {
  readonly id = "backtrace";
  readonly #options: Required<BacktraceSinkOptions>;

  constructor(options: BacktraceSinkOptions) {
    this.#options = {
      stdoutTailChars: options.stdoutTailChars ?? 4000,
      stderrTailChars: options.stderrTailChars ?? 12000,
      argsMaxChars: options.argsMaxChars ?? 2000,
      diffMaxChars: options.diffMaxChars ?? 8000,
      stateRoot: options.stateRoot,
      dumpPath: options.dumpPath,
      dumpMode: options.dumpMode,
    };
  }

  async handleIncident(incident: IncidentSnapshot): Promise<void> {
    await ensurePrivateDirectory(path.dirname(this.#options.dumpPath));
    await assertSafeWritePath(this.#options.stateRoot, this.#options.dumpPath);
    const report = renderIncidentMarkdown(incident, this.#options);
    await writeFile(this.#options.dumpPath, report, { encoding: "utf8", mode: 0o600 });
    await chmodBestEffort(this.#options.dumpPath, 0o600);
  }
}

export function renderIncidentMarkdown(incident: IncidentSnapshot, options: Required<BacktraceSinkOptions>): string {
  const lines: string[] = [];
  lines.push(`# Agent Event Backtrace`);
  lines.push("");
  lines.push(`- Incident: \`${incident.id}\``);
  lines.push(`- Trigger: \`${incident.trigger}\``);
  lines.push(`- Created: ${incident.createdAt}`);
  lines.push(`- Host: ${incident.event.host}`);
  lines.push(`- Session: \`${incident.event.sessionId}\``);
  lines.push(`- Project hash: \`${incident.projectHash}\``);
  lines.push(`- Dump mode: \`${incident.dumpMode}\``);
  if (incident.event.cwd !== undefined) {
    lines.push(`- CWD: \`${incident.event.cwd}\``);
  }
  lines.push("");
  lines.push("## Recent Events");
  lines.push("");
  lines.push("| Time | Type | Tool | Command | Exit |");
  lines.push("|---|---|---|---|---:|");
  for (const event of incident.events) {
    lines.push(
      `| ${escapeTable(event.timestamp)} | \`${event.type}\` | ${escapeTable(event.toolName ?? "")} | ${escapeTable(shorten(event.command ?? "", 80))} | ${event.exitCode ?? ""} |`,
    );
  }
  lines.push("");
  lines.push("## Trigger Event");
  lines.push("");
  lines.push(renderEventDetails(incident.event, incident.dumpMode, options));
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- This dump is local-only by default.");
  lines.push("- Redaction is best-effort defense-in-depth, not a safety guarantee.");
  lines.push("- Truncated or redacted fields are marked inline.");
  lines.push("");
  return lines.join("\n");
}

function renderEventDetails(event: AgentEvent, mode: DumpMode, options: Required<BacktraceSinkOptions>): string {
  const lines: string[] = [];
  lines.push(`- Event id: \`${event.id}\``);
  lines.push(`- Type: \`${event.type}\``);
  lines.push(`- Severity: \`${event.severity}\``);
  if (event.toolName !== undefined) {
    lines.push(`- Tool: \`${event.toolName}\``);
  }
  if (event.filePaths !== undefined && event.filePaths.length > 0) {
    lines.push(`- Files: ${event.filePaths.map((file) => `\`${file}\``).join(", ")}`);
  }
  if (mode === "metadata-only") {
    lines.push("");
    lines.push("[content omitted: metadata-only mode]");
    return lines.join("\n");
  }
  appendBlock(lines, "Args", redactAndTruncate(event.args, options.argsMaxChars, "args")?.text);
  appendBlock(lines, "stderr tail", redactAndTruncate(event.stderr, options.stderrTailChars, "stderr")?.text);
  appendBlock(lines, "stdout tail", redactAndTruncate(event.stdout, options.stdoutTailChars, "stdout")?.text);
  if (event.diffHunks !== undefined && event.diffHunks.length > 0) {
    const diffText = event.diffHunks
      .map((hunk) => [`# ${hunk.file}`, hunk.hunkHeader, hunk.patch].filter(Boolean).join("\n"))
      .join("\n\n");
    appendBlock(lines, "Relevant diff hunks", redactAndTruncate(diffText, options.diffMaxChars, "diff")?.text);
  }
  if (event.error !== undefined) {
    appendBlock(lines, "Error", redactAndTruncate(event.error.stack ?? event.error.message, options.stderrTailChars, "error")?.text);
  }
  return lines.join("\n");
}

function appendBlock(lines: string[], label: string, value: string | undefined): void {
  if (value === undefined || value.length === 0) {
    return;
  }
  lines.push("");
  lines.push(`### ${label}`);
  lines.push("");
  lines.push("```text");
  lines.push(value);
  lines.push("```");
}

function escapeTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function shorten(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}
