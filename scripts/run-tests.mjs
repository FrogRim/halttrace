import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const testRoot = path.join(process.cwd(), "dist", "tests");
const files = collectJsFiles(testRoot);
if (files.length === 0) {
  console.error(`No compiled tests found under ${testRoot}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(result.status ?? 1);

function collectJsFiles(dir) {
  const output = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      output.push(...collectJsFiles(fullPath));
    } else if (entry.endsWith(".js")) {
      output.push(fullPath);
    }
  }
  return output.sort();
}