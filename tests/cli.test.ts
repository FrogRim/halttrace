import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("Claude hook CLI exits 0 and surfaces dump path without control JSON", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "aesr-cli-"));
  try {
    const result = await runCli(
      {
        hook_event_name: "PermissionDenied",
        session_id: "cli-session",
        cwd: process.cwd(),
        tool_name: "Write",
        tool_input: { file_path: "src/x.ts" },
      },
      dir,
    );
    assert.equal(result.code, 0);
    assert.match(result.stdout, /backtrace dump:/);
    assert.doesNotMatch(result.stdout, /"decision"/);
    assert.doesNotMatch(result.stdout, /"permissionDecision"/);
    assert.doesNotMatch(result.stdout, /"continue"/);
    assert.doesNotMatch(result.stdout, /"retry"/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Claude hook CLI does not trigger on ordinary failed command result", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "aesr-cli-"));
  try {
    const result = await runCli(
      {
        hook_event_name: "PostToolUse",
        session_id: "cli-session",
        cwd: process.cwd(),
        tool_name: "Bash",
        tool_input: { command: "npm test" },
        tool_response: { exit_code: 1, stderr: "red" },
      },
      dir,
    );
    assert.equal(result.code, 0);
    assert.equal(result.stdout.trim(), "");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Claude hook CLI does not trigger on PostToolUseFailure for ordinary failed commands", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "aesr-cli-"));
  try {
    const result = await runCli(
      {
        hook_event_name: "PostToolUseFailure",
        session_id: "cli-session",
        cwd: process.cwd(),
        tool_name: "Bash",
        tool_input: { command: "npm test" },
        tool_response: { exit_code: 1, stderr: "red" },
      },
      dir,
    );
    assert.equal(result.code, 0);
    assert.equal(result.stdout.trim(), "");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Claude hook CLI does not dump for user interrupt signals", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "aesr-cli-"));
  try {
    const result = await runCli(
      {
        hook_event_name: "StopFailure",
        session_id: "cli-session",
        cwd: process.cwd(),
        is_interrupt: true,
        error: "User stopped",
      },
      dir,
    );
    assert.equal(result.code, 0);
    assert.equal(result.stdout.trim(), "");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Claude plugin wrapper only forwards sanitized observer lines", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "aesr-wrapper-"));
  try {
    const fakeEntry = path.join(dir, "fake-child.mjs");
    await writeFile(
      fakeEntry,
      [
        "console.log('raw stdout SECRET_TOKEN=abc123');",
        "console.log('[halttrace] backtrace dump: C:/state/dump.md');",
        "console.error('raw stderr SECRET_TOKEN=def456');",
        "console.error('[halttrace] observer diagnostic: safe');",
      ].join("\n"),
      "utf8",
    );
    const result = await runNodeScript("plugins/claude-code/scripts/halttrace.mjs", "{}", {
      HALTTRACE_ENTRY: fakeEntry,
    });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /backtrace dump/);
    assert.match(result.stderr, /observer diagnostic: safe/);
    assert.doesNotMatch(result.stdout, /SECRET_TOKEN/);
    assert.doesNotMatch(result.stderr, /SECRET_TOKEN/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCli(input: unknown, stateDir: string): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["dist/src/cli/claude-hook.js"], {
      cwd: process.cwd(),
      env: { ...process.env, HALTTRACE_STATE_DIR: stateDir },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(JSON.stringify(input));
  });
}

function runNodeScript(scriptPath: string, input: string, extraEnv: NodeJS.ProcessEnv): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: { ...process.env, ...extraEnv },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(input);
  });
}
