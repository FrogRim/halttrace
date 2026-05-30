import { randomUUID } from "node:crypto";
import { cwd as processCwd } from "node:process";
import type { AgentEvent, AgentEventType, EventSeverity, JsonValue } from "../core/types.js";
import { isRecord, readNumber, readRecord, readString, stableStringify, toJsonValue } from "../core/json.js";

export interface ClaudeHookInput {
  hookEventName: string;
  sessionId: string;
  cwd: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResponse?: Record<string, unknown>;
  error?: string;
  raw: Record<string, unknown>;
}

export function parseClaudeHookInput(input: Record<string, unknown>, fallbackCwd = processCwd()): ClaudeHookInput {
  const hookEventName = readString(input, "hook_event_name") ?? readString(input, "hookEventName") ?? readString(input, "event") ?? "unknown";
  const sessionId =
    readString(input, "session_id") ?? readString(input, "sessionId") ?? readString(input, "conversation_id") ?? "claude-session";
  const cwd = readString(input, "cwd") ?? readString(input, "workspace") ?? fallbackCwd;
  const output: ClaudeHookInput = {
    hookEventName,
    sessionId,
    cwd,
    raw: input,
  };
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
  const error = readString(input, "error") ?? readString(input, "message");
  if (error !== undefined) {
    output.error = error;
  }
  return output;
}

export function claudeHookToAgentEvent(input: ClaudeHookInput): AgentEvent {
  const type = mapEventType(input);
  const severity = mapSeverity(type);
  const command = readString(input.toolInput ?? {}, "command") ?? readString(input.toolInput ?? {}, "cmd");
  const response = input.toolResponse ?? {};
  const exitCode = readNumber(response, "exit_code") ?? readNumber(response, "exitCode") ?? readNumber(response, "status");
  const stdout = readString(response, "stdout") ?? readString(response, "output");
  const stderr = readString(response, "stderr");
  const filePaths = collectFilePaths(input.toolInput, response);
  const metadata: Record<string, JsonValue> = {
    hookEventName: input.hookEventName,
  };
  if (input.raw["transcript_path"] !== undefined) {
    metadata["transcriptPath"] = toJsonValue(input.raw["transcript_path"]);
  }
  if (input.raw["reason"] !== undefined) {
    metadata["reason"] = toJsonValue(input.raw["reason"]);
    if (typeof input.raw["reason"] === "string") {
      metadata["stopReason"] = input.raw["reason"];
    }
  }
  const isInterrupt = input.raw["is_interrupt"] === true || input.raw["isInterrupt"] === true;
  if (isInterrupt) {
    metadata["isInterrupt"] = true;
    metadata["userIntended"] = true;
  }
  if (input.raw["reason"] === "user") {
    metadata["userIntended"] = true;
  }
  const output: AgentEvent = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    host: "claude-code",
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
  if (input.error !== undefined) {
    output.error = { message: input.error };
  }
  return output;
}

function mapEventType(input: ClaudeHookInput): AgentEventType {
  if (input.hookEventName === "PreToolUse") {
    return "tool-invocation";
  }
  if (input.hookEventName === "PostToolUse") {
    return "tool-result";
  }
  if (input.hookEventName === "PermissionDenied") {
    return "host-blocked";
  }
  if (input.hookEventName === "PostToolUseFailure") {
    if (input.raw["is_interrupt"] === true || input.raw["isInterrupt"] === true) {
      return "tool-result";
    }
    if (isOrdinaryCommandFailure(input)) {
      return "tool-result";
    }
    if (isEditTool(input.toolName)) {
      return "edit-apply-failure";
    }
    if (input.error !== undefined) {
      return "tool-exception";
    }
    return "unknown";
  }
  if (input.hookEventName === "StopFailure") {
    return "host-unrecoverable-error";
  }
  if (input.hookEventName === "SessionEnd") {
    return "session-end";
  }
  return "unknown";
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

function isEditTool(toolName: string | undefined): boolean {
  return toolName === "Edit" || toolName === "MultiEdit" || toolName === "Write";
}

function isOrdinaryCommandFailure(input: ClaudeHookInput): boolean {
  const command = readString(input.toolInput ?? {}, "command") ?? readString(input.toolInput ?? {}, "cmd");
  return input.toolName === "Bash" || command !== undefined;
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
