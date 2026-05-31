import { appendFile, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { ensurePrivateDirectory } from "./storage.js";
export class FileEventStore {
    #eventsPath;
    #maxEvents;
    #maxBytes;
    constructor(options) {
        this.#eventsPath = options.eventsPath;
        this.#maxEvents = options.maxEvents;
        this.#maxBytes = options.maxBytes;
    }
    async append(event) {
        await ensurePrivateDirectory(path.dirname(this.#eventsPath));
        await withFileLock(`${this.#eventsPath}.lock`, async () => {
            await appendFile(this.#eventsPath, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
            await this.prune();
        });
    }
    async snapshot() {
        if (!existsSync(this.#eventsPath)) {
            return [];
        }
        const text = await readFile(this.#eventsPath, "utf8");
        return parseEventLines(text).slice(-this.#maxEvents);
    }
    async prune() {
        const events = await this.snapshot();
        const retained = [];
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
async function withFileLock(lockPath, action) {
    const started = Date.now();
    while (true) {
        try {
            const handle = await open(lockPath, "wx", 0o600);
            try {
                return await action();
            }
            finally {
                await handle.close();
                await rm(lockPath, { force: true });
            }
        }
        catch (error) {
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
function isFileExistsError(error) {
    return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export function parseEventLines(text) {
    const events = [];
    for (const line of text.split(/\r?\n/)) {
        if (line.trim().length === 0) {
            continue;
        }
        const parsed = JSON.parse(line);
        if (isAgentEvent(parsed)) {
            events.push(parsed);
        }
    }
    return events;
}
function isAgentEvent(value) {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const candidate = value;
    return (typeof candidate.id === "string" &&
        typeof candidate.timestamp === "string" &&
        typeof candidate.host === "string" &&
        typeof candidate.sessionId === "string" &&
        typeof candidate.type === "string" &&
        typeof candidate.severity === "string");
}
//# sourceMappingURL=event-store.js.map