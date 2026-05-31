import { randomUUID } from "node:crypto";
import { classifyTrigger } from "./trigger.js";
import { sanitizeEventForStorage } from "./privacy.js";
export class AgentEventRouter {
    #store;
    #deduper;
    #sinks;
    #stateRoot;
    #projectHash;
    #dumpMode;
    #now;
    constructor(options) {
        this.#store = options.store;
        this.#deduper = options.deduper;
        this.#sinks = options.sinks;
        this.#stateRoot = options.stateRoot;
        this.#projectHash = options.projectHash;
        this.#dumpMode = options.dumpMode;
        this.#now = options.now ?? (() => new Date());
    }
    async process(event) {
        const diagnostics = [];
        const storedEvent = sanitizeEventForStorage(event, { dumpMode: this.#dumpMode });
        await this.#store.append(storedEvent);
        await this.dispatchEvent(storedEvent, diagnostics);
        const trigger = classifyTrigger(storedEvent);
        if (trigger === undefined) {
            return { event: storedEvent, triggered: false, diagnostics };
        }
        const shouldDump = await this.#deduper.shouldDump(trigger, this.#now());
        if (!shouldDump) {
            return { event: storedEvent, triggered: true, trigger, deduped: true, diagnostics };
        }
        const snapshot = {
            id: randomUUID(),
            createdAt: this.#now().toISOString(),
            trigger,
            event: storedEvent,
            events: await this.#store.snapshot(),
            dumpMode: this.#dumpMode,
            projectHash: this.#projectHash,
            stateRoot: this.#stateRoot,
        };
        for (const sink of this.#sinks) {
            if (sink.handleIncident === undefined) {
                continue;
            }
            try {
                await sink.handleIncident(snapshot);
            }
            catch (error) {
                diagnostics.push({ message: `Sink failed: ${sink.id}`, error: error instanceof Error ? error.message : String(error) });
            }
        }
        return { event: storedEvent, triggered: true, trigger, diagnostics };
    }
    async dispatchEvent(event, diagnostics) {
        for (const sink of this.#sinks) {
            if (sink.handleEvent === undefined) {
                continue;
            }
            try {
                await sink.handleEvent(event);
            }
            catch (error) {
                diagnostics.push({ message: `Sink failed: ${sink.id}`, error: error instanceof Error ? error.message : String(error) });
            }
        }
    }
}
//# sourceMappingURL=router.js.map