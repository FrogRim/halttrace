import type { AgentEvent, IncidentSnapshot } from "./types.js";

export interface EventSink {
  id: string;
  handleEvent?(event: AgentEvent): Promise<void> | void;
  handleIncident?(incident: IncidentSnapshot): Promise<void> | void;
}

export class SinkRegistry {
  readonly #sinks = new Map<string, EventSink>();

  register(sink: EventSink): void {
    if (this.#sinks.has(sink.id)) {
      throw new Error(`Sink already registered: ${sink.id}`);
    }
    this.#sinks.set(sink.id, sink);
  }

  list(): EventSink[] {
    return [...this.#sinks.values()];
  }
}
