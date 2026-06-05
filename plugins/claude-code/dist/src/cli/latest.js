#!/usr/bin/env node
process.argv.splice(2, 0, "latest");
await import("./main.js");
export {};
//# sourceMappingURL=latest.js.map