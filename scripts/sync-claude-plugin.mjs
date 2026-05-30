import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve("dist/src");
const target = resolve("plugins/claude-code/dist");

await rm(target, { recursive: true, force: true });
await mkdir(resolve(target, "src"), { recursive: true });
await cp(source, resolve(target, "src"), { recursive: true, force: true });