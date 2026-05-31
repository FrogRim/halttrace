#!/usr/bin/env node
import { access } from "node:fs/promises";
import { stdin, cwd as processCwd, env } from "node:process";
import { parseJsonObject } from "../core/json.js";
import { assertStateRootSafeForProject, resolveStoragePaths } from "../core/storage.js";
import { FileEventStore } from "../core/event-store.js";
import { IncidentDeduper } from "../core/dedup.js";
import { AgentEventRouter } from "../core/router.js";
import { BacktraceSink } from "../sinks/backtrace.js";
import { claudeHookToAgentEvent, parseClaudeHookInput } from "../adapters/claude-code.js";
import type { DumpMode } from "../core/types.js";

async function main(): Promise<void> {
  try {
    const text = await readStdin();
    const object = parseJsonObject(text);
    const hookInput = parseClaudeHookInput(object, processCwd());
    const event = claudeHookToAgentEvent(hookInput);
    const dumpMode = readDumpMode();
    const stateRoot = env["HALTTRACE_STATE_DIR"] ?? env["CLAUDE_PLUGIN_DATA"];
    const storageOptions = {
      cwd: hookInput.cwd,
      sessionId: hookInput.sessionId,
    };
    const paths = resolveStoragePaths(stateRoot === undefined ? storageOptions : { ...storageOptions, stateRoot });
    await assertStateRootSafeForProject(hookInput.cwd, paths.stateRoot);
    const store = new FileEventStore({
      eventsPath: paths.eventsPath,
      maxEvents: readIntEnv("HALTTRACE_MAX_EVENTS", 80),
      maxBytes: readIntEnv("HALTTRACE_MAX_BYTES", 512_000),
    });
    const deduper = new IncidentDeduper(paths.incidentStatePath, readIntEnv("HALTTRACE_COOLDOWN_MS", 5000));
    const router = new AgentEventRouter({
      store,
      deduper,
      stateRoot: paths.stateRoot,
      projectHash: paths.projectHash,
      dumpMode,
      sinks: [
        new BacktraceSink({
          stateRoot: paths.stateRoot,
          dumpPath: paths.dumpPath,
          dumpMode,
        }),
      ],
    });
    const result = await router.process(event);
    if (result.triggered && result.deduped !== true && (await exists(paths.dumpPath))) {
      console.log(`[halttrace] backtrace dump: ${paths.dumpPath}`);
    }
    for (const diagnostic of result.diagnostics) {
      console.error(`[halttrace] ${diagnostic.message}${diagnostic.error === undefined ? "" : `: ${diagnostic.error}`}`);
    }
  } catch (error) {
    console.error(`[halttrace] observer diagnostic: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readDumpMode(): DumpMode {
  return env["HALTTRACE_DUMP_MODE"] === "metadata-only" ? "metadata-only" : "rich-local";
}

function readIntEnv(key: string, fallback: number): number {
  const value = env[key];
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

await main();
process.exit(0);
