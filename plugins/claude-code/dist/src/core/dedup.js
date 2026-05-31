import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
export class IncidentDeduper {
    #statePath;
    #cooldownMs;
    constructor(statePath, cooldownMs) {
        this.#statePath = statePath;
        this.#cooldownMs = cooldownMs;
    }
    async shouldDump(trigger, now) {
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
    async readState() {
        if (!existsSync(this.#statePath)) {
            return {};
        }
        const text = await readFile(this.#statePath, "utf8");
        const parsed = JSON.parse(text);
        if (typeof parsed !== "object" || parsed === null) {
            return {};
        }
        const candidate = parsed;
        const output = {};
        if (candidate.lastTrigger !== undefined) {
            output.lastTrigger = candidate.lastTrigger;
        }
        if (candidate.lastAt !== undefined) {
            output.lastAt = candidate.lastAt;
        }
        return output;
    }
}
//# sourceMappingURL=dedup.js.map