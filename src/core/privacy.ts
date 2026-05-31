import type { AgentEvent, DiffHunk, DumpMode, EventError, JsonValue } from "./types.js";
import { redactAndTruncate } from "./redaction.js";

export interface PrivacyPolicyOptions {
  dumpMode: DumpMode;
  argsMaxChars?: number;
  stdoutTailChars?: number;
  stderrTailChars?: number;
  diffMaxChars?: number;
}

const METADATA_MAX_CHARS = 2000;

export function sanitizeEventForStorage(event: AgentEvent, options: PrivacyPolicyOptions): AgentEvent {
  const base = copyMetadataOnlyFields(event);
  if (options.dumpMode === "metadata-only") {
    return {
      ...base,
      metadata: {
        ...(base.metadata ?? {}),
        contentMode: "metadata-only",
        contentOmitted: true,
        commandOmitted: event.command !== undefined,
      },
    };
  }

  const command = redactAndTruncate(event.command, options.argsMaxChars ?? 2000, "command")?.text;
  const args = redactAndTruncate(event.args, options.argsMaxChars ?? 2000, "args")?.text;
  const stdout = redactAndTruncate(event.stdout, options.stdoutTailChars ?? 4000, "stdout")?.text;
  const stderr = redactAndTruncate(event.stderr, options.stderrTailChars ?? 12000, "stderr")?.text;
  const error = sanitizeError(event.error, options.stderrTailChars ?? 12000);
  const diffHunks = sanitizeDiffHunks(event.diffHunks, options.diffMaxChars ?? 8000);
  const output: AgentEvent = { ...base };
  if (command !== undefined) {
    output.command = command;
  }
  if (args !== undefined) {
    output.args = args;
  }
  if (stdout !== undefined) {
    output.stdout = stdout;
  }
  if (stderr !== undefined) {
    output.stderr = stderr;
  }
  if (error !== undefined) {
    output.error = error;
  }
  if (diffHunks !== undefined) {
    output.diffHunks = diffHunks;
  }
  return output;
}

function copyMetadataOnlyFields(event: AgentEvent): AgentEvent {
  const output: AgentEvent = {
    id: event.id,
    timestamp: event.timestamp,
    host: event.host,
    sessionId: event.sessionId,
    type: event.type,
    severity: event.severity,
  };
  if (event.sequence !== undefined) {
    output.sequence = event.sequence;
  }
  if (event.cwd !== undefined) {
    output.cwd = sanitizeMetadataString(event.cwd, "path");
  }
  if (event.toolName !== undefined) {
    output.toolName = event.toolName;
  }
  if (event.exitCode !== undefined) {
    output.exitCode = event.exitCode;
  }
  if (event.filePaths !== undefined) {
    output.filePaths = event.filePaths.map((file) => sanitizeMetadataString(file, "path"));
  }
  if (event.metadata !== undefined) {
    output.metadata = sanitizeMetadata(event.metadata);
  }
  return output;
}

function sanitizeMetadata(metadata: Record<string, JsonValue>): Record<string, JsonValue> {
  const output: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(metadata)) {
    output[key] = sanitizeJsonValue(value);
  }
  return output;
}

function sanitizeJsonValue(value: JsonValue): JsonValue {
  if (typeof value === "string") {
    return sanitizeMetadataString(value, "metadata");
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeJsonValue(item));
  }
  if (typeof value === "object" && value !== null) {
    const output: Record<string, JsonValue> = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = sanitizeJsonValue(nested);
    }
    return output;
  }
  return value;
}

function sanitizeError(error: EventError | undefined, maxChars: number): EventError | undefined {
  if (error === undefined) {
    return undefined;
  }
  const message = redactAndTruncate(error.message, maxChars, "error")?.text ?? "";
  const output: EventError = { message };
  if (error.name !== undefined) {
    output.name = error.name;
  }
  const stack = redactAndTruncate(error.stack, maxChars, "error")?.text;
  if (stack !== undefined) {
    output.stack = stack;
  }
  return output;
}

function sanitizeDiffHunks(hunks: DiffHunk[] | undefined, maxChars: number): DiffHunk[] | undefined {
  if (hunks === undefined) {
    return undefined;
  }
  return hunks.map((hunk) => {
    const output: DiffHunk = { file: sanitizeMetadataString(hunk.file, "path") };
    if (hunk.hunkHeader !== undefined) {
      output.hunkHeader = hunk.hunkHeader;
    }
    if (hunk.startLine !== undefined) {
      output.startLine = hunk.startLine;
    }
    const patch = redactAndTruncate(hunk.patch, maxChars, "diff")?.text;
    if (patch !== undefined) {
      output.patch = patch;
    }
    return output;
  });
}

function sanitizeMetadataString(value: string, label: string): string {
  return redactAndTruncate(value, METADATA_MAX_CHARS, label)?.text ?? "";
}
