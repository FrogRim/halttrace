export class SinkRegistry {
    #sinks = new Map();
    register(sink) {
        if (this.#sinks.has(sink.id)) {
            throw new Error(`Sink already registered: ${sink.id}`);
        }
        this.#sinks.set(sink.id, sink);
    }
    list() {
        return [...this.#sinks.values()];
    }
}
//# sourceMappingURL=sink.js.map