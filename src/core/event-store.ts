import { appendFile, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { AgentEvent } from "./types.js";
import { ensurePrivateDirectory } from "./storage.js";

export interface EventStoreOptions {
  eventsPath: string;
  maxEvents: number;
  maxBytes: number;
}

export class FileEventStore {
  readonly #eventsPath: string;
  readonly #maxEvents: number;
  readonly #maxBytes: number;

  constructor(options: EventStoreOptions) {
    this.#eventsPath = options.eventsPath;
    this.#maxEvents = options.maxEvents;
    this.#maxBytes = options.maxBytes;
  }

  async append(event: AgentEvent): Promise<void> {
    await ensurePrivateDirectory(path.dirname(this.#eventsPath));
    await withFileLock(`${this.#eventsPath}.lock`, async () => {
      await appendFile(this.#eventsPath, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
      await this.prune();
    });
  }

  async snapshot(): Promise<AgentEvent[]> {
    if (!existsSync(this.#eventsPath)) {
      return [];
    }
    const text = await readFile(this.#eventsPath, "utf8");
    return parseEventLines(text).slice(-this.#maxEvents);
  }

  async prune(): Promise<void> {
    const events = await this.snapshot();
    const retained: AgentEvent[] = [];
    let bytes = 0;
    for (const event of [...events].reverse()) {
      const lineBytes = Buffer.byteLength(JSON.stringify(event), "utf8") + 1;
      if (retained.length >= this.#maxEvents || bytes + lineBytes > this.#maxBytes) {
        break;
      }
      retained.push(event);
      bytes += lineBytes;
    }
    const output = retained.reverse().map((event) => JSON.stringify(event)).join("\n");
    const tempPath = `${this.#eventsPath}.tmp`;
    await writeFile(tempPath, output.length > 0 ? `${output}\n` : "", { encoding: "utf8", mode: 0o600 });
    await rename(tempPath, this.#eventsPath);
  }
}

async function withFileLock<T>(lockPath: string, action: () => Promise<T>): Promise<T> {
  const started = Date.now();
  while (true) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      try {
        return await action();
      } finally {
        await handle.close();
        await rm(lockPath, { force: true });
      }
    } catch (error) {
      if (!isFileExistsError(error)) {
        throw error;
      }
      if (Date.now() - started > 10_000) {
        await rm(lockPath, { force: true });
        continue;
      }
      await sleep(25);
    }
  }
}

function isFileExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parseEventLines(text: string): AgentEvent[] {
  const events: AgentEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length === 0) {
      continue;
    }
    const parsed: unknown = JSON.parse(line);
    if (isAgentEvent(parsed)) {
      events.push(parsed);
    }
  }
  return events;
}

function isAgentEvent(value: unknown): value is AgentEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<AgentEvent>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.timestamp === "string" &&
    typeof candidate.host === "string" &&
    typeof candidate.sessionId === "string" &&
    typeof candidate.type === "string" &&
    typeof candidate.severity === "string"
  );
}
