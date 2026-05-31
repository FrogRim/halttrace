import { readFile } from "node:fs/promises";
import { parseEventLines } from "../core/event-store.js";
export async function replayJsonlFile(path, router) {
    const text = await readFile(path, "utf8");
    return replayJsonlText(text, router);
}
export async function replayJsonlText(text, router) {
    const events = parseEventLines(text);
    const results = [];
    for (const event of events) {
        results.push(await router.process(event));
    }
    return { events, results };
}
//# sourceMappingURL=jsonl.js.map