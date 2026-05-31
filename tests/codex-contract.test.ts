import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyTrigger,
  codexHookToAgentEvent,
  parseCodexHookInput,
} from "../src/index.js";
import type { AgentEvent, AgentEventType } from "../src/index.js";

test("Codex lifecycle, permission, stop, and ordinary Bash events are context-only", () => {
  const cases: Array<{ name: string; input: Record<string, unknown>; type: AgentEventType }> = [
    {
      name: "session start",
      input: { hook_event_name: "SessionStart", source: "startup" },
      type: "session-start",
    },
    {
      name: "user prompt",
      input: { hook_event_name: "UserPromptSubmit", turn_id: "turn-1", prompt: "run tests" },
      type: "user-prompt",
    },
    {
      name: "bash pre tool",
      input: {
        hook_event_name: "PreToolUse",
        turn_id: "turn-1",
        tool_name: "Bash",
        tool_input: { command: "npm test" },
      },
      type: "tool-invocation",
    },
    {
      name: "permission request",
      input: {
        hook_event_name: "PermissionRequest",
        turn_id: "turn-1",
        tool_name: "Bash",
        tool_input: { command: "git push", description: "needs network" },
      },
      type: "permission-request",
    },
    {
      name: "ordinary failed bash post tool",
      input: {
        hook_event_name: "PostToolUse",
        turn_id: "turn-1",
        tool_name: "Bash",
        tool_input: { command: "npm test" },
        tool_response: { exit_code: 1, stderr: "test failed" },
      },
      type: "tool-result",
    },
    {
      name: "stop",
      input: { hook_event_name: "Stop", turn_id: "turn-1", stop_hook_active: false },
      type: "turn-stop",
    },
    {
      name: "subagent start",
      input: { hook_event_name: "SubagentStart", turn_id: "turn-1", agent_id: "a1", agent_type: "explore" },
      type: "subagent-start",
    },
    {
      name: "subagent stop",
      input: { hook_event_name: "SubagentStop", turn_id: "turn-1", agent_id: "a1", agent_type: "explore" },
      type: "subagent-stop",
    },
  ];

  for (const item of cases) {
    const mapped = codex(item.input);
    assert.equal(mapped.host, "codex", item.name);
    assert.equal(mapped.type, item.type, item.name);
    assert.equal(mapped.severity, "info", item.name);
    assert.equal(classifyTrigger(mapped), undefined, item.name);
  }
});

test("Codex anomaly dumps require explicit apply_patch or non-Bash exception signals", () => {
  const bashExceptionShape = codex({
    hook_event_name: "PostToolUse",
    tool_name: "Bash",
    tool_input: { command: "npm test" },
    tool_response: { exit_code: 1, exception: true, stderr: "failed" },
  });
  assert.equal(bashExceptionShape.type, "tool-result");
  assert.equal(classifyTrigger(bashExceptionShape), undefined);

  const applyPatchFailure = codex({
    hook_event_name: "PostToolUse",
    tool_name: "apply_patch",
    tool_input: { command: "*** Begin Patch\n*** Update File: src/x.ts" },
    tool_response: { success: false, error: "Patch did not apply", file_path: "src/x.ts" },
  });
  assert.equal(applyPatchFailure.type, "edit-apply-failure");
  assert.equal(classifyTrigger(applyPatchFailure), "edit-apply-failure");
  assert.deepEqual(applyPatchFailure.filePaths, ["src/x.ts"]);

  const mcpException = codex({
    hook_event_name: "PostToolUse",
    tool_name: "mcp__filesystem__read_file",
    tool_input: { path: "src/x.ts" },
    tool_response: { status: "exception", error: "MCP transport aborted" },
  });
  assert.equal(mcpException.type, "tool-exception");
  assert.equal(classifyTrigger(mcpException), "tool-exception");
});

function codex(input: Record<string, unknown>): AgentEvent {
  return codexHookToAgentEvent(
    parseCodexHookInput({
      session_id: "codex-contract-session",
      cwd: "/tmp/work",
      ...input,
    }),
  );
}