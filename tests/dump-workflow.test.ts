import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  findLatestDump,
  parseDumpMarkdown,
  projectHash,
  renderExplanation,
  renderHandoff,
} from "../src/index.js";

const sampleDump = `# Agent Event Backtrace

- Incident: \`incident-1\`
- Trigger: \`edit-apply-failure\`
- Created: 2026-06-05T00:00:00.000Z
- Host: claude-code
- Session: \`session-one\`
- Project hash: \`project-one\`
- Dump mode: \`rich-local\`
- CWD: \`/repo\`

## Recent Events

| Time | Type | Tool | Command | Exit |
|---|---|---|---|---:|
| 2026-06-05T00:00:00.000Z | \`tool-result\` | Bash | npm test | 1 |
| 2026-06-05T00:00:01.000Z | \`edit-apply-failure\` | Write |  |  |

## Trigger Event

- Event id: \`event-1\`
- Type: \`edit-apply-failure\`
- Severity: \`error\`
- Tool: \`Write\`
- Files: \`src/example.ts\`

### stderr tail

\`\`\`text
Patch did not apply
\`\`\`

## Notes

- This dump is local-only by default.
`;

test("dump workflow parses Markdown reports into deterministic summaries", () => {
  const summary = parseDumpMarkdown(sampleDump, "C:/state/dump.md");
  assert.equal(summary.path, "C:/state/dump.md");
  assert.equal(summary.incidentId, "incident-1");
  assert.equal(summary.trigger, "edit-apply-failure");
  assert.equal(summary.host, "claude-code");
  assert.equal(summary.sessionId, "session-one");
  assert.equal(summary.tool, "Write");
  assert.deepEqual(summary.files, ["src/example.ts"]);
  assert.equal(summary.recentEventCount, 2);
  assert.match(summary.likelyCause, /patch failed to apply/i);
  assert.equal(summary.evidenceBlocks[0]?.label, "stderr tail");
  assert.match(renderExplanation(summary), /HaltTrace Explanation/);
  assert.match(renderHandoff(summary), /HaltTrace Handoff Prompt/);
});

test("dump workflow finds the latest dump with project and session filters", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "halttrace-dump-workflow-"));
  try {
    const cwd = path.join(root, "repo");
    await mkdir(cwd, { recursive: true });
    const hash = projectHash(cwd);
    const oldDir = path.join(root, hash, "old-session");
    const newDir = path.join(root, hash, "new-session");
    await mkdir(oldDir, { recursive: true });
    await mkdir(newDir, { recursive: true });
    const oldDump = path.join(oldDir, "old.md");
    const newDump = path.join(newDir, "new.md");
    await writeFile(oldDump, sampleDump.replace("incident-1", "old"), "utf8");
    await new Promise((resolve) => setTimeout(resolve, 20));
    await writeFile(newDump, sampleDump.replace("incident-1", "new"), "utf8");

    const latest = await findLatestDump({ stateRoot: root, cwd });
    assert.equal(latest?.path, newDump);

    const old = await findLatestDump({ stateRoot: root, cwd, sessionId: "old-session" });
    assert.equal(old?.path, oldDump);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("main CLI explains and hands off latest dumps without network or host control output", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "halttrace-cli-main-"));
  try {
    const cwd = path.join(root, "repo");
    const hash = projectHash(cwd);
    const sessionDir = path.join(root, hash, "session-one");
    await mkdir(sessionDir, { recursive: true });
    const dumpPath = path.join(sessionDir, "dump.md");
    await writeFile(dumpPath, sampleDump, "utf8");

    const latest = await runMain(["latest", "--state-root", root, "--cwd", cwd]);
    assert.equal(latest.code, 0);
    assert.equal(latest.stdout.trim(), dumpPath);

    const explain = await runMain(["explain", "--state-root", root, "--cwd", cwd]);
    assert.equal(explain.code, 0);
    assert.match(explain.stdout, /Likely Cause/);
    assert.doesNotMatch(explain.stdout, /permissionDecision|continue:false|retry:true/);

    const handoff = await runMain(["handoff", dumpPath]);
    assert.equal(handoff.code, 0);
    assert.match(handoff.stdout, /Continue With This Instruction/);
    assert.doesNotMatch(handoff.stdout, /permissionDecision|continue:false|retry:true/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runMain(args: string[]): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["dist/src/cli/main.js", ...args], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
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
  });
}
