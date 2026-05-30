import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { TriggerKind } from "./types.js";

interface IncidentState {
  lastTrigger?: TriggerKind;
  lastAt?: string;
}

export class IncidentDeduper {
  readonly #statePath: string;
  readonly #cooldownMs: number;

  constructor(statePath: string, cooldownMs: number) {
    this.#statePath = statePath;
    this.#cooldownMs = cooldownMs;
  }

  async shouldDump(trigger: TriggerKind, now: Date): Promise<boolean> {
    const state = await this.readState();
    if (state.lastAt !== undefined && state.lastTrigger === trigger) {
      const elapsed = now.getTime() - new Date(state.lastAt).getTime();
      if (elapsed >= 0 && elapsed < this.#cooldownMs) {
        return false;
      }
    }
    await writeFile(this.#statePath, JSON.stringify({ lastTrigger: trigger, lastAt: now.toISOString() }), {
      encoding: "utf8",
      mode: 0o600,
    });
    return true;
  }

  async readState(): Promise<IncidentState> {
    if (!existsSync(this.#statePath)) {
      return {};
    }
    const text = await readFile(this.#statePath, "utf8");
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }
    const candidate = parsed as Partial<IncidentState>;
    const output: IncidentState = {};
    if (candidate.lastTrigger !== undefined) {
      output.lastTrigger = candidate.lastTrigger;
    }
    if (candidate.lastAt !== undefined) {
      output.lastAt = candidate.lastAt;
    }
    return output;
  }
}
