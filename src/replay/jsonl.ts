import { readFile } from "node:fs/promises";
import { parseEventLines } from "../core/event-store.js";
import { AgentEventRouter } from "../core/router.js";
import type { AgentEvent, RouterResult } from "../core/types.js";

export interface ReplayResult {
  events: AgentEvent[];
  results: RouterResult[];
}

export async function replayJsonlFile(path: string, router: AgentEventRouter): Promise<ReplayResult> {
  const text = await readFile(path, "utf8");
  return replayJsonlText(text, router);
}

export async function replayJsonlText(text: string, router: AgentEventRouter): Promise<ReplayResult> {
  const events = parseEventLines(text);
  const results: RouterResult[] = [];
  for (const event of events) {
    results.push(await router.process(event));
  }
  return { events, results };
}
