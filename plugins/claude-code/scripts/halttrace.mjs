#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packagedEntry = resolve(here, "../dist/src/cli/claude-hook.js");
const repoEntry = resolve(here, "../../../dist/src/cli/claude-hook.js");
const entry = process.env.HALTTRACE_ENTRY ?? (await exists(packagedEntry) ? packagedEntry : repoEntry);
const input = await readStdin();
const result = spawnSync(process.execPath, [entry], {
  input,
  encoding: "utf8",
  stdio: ["pipe", "pipe", "pipe"],
  env: process.env,
});

if (result.error) {
  console.error(`[halttrace] observer diagnostic: ${result.error.message}`);
}
for (const line of splitLines(result.stdout)) {
  if (line.startsWith("[halttrace] backtrace dump:")) {
    console.log(line);
  }
}
for (const line of splitLines(result.stderr)) {
  if (line.startsWith("[halttrace]")) {
    console.error(line);
  }
}

process.exit(0);

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function splitLines(value) {
  return value.split(/\r?\n/).filter((line) => line.length > 0);
}

async function exists(target) {
  try {
    await import("node:fs/promises").then((fs) => fs.access(target));
    return true;
  } catch {
    return false;
  }
}
