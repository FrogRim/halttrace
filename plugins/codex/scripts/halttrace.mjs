#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = process.env.PLUGIN_ROOT ?? process.env.CLAUDE_PLUGIN_ROOT ?? resolve(scriptDir, "..");
const entryCandidates = [
  process.env.HALTTRACE_ENTRY,
  join(pluginRoot, "dist/src/cli/codex-hook.js"),
  resolve(scriptDir, "../dist/src/cli/codex-hook.js"),
  resolve(scriptDir, "../../../dist/src/cli/codex-hook.js"),
].filter((candidate) => candidate !== undefined);

const entry = await firstExisting(entryCandidates);
if (entry === undefined) {
  console.error("[halttrace] observer diagnostic: packaged runtime entry not found");
  process.exit(0);
}

const child = spawn(process.execPath, [entry], {
  env: process.env,
  stdio: ["pipe", "pipe", "pipe"],
});

process.stdin.pipe(child.stdin);
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");

child.stdout.on("data", () => {
  // Codex Stop and shared-output hooks require stdout to be empty or valid JSON.
});

child.stderr.on("data", (chunk) => {
  for (const line of chunk.split(/\r?\n/)) {
    if (line.startsWith("[halttrace]")) {
      console.error(line);
    }
  }
});

child.on("error", (error) => {
  console.error(`[halttrace] observer diagnostic: ${error.message}`);
});

child.on("close", () => {
  process.exit(0);
});

async function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (candidate === undefined) {
      continue;
    }
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next packaging location.
    }
  }
  return undefined;
}
