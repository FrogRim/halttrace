import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { defaultStateRoot, projectHash } from "./storage.js";

export interface DumpSearchOptions {
  stateRoot?: string;
  cwd?: string;
  projectHash?: string;
  sessionId?: string;
}

export interface DumpFile {
  path: string;
  mtimeMs: number;
}

export interface DumpSummary {
  path?: string;
  incidentId?: string;
  trigger?: string;
  host?: string;
  sessionId?: string;
  projectHash?: string;
  dumpMode?: string;
  cwd?: string;
  created?: string;
  eventType?: string;
  normalizedType?: string;
  tool?: string;
  files: string[];
  recentEventCount: number;
  evidenceBlocks: EvidenceBlock[];
  likelyCause: string;
  recommendedNextSteps: string[];
}

export interface EvidenceBlock {
  label: string;
  preview: string;
}

interface ParsedOptions {
  stateRoot: string;
  projectHash?: string;
  sessionId?: string;
}

export async function findLatestDump(options: DumpSearchOptions = {}): Promise<DumpFile | undefined> {
  const parsed = parseSearchOptions(options);
  if (!existsSync(parsed.stateRoot)) {
    return undefined;
  }
  const files = await collectDumpFiles(parsed.stateRoot, parsed);
  files.sort((left, right) => right.mtimeMs - left.mtimeMs || right.path.localeCompare(left.path));
  return files[0];
}

export async function readDumpSummary(dumpPath: string): Promise<DumpSummary> {
  const content = await readFile(dumpPath, "utf8");
  return parseDumpMarkdown(content, dumpPath);
}

export function parseDumpMarkdown(content: string, dumpPath?: string): DumpSummary {
  const trigger = firstBullet(content, ["Trigger"]);
  const normalizedType = firstBullet(content, ["Normalized type", "Type"]);
  const eventType = firstBullet(content, ["Event type"]);
  const tool = firstBullet(content, ["Tool"]);
  const files = readFiles(content);
  const evidenceBlocks = readEvidenceBlocks(content);
  return {
    ...(dumpPath === undefined ? {} : { path: dumpPath }),
    ...optional("incidentId", firstBullet(content, ["Incident", "Incident ID"])),
    ...optional("trigger", trigger),
    ...optional("host", firstBullet(content, ["Host"])),
    ...optional("sessionId", firstBullet(content, ["Session"])),
    ...optional("projectHash", firstBullet(content, ["Project hash"])),
    ...optional("dumpMode", firstBullet(content, ["Dump mode"])),
    ...optional("cwd", firstBullet(content, ["CWD"])),
    ...optional("created", firstBullet(content, ["Created"])),
    ...optional("eventType", eventType),
    ...optional("normalizedType", normalizedType),
    ...optional("tool", tool),
    files,
    recentEventCount: countRecentEvents(content),
    evidenceBlocks,
    likelyCause: inferLikelyCause(trigger, normalizedType ?? eventType, tool),
    recommendedNextSteps: recommendedNextSteps(trigger, normalizedType ?? eventType),
  };
}

export function renderExplanation(summary: DumpSummary): string {
  const lines: string[] = [];
  lines.push("# HaltTrace Explanation");
  lines.push("");
  appendField(lines, "Dump", summary.path);
  appendField(lines, "Trigger", summary.trigger);
  appendField(lines, "Host", summary.host);
  appendField(lines, "Session", summary.sessionId);
  appendField(lines, "Tool", summary.tool);
  appendField(lines, "CWD", summary.cwd);
  if (summary.files.length > 0) {
    lines.push(`- Files: ${summary.files.map((file) => `\`${file}\``).join(", ")}`);
  }
  lines.push(`- Recent events captured: ${summary.recentEventCount}`);
  lines.push("");
  lines.push("## Likely Cause");
  lines.push("");
  lines.push(summary.likelyCause);
  lines.push("");
  if (summary.evidenceBlocks.length > 0) {
    lines.push("## Evidence Preview");
    lines.push("");
    for (const block of summary.evidenceBlocks) {
      lines.push(`### ${block.label}`);
      lines.push("");
      lines.push("```text");
      lines.push(block.preview);
      lines.push("```");
      lines.push("");
    }
  }
  lines.push("## Recommended Next Steps");
  lines.push("");
  summary.recommendedNextSteps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step}`);
  });
  lines.push("");
  lines.push("This is deterministic local triage. It does not retry, repair, approve, deny, or send data anywhere.");
  lines.push("");
  return lines.join("\n");
}

export function renderHandoff(summary: DumpSummary): string {
  const lines: string[] = [];
  lines.push("# HaltTrace Handoff Prompt");
  lines.push("");
  lines.push("Use this local HaltTrace dump as the starting point for the next debugging pass.");
  lines.push("");
  appendField(lines, "Dump", summary.path);
  appendField(lines, "Trigger", summary.trigger);
  appendField(lines, "Host", summary.host);
  appendField(lines, "Session", summary.sessionId);
  appendField(lines, "Tool", summary.tool);
  if (summary.files.length > 0) {
    lines.push(`- Files: ${summary.files.map((file) => `\`${file}\``).join(", ")}`);
  }
  lines.push("");
  lines.push("## What Happened");
  lines.push("");
  lines.push(summary.likelyCause);
  lines.push("");
  lines.push("## Continue With This Instruction");
  lines.push("");
  lines.push("```text");
  lines.push("Read the HaltTrace dump above before making changes.");
  lines.push("Identify the failed step, the relevant file or command, and the smallest verification command.");
  lines.push("Do not assume the dump is complete; if evidence is missing, inspect the referenced files or rerun the narrowest safe command.");
  lines.push("Do not treat this as permission to approve, deny, retry, or auto-repair host actions.");
  lines.push("Produce a short recovery plan before editing.");
  lines.push("```");
  lines.push("");
  lines.push("## Suggested Checks");
  lines.push("");
  summary.recommendedNextSteps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step}`);
  });
  lines.push("");
  return lines.join("\n");
}

async function collectDumpFiles(root: string, options: ParsedOptions): Promise<DumpFile[]> {
  const output: DumpFile[] = [];
  await walk(root, output, options);
  return output;
}

async function walk(current: string, output: DumpFile[], options: ParsedOptions): Promise<void> {
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, output, options);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue;
    }
    if (!matchesFilters(fullPath, options)) {
      continue;
    }
    try {
      const stats = await stat(fullPath);
      output.push({ path: fullPath, mtimeMs: stats.mtimeMs });
    } catch {
      // Ignore files that disappear during traversal.
    }
  }
}

function parseSearchOptions(options: DumpSearchOptions): ParsedOptions {
  const stateRoot = path.resolve(options.stateRoot ?? defaultStateRoot());
  const hash = options.projectHash ?? (options.cwd === undefined ? undefined : projectHash(options.cwd));
  return {
    stateRoot,
    ...(hash === undefined ? {} : { projectHash: hash }),
    ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
  };
}

function matchesFilters(filePath: string, options: ParsedOptions): boolean {
  const segments = filePath.split(path.sep);
  if (options.projectHash !== undefined && !segments.includes(options.projectHash)) {
    return false;
  }
  return options.sessionId === undefined || segments.includes(options.sessionId);
}

function firstBullet(content: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const escaped = escapeRegex(label);
    const pattern = new RegExp(`^- ${escaped}:\\s*(.+)$`, "im");
    const match = pattern.exec(content);
    if (match?.[1] !== undefined) {
      return stripInlineCode(match[1].trim());
    }
  }
  return undefined;
}

function readFiles(content: string): string[] {
  const filesLine = firstBulletRaw(content, ["Files", "Path"]);
  if (filesLine === undefined) {
    return [];
  }
  const backtickMatches = [...filesLine.matchAll(/`([^`]+)`/g)].map((match) => match[1]).filter((value): value is string => value !== undefined);
  if (backtickMatches.length > 0) {
    return backtickMatches;
  }
  return [stripInlineCode(filesLine.trim())].filter((value) => value.length > 0);
}

function firstBulletRaw(content: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const pattern = new RegExp(`^- ${escapeRegex(label)}:\\s*(.+)$`, "im");
    const match = pattern.exec(content);
    if (match?.[1] !== undefined) {
      return match[1].trim();
    }
  }
  return undefined;
}

function readEvidenceBlocks(content: string): EvidenceBlock[] {
  const output: EvidenceBlock[] = [];
  const pattern = /^### ([^\n]+)\n\n```(?:text|diff)?\n([\s\S]*?)\n```/gm;
  for (const match of content.matchAll(pattern)) {
    const label = match[1];
    const body = match[2];
    if (label === undefined || body === undefined) {
      continue;
    }
    output.push({ label, preview: preview(body, 1200) });
  }
  return output;
}

function countRecentEvents(content: string): number {
  const section = sectionBetween(content, ["Recent Events", "Recent Context"]);
  if (section === undefined) {
    return 0;
  }
  return section
    .split(/\r?\n/)
    .filter((line) => line.startsWith("|") && !line.includes("---") && !line.toLowerCase().includes("time |"))
    .length;
}

function sectionBetween(content: string, headings: string[]): string | undefined {
  for (const heading of headings) {
    const pattern = new RegExp(`^## ${escapeRegex(heading)}\\s*$`, "im");
    const match = pattern.exec(content);
    if (match === null) {
      continue;
    }
    const start = match.index + match[0].length;
    const rest = content.slice(start);
    const next = /^## /m.exec(rest);
    return next === null ? rest : rest.slice(0, next.index);
  }
  return undefined;
}

function inferLikelyCause(trigger: string | undefined, eventType: string | undefined, tool: string | undefined): string {
  const normalized = (trigger ?? eventType ?? "").toLowerCase();
  if (normalized.includes("host-blocked")) {
    return `The host blocked a ${tool ?? "tool"} action. The dump should be treated as evidence for why the action was blocked, not as approval to retry it.`;
  }
  if (normalized.includes("edit-apply-failure")) {
    return "A file edit or patch failed to apply. The likely cause is stale context, mismatched file contents, or an invalid patch hunk.";
  }
  if (normalized.includes("tool-exception")) {
    return "A supported tool call threw, aborted, or returned an explicit exception signal. The useful evidence is usually in the Error or stderr block.";
  }
  if (normalized.includes("host-unrecoverable-error")) {
    return "The host reported an unrecoverable stop that was distinguishable from a user-intended stop.";
  }
  return "The dump contains a halted-session backtrace, but the trigger type was not recognized by this deterministic explanation workflow.";
}

function recommendedNextSteps(trigger: string | undefined, eventType: string | undefined): string[] {
  const normalized = (trigger ?? eventType ?? "").toLowerCase();
  if (normalized.includes("host-blocked")) {
    return [
      "Inspect the Tool, Files, Args, and stderr evidence before repeating the action.",
      "Confirm whether the host policy or user approval state intentionally blocked the action.",
      "If continuing, choose the smallest safe command or edit that avoids bypassing the host decision.",
    ];
  }
  if (normalized.includes("edit-apply-failure")) {
    return [
      "Open the referenced file and compare the current contents with the failed patch hunk.",
      "Rebuild the edit from fresh file context instead of replaying the stale patch blindly.",
      "Run the narrowest test or typecheck that covers the edited file after applying a fix.",
    ];
  }
  if (normalized.includes("tool-exception")) {
    return [
      "Read the Error and stderr previews first; they usually identify the failed tool boundary.",
      "Rerun only the smallest reproducer if the dump does not include enough evidence.",
      "Check whether the failure was environmental before changing source code.",
    ];
  }
  return [
    "Read the trigger event details and recent event table before making changes.",
    "Identify the smallest missing piece of evidence, then gather that evidence locally.",
    "Write a short recovery plan before editing or rerunning broad commands.",
  ];
}

function appendField(lines: string[], label: string, value: string | undefined): void {
  if (value !== undefined && value.length > 0) {
    lines.push(`- ${label}: ${value}`);
  }
}

function stripInlineCode(value: string): string {
  return value.replace(/^`/, "").replace(/`$/, "");
}

function preview(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}...`;
}

function optional<K extends string>(key: K, value: string | undefined): { [P in K]?: string } {
  return value === undefined ? {} : { [key]: value } as { [P in K]?: string };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
