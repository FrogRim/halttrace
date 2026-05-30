export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type AgentEventType =
  | "tool-invocation"
  | "tool-result"
  | "host-blocked"
  | "tool-exception"
  | "edit-apply-failure"
  | "host-unrecoverable-error"
  | "session-end"
  | "unknown";

export type EventSeverity = "trace" | "debug" | "info" | "warn" | "error" | "critical";

export type TriggerKind =
  | "host-blocked"
  | "tool-exception"
  | "edit-apply-failure"
  | "host-unrecoverable-error";

export type DumpMode = "rich-local" | "metadata-only";

export interface DiffHunk {
  file: string;
  hunkHeader?: string;
  startLine?: number;
  patch?: string;
}

export interface EventError {
  message: string;
  name?: string;
  stack?: string;
}

export interface AgentEvent {
  id: string;
  timestamp: string;
  host: string;
  sessionId: string;
  type: AgentEventType;
  severity: EventSeverity;
  sequence?: number;
  cwd?: string;
  toolName?: string;
  command?: string;
  args?: string;
  exitCode?: number;
  filePaths?: string[];
  stdout?: string;
  stderr?: string;
  diffHunks?: DiffHunk[];
  error?: EventError;
  metadata?: Record<string, JsonValue>;
}

export interface IncidentSnapshot {
  id: string;
  createdAt: string;
  trigger: TriggerKind;
  event: AgentEvent;
  events: AgentEvent[];
  dumpMode: DumpMode;
  projectHash: string;
  stateRoot: string;
}

export interface RouterDiagnostic {
  message: string;
  error?: string;
}

export interface RouterResult {
  event: AgentEvent;
  triggered: boolean;
  trigger?: TriggerKind;
  deduped?: boolean;
  diagnostics: RouterDiagnostic[];
}
