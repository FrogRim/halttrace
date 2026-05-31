import { randomUUID } from "node:crypto";
import { cwd as processCwd } from "node:process";
import type { AgentEvent, AgentEventType, EventSeverity, JsonValue } from "../core/types.js";
import { isRecord, readNumber, readRecord, readString, stableStringify, toJsonValue } from "../core/json.js";

export interface CodexHookInput {
  hookEventName: string;
  sessionId: string;
  cwd: string;
  turnId?: string;
  toolUseId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResponse?: Record<string, unknown>;
  error?: string;
  raw: Record<string, unknown>;
}

export function parseCodexHookInput(input: Record<string, unknown>, fallbackCwd = processCwd()): CodexHookInput {
  const hookEventName = readString(input, "hook_event_name") ?? readString(input, "hookEventName") ?? readString(input, "event") ?? "unknown";
  const sessionId =
    readString(input, "session_id") ?? readString(input, "sessionId") ?? readString(input, "conversation_id") ?? "codex-session";
  const cwd = readString(input, "cwd") ?? readString(input, "workspace") ?? fallbackCwd;
  const output: CodexHookInput = {
    hookEventName,
    sessionId,
    cwd,
    raw: input,
  };
  const turnId = readString(input, "turn_id") ?? readString(input, "turnId");
  if (turnId !== undefined) {
    output.turnId = turnId;
  }
  const toolUseId = readString(input, "tool_use_id") ?? readString(input, "toolUseId");
  if (toolUseId !== undefined) {
    output.toolUseId = toolUseId;
  }
  const toolName = readString(input, "tool_name") ?? readString(input, "toolName");
  if (toolName !== undefined) {
    output.toolName = toolName;
  }
  const toolInput = readRecord(input, "tool_input") ?? readRecord(input, "toolInput");
  if (toolInput !== undefined) {
    output.toolInput = toolInput;
  }
  const toolResponse = readRecord(input, "tool_response") ?? readRecord(input, "toolResponse");
  if (toolResponse !== undefined) {
    output.toolResponse = toolResponse;
  }
  const error = readErrorMessage(input);
  if (error !== undefined) {
    output.error = error;
  }
  return output;
}

export function codexHookToAgentEvent(input: CodexHookInput): AgentEvent {
  const type = mapEventType(input);
  const severity = mapSeverity(type);
  const command = readString(input.toolInput ?? {}, "command") ?? readString(input.toolInput ?? {}, "cmd");
  const response = input.toolResponse ?? {};
  const exitCode = readNumber(response, "exit_code") ?? readNumber(response, "exitCode") ?? readNumber(response, "status");
  const stdout = readString(response, "stdout") ?? readString(response, "output");
  const stderr = readString(response, "stderr");
  const filePaths = collectFilePaths(input.toolInput, response);
  const errorMessage = input.error ?? readErrorMessage(response);
  const metadata = buildMetadata(input);
  const output: AgentEvent = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    host: "codex",
    sessionId: input.sessionId,
    cwd: input.cwd,
    type,
    severity,
    metadata,
  };
  if (input.toolName !== undefined) {
    output.toolName = input.toolName;
  }
  if (command !== undefined) {
    output.command = command;
  }
  if (input.toolInput !== undefined) {
    output.args = stableStringify(input.toolInput);
  }
  if (exitCode !== undefined) {
    output.exitCode = exitCode;
  }
  if (stdout !== undefined) {
    output.stdout = stdout;
  }
  if (stderr !== undefined) {
    output.stderr = stderr;
  }
  if (filePaths !== undefined) {
    output.filePaths = filePaths;
  }
  if (errorMessage !== undefined) {
    output.error = { message: errorMessage };
  }
  return output;
}

function mapEventType(input: CodexHookInput): AgentEventType {
  switch (input.hookEventName) {
    case "SessionStart":
      return "session-start";
    case "UserPromptSubmit":
      return "user-prompt";
    case "PreToolUse":
      return "tool-invocation";
    case "PermissionRequest":
      return "permission-request";
    case "PostToolUse":
      if (isCodexApplyPatchFailure(input)) {
        return "edit-apply-failure";
      }
      if (isCodexUnhandledToolException(input)) {
        return "tool-exception";
      }
      return "tool-result";
    case "Stop":
      return "turn-stop";
    case "SubagentStart":
      return "subagent-start";
    case "SubagentStop":
      return "subagent-stop";
    default:
      return "unknown";
  }
}

function mapSeverity(type: AgentEventType): EventSeverity {
  switch (type) {
    case "host-blocked":
    case "tool-exception":
    case "edit-apply-failure":
    case "host-unrecoverable-error":
      return "error";
    case "unknown":
      return "debug";
    default:
      return "info";
  }
}

function buildMetadata(input: CodexHookInput): Record<string, JsonValue> {
  const metadata: Record<string, JsonValue> = {
    hookEventName: input.hookEventName,
  };
  copyMetadata(input.raw, metadata, "transcript_path", "transcriptPath");
  copyMetadata(input.raw, metadata, "model", "model");
  copyMetadata(input.raw, metadata, "permission_mode", "permissionMode");
  copyMetadata(input.raw, metadata, "source", "source");
  copyMetadata(input.raw, metadata, "turn_id", "turnId");
  copyMetadata(input.raw, metadata, "tool_use_id", "toolUseId");
  copyMetadata(input.raw, metadata, "agent_id", "agentId");
  copyMetadata(input.raw, metadata, "agent_type", "agentType");
  copyMetadata(input.raw, metadata, "trigger", "trigger");
  copyMetadata(input.raw, metadata, "reason", "reason");
  copyMetadata(input.raw, metadata, "stopReason", "stopReason");
  copyMetadata(input.raw, metadata, "stop_hook_active", "stopHookActive");
  if (input.raw["last_assistant_message"] !== undefined || input.raw["lastAssistantMessage"] !== undefined) {
    metadata["lastAssistantMessagePresent"] = true;
  }
  return metadata;
}

function copyMetadata(source: Record<string, unknown>, target: Record<string, JsonValue>, sourceKey: string, targetKey: string): void {
  if (source[sourceKey] !== undefined) {
    target[targetKey] = toJsonValue(source[sourceKey]);
  }
}

function isCodexApplyPatchFailure(input: CodexHookInput): boolean {
  if (!isApplyPatchTool(input.toolName)) {
    return false;
  }
  if (input.error !== undefined) {
    return true;
  }
  const response = input.toolResponse ?? {};
  if (readBoolean(response, "success") === false || readBoolean(response, "ok") === false) {
    return true;
  }
  const exitCode = readNumber(response, "exit_code") ?? readNumber(response, "exitCode");
  if (exitCode !== undefined && exitCode !== 0) {
    return true;
  }
  const status = readString(response, "status") ?? readString(response, "outcome");
  return status === "failed" || status === "failure" || status === "error" || status === "exception" || status === "aborted";
}

function isCodexUnhandledToolException(input: CodexHookInput): boolean {
  if (input.toolName === "Bash") {
    return false;
  }
  const response = input.toolResponse ?? {};
  if (input.error !== undefined) {
    return true;
  }
  if (readBoolean(response, "exception") === true || readBoolean(response, "aborted") === true) {
    return true;
  }
  const status = readString(response, "status") ?? readString(response, "outcome");
  return status === "exception" || status === "aborted" || status === "panic";
}

function isApplyPatchTool(toolName: string | undefined): boolean {
  return toolName === "apply_patch" || toolName === "Edit" || toolName === "Write";
}

function readBoolean(source: Record<string, unknown>, key: string): boolean | undefined {
  const value = source[key];
  return typeof value === "boolean" ? value : undefined;
}

function readErrorMessage(source: Record<string, unknown> | undefined): string | undefined {
  if (source === undefined) {
    return undefined;
  }
  const direct = readString(source, "error") ?? readString(source, "message");
  if (direct !== undefined) {
    return direct;
  }
  const error = source["error"];
  if (isRecord(error)) {
    return readString(error, "message") ?? readString(error, "name");
  }
  return undefined;
}

function collectFilePaths(...sources: Array<Record<string, unknown> | undefined>): string[] | undefined {
  const files = new Set<string>();
  for (const source of sources) {
    if (source === undefined) {
      continue;
    }
    for (const key of ["file_path", "filePath", "path"]) {
      const value = source[key];
      if (typeof value === "string") {
        files.add(value);
      }
    }
    const nested = source["files"];
    if (Array.isArray(nested)) {
      for (const item of nested) {
        if (typeof item === "string") {
          files.add(item);
        } else if (isRecord(item)) {
          const file = readString(item, "path") ?? readString(item, "file_path") ?? readString(item, "filePath");
          if (file !== undefined) {
            files.add(file);
          }
        }
      }
    }
  }
  return files.size > 0 ? [...files] : undefined;
}
