import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  AgentEventRouter,
  BacktraceSink,
  FileEventStore,
  IncidentDeduper,
  classifyTrigger,
  defaultStateRoot,
  parseEventLines,
  parseClaudeHookInput,
  claudeHookToAgentEvent,
  projectHash,
  replayJsonlText,
  resolveStoragePaths,
} from "../src/index.js";
import type { AgentEvent, DumpMode } from "../src/index.js";

test("trigger classifier only treats anomaly events as triggers", () => {
  assert.equal(classifyTrigger(event({ type: "host-blocked" })), "host-blocked");
  assert.equal(classifyTrigger(event({ type: "tool-exception" })), "tool-exception");
  assert.equal(classifyTrigger(event({ type: "edit-apply-failure" })), "edit-apply-failure");
  assert.equal(classifyTrigger(event({ type: "host-unrecoverable-error" })), "host-unrecoverable-error");

  assert.equal(classifyTrigger(event({ type: "tool-result", exitCode: 1, command: "npm test" })), undefined);
  assert.equal(classifyTrigger(event({ type: "session-end", metadata: { userIntended: true } })), undefined);
  assert.equal(classifyTrigger(event({ type: "host-unrecoverable-error", metadata: { userIntended: true } })), undefined);
});

test("router writes one rich local dump for trigger and not for ordinary failed command", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "aesr-"));
  try {
    const first = await runRouter(dir, "s1", event({ type: "tool-result", command: "npm test", exitCode: 1, stderr: "failed" }));
    assert.equal(first.triggered, false);

    const blocked = event({
      type: "host-blocked",
      toolName: "Write",
      args: "API_TOKEN=abc123456789012345678901234567890abcdef path=src/x.ts",
      stderr: "Permission denied",
      filePaths: ["src/x.ts"],
    });
    const { result: second, paths } = await runRouterWithPaths(dir, "s1", blocked);
    assert.equal(second.triggered, true);
    assert.equal(second.trigger, "host-blocked");

    const content = await readFile(paths.dumpPath, "utf8");
    assert.match(content, /Agent Event Backtrace/);
    assert.match(content, /host-blocked/);
    assert.match(content, /Permission denied/);
    assert.match(content, /redacted/);
    assert.doesNotMatch(content, /abc123456789012345678901234567890abcdef/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("dedup suppresses repeated same trigger inside cooldown", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "aesr-"));
  try {
    const { result: first, paths } = await runRouterWithPaths(dir, "s2", event({ type: "host-blocked" }));
    assert.equal(first.triggered, true);
    assert.match(await readFile(paths.dumpPath, "utf8"), /Agent Event Backtrace/);
    const second = await runRouter(dir, "s2", event({ type: "host-blocked" }));
    assert.equal(second.triggered, true);
    assert.equal(second.deduped, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("metadata-only dump omits args and captured content", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "aesr-"));
  try {
    const { result, paths } = await runRouterWithPaths(
      dir,
      "s3",
      event({ type: "tool-exception", args: "SECRET_KEY=value", stdout: "hello", stderr: "boom" }),
      "metadata-only",
    );
    assert.equal(result.triggered, true);
    const content = await readFile(paths.dumpPath, "utf8");
    assert.match(content, /metadata-only/);
    assert.match(content, /content omitted/);
    assert.doesNotMatch(content, /SECRET_KEY/);
    assert.doesNotMatch(content, /hello/);
    assert.doesNotMatch(content, /boom/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("router persists only redacted rich-local event content", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "aesr-"));
  try {
    const commandSecret = "AbCdEfGhIjKlMnOpQrStUvWxYz123456";
    const argsSecret = "sk_test_superSecretTokenValue123456789";
    const metadataSecret = "metadataSecretValue123456789ABCDEFG";
    const { paths } = await runRouterWithPaths(
      dir,
      "s-rich",
      event({
        type: "tool-exception",
        command: `curl -H "Authorization: Bearer ${commandSecret}" https://example.invalid`,
        args: `OPENAI_API_KEY=${argsSecret}`,
        stdout: `payload ${argsSecret}`,
        stderr: `Bearer ${commandSecret}`,
        diffHunks: [{ file: "src/x.ts", patch: `+const token = "${argsSecret}";` }],
        error: { message: `AUTH_TOKEN=${argsSecret}` },
        metadata: { note: `AUTH_TOKEN=${metadataSecret}` },
      }),
    );

    const rawEvents = await readFile(paths.eventsPath, "utf8");
    assert.doesNotMatch(rawEvents, new RegExp(commandSecret));
    assert.doesNotMatch(rawEvents, new RegExp(argsSecret));
    assert.doesNotMatch(rawEvents, new RegExp(metadataSecret));
    assert.match(rawEvents, /redacted/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("router persists metadata-only events without command or captured content", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "aesr-"));
  try {
    const secret = "PlainSecretValue123456789ABCDEFG";
    const { paths } = await runRouterWithPaths(
      dir,
      "s-meta",
      event({
        type: "tool-exception",
        command: `deploy --token ${secret}`,
        args: `TOKEN=${secret}`,
        stdout: `stdout ${secret}`,
        stderr: `stderr ${secret}`,
        diffHunks: [{ file: "src/x.ts", patch: `+token=${secret}` }],
        error: { message: `error ${secret}` },
      }),
      "metadata-only",
    );

    const rawEvents = await readFile(paths.eventsPath, "utf8");
    assert.doesNotMatch(rawEvents, new RegExp(secret));
    const stored = parseEventLines(rawEvents)[0];
    assert.ok(stored);
    assert.equal(stored.command, undefined);
    assert.equal(stored.args, undefined);
    assert.equal(stored.stdout, undefined);
    assert.equal(stored.stderr, undefined);
    assert.equal(stored.diffHunks, undefined);
    assert.equal(stored.error, undefined);
    assert.equal(stored.metadata?.["contentOmitted"], true);
    assert.equal(stored.metadata?.["commandOmitted"], true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("storage resolver uses external state root shape and stable project hash", () => {
  const cwd = path.join(tmpdir(), "project-a");
  const root = defaultStateRoot("halttrace", { XDG_STATE_HOME: path.join(tmpdir(), "state") });
  const paths = resolveStoragePaths({ cwd, sessionId: "session / unsafe", stateRoot: root, now: new Date("2026-05-30T00:00:00Z") });
  assert.equal(paths.projectHash, projectHash(cwd));
  assert.equal(paths.sessionId, "session-unsafe");
  assert.ok(paths.sessionDir.startsWith(root));
  assert.ok(paths.dumpPath.endsWith(".md"));
});

test("Claude adapter maps context, blocked, and ordinary failures without control decisions", () => {
  const context = claudeHookToAgentEvent(
    parseClaudeHookInput({
      hook_event_name: "PostToolUse",
      session_id: "s",
      cwd: "/tmp/work",
      tool_name: "Bash",
      tool_input: { command: "npm test" },
      tool_response: { exit_code: 1, stderr: "red" },
    }),
  );
  assert.equal(context.type, "tool-result");
  assert.equal(classifyTrigger(context), undefined);

  const denied = claudeHookToAgentEvent(
    parseClaudeHookInput({
      hook_event_name: "PermissionDenied",
      session_id: "s",
      cwd: "/tmp/work",
      tool_name: "Write",
      tool_input: { file_path: "src/x.ts" },
    }),
  );
  assert.equal(denied.type, "host-blocked");
  assert.equal(classifyTrigger(denied), "host-blocked");
  assert.equal(denied.metadata?.["hookEventName"], "PermissionDenied");

  const ordinaryFailure = claudeHookToAgentEvent(
    parseClaudeHookInput({
      hook_event_name: "PostToolUseFailure",
      session_id: "s",
      cwd: "/tmp/work",
      tool_name: "Bash",
      tool_input: { command: "npm test" },
      tool_response: { exit_code: 1, stderr: "red" },
    }),
  );
  assert.equal(ordinaryFailure.type, "tool-result");
  assert.equal(classifyTrigger(ordinaryFailure), undefined);

  const interrupted = claudeHookToAgentEvent(
    parseClaudeHookInput({
      hook_event_name: "StopFailure",
      session_id: "s",
      cwd: "/tmp/work",
      is_interrupt: true,
      error: "User stopped",
    }),
  );
  assert.equal(interrupted.type, "host-unrecoverable-error");
  assert.equal(interrupted.metadata?.["isInterrupt"], true);
  assert.equal(classifyTrigger(interrupted), undefined);

  const userReasonStop = claudeHookToAgentEvent(
    parseClaudeHookInput({
      hook_event_name: "StopFailure",
      session_id: "s",
      cwd: "/tmp/work",
      reason: "user",
      error: "User stopped",
    }),
  );
  assert.equal(userReasonStop.type, "host-unrecoverable-error");
  assert.equal(userReasonStop.metadata?.["stopReason"], "user");
  assert.equal(classifyTrigger(userReasonStop), undefined);

  const editFailure = claudeHookToAgentEvent(
    parseClaudeHookInput({
      hook_event_name: "PostToolUseFailure",
      session_id: "s",
      cwd: "/tmp/work",
      tool_name: "Edit",
      tool_input: { file_path: "src/x.ts" },
      error: "Patch did not apply",
    }),
  );
  assert.equal(editFailure.type, "edit-apply-failure");
  assert.equal(classifyTrigger(editFailure), "edit-apply-failure");

  const toolException = claudeHookToAgentEvent(
    parseClaudeHookInput({
      hook_event_name: "PostToolUseFailure",
      session_id: "s",
      cwd: "/tmp/work",
      tool_name: "Search",
      error: "Tool transport aborted",
    }),
  );
  assert.equal(toolException.type, "tool-exception");
  assert.equal(classifyTrigger(toolException), "tool-exception");
});

test("JSONL replay harness processes fixtures through the same router", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "aesr-"));
  try {
    const paths = resolveStoragePaths({ cwd: process.cwd(), sessionId: "replay", stateRoot: dir, now: new Date("2026-05-30T00:00:00Z") });
    const router = new AgentEventRouter({
      store: new FileEventStore({ eventsPath: paths.eventsPath, maxEvents: 20, maxBytes: 100_000 }),
      deduper: new IncidentDeduper(paths.incidentStatePath, 60_000),
      stateRoot: paths.stateRoot,
      projectHash: paths.projectHash,
      dumpMode: "rich-local",
      sinks: [new BacktraceSink({ stateRoot: paths.stateRoot, dumpPath: paths.dumpPath, dumpMode: "rich-local" })],
      now: () => new Date("2026-05-30T00:00:00Z"),
    });
    const fixture = [
      JSON.stringify(event({ id: "one", type: "tool-result", command: "npm test", exitCode: 1 })),
      JSON.stringify(event({ id: "two", type: "tool-exception", stderr: "boom" })),
    ].join("\n");
    const result = await replayJsonlText(fixture, router);
    assert.equal(result.events.length, 2);
    assert.equal(result.results[0]?.triggered, false);
    assert.equal(result.results[1]?.trigger, "tool-exception");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function runRouter(stateRoot: string, sessionId: string, input: AgentEvent, dumpMode: DumpMode = "rich-local") {
  const { result } = await runRouterWithPaths(stateRoot, sessionId, input, dumpMode);
  return result;
}

async function runRouterWithPaths(stateRoot: string, sessionId: string, input: AgentEvent, dumpMode: DumpMode = "rich-local") {
  const paths = resolveStoragePaths({
    cwd: input.cwd ?? process.cwd(),
    sessionId,
    stateRoot,
    now: new Date("2026-05-30T00:00:00Z"),
  });
  const store = new FileEventStore({ eventsPath: paths.eventsPath, maxEvents: 20, maxBytes: 100_000 });
  const deduper = new IncidentDeduper(paths.incidentStatePath, 60_000);
  const router = new AgentEventRouter({
    store,
    deduper,
    stateRoot: paths.stateRoot,
    projectHash: paths.projectHash,
    dumpMode,
    sinks: [new BacktraceSink({ stateRoot: paths.stateRoot, dumpPath: paths.dumpPath, dumpMode })],
    now: () => new Date("2026-05-30T00:00:00Z"),
  });
  const result = await router.process({ ...input, sessionId });
  return { result, paths };
}

function event(overrides: Partial<AgentEvent>): AgentEvent {
  return {
    id: overrides.id ?? "event-id",
    timestamp: overrides.timestamp ?? "2026-05-30T00:00:00.000Z",
    host: overrides.host ?? "test-host",
    sessionId: overrides.sessionId ?? "test-session",
    type: overrides.type ?? "tool-result",
    severity: overrides.severity ?? "info",
    cwd: overrides.cwd ?? process.cwd(),
    ...overrides,
  };
}
