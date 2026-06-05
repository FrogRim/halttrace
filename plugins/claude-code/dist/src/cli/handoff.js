#!/usr/bin/env node
process.argv.splice(2, 0, "handoff");
await import("./main.js");
export {};
//# sourceMappingURL=handoff.js.map