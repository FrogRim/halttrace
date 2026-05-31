import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const source = resolve("dist/src");
const targets = [
  resolve("plugins/claude-code/dist/src"),
  resolve("plugins/codex/dist/src"),
];

for (const target of targets) {
  await rm(resolve(target, ".."), { recursive: true, force: true });
  await copyRuntimeJs(source, target);
}

async function copyRuntimeJs(sourceDir, targetDir) {
  await mkdir(targetDir, { recursive: true });
  const entries = await readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyRuntimeJs(sourcePath, targetPath);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) {
      await cp(sourcePath, targetPath, { force: true });
    }
  }
}
