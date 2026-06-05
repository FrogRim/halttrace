#!/usr/bin/env node
process.argv.splice(2, 0, "explain");
await import("./main.js");
export {};
//# sourceMappingURL=explain.js.map