import type { AgentEvent, TriggerKind } from "./types.js";

export function classifyTrigger(event: AgentEvent): TriggerKind | undefined {
  switch (event.type) {
    case "host-blocked":
      return "host-blocked";
    case "tool-exception":
      return "tool-exception";
    case "edit-apply-failure":
      return "edit-apply-failure";
    case "host-unrecoverable-error":
      return isUserIntended(event) ? undefined : "host-unrecoverable-error";
    default:
      return undefined;
  }
}

export function isUserIntended(event: AgentEvent): boolean {
  return event.metadata?.["userIntended"] === true || event.metadata?.["isInterrupt"] === true || event.metadata?.["stopReason"] === "user";
}

export function isConsumableFeedback(event: AgentEvent): boolean {
  if (event.type !== "tool-result") {
    return false;
  }
  const tool = event.toolName?.toLowerCase() ?? "";
  const command = event.command?.toLowerCase() ?? "";
  return tool.includes("test") || command.includes("test") || command.includes("lint") || command.includes("typecheck");
}
