import { createHash, randomUUID } from "node:crypto";
import { mkdir, realpath, lstat, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, platform as osPlatform } from "node:os";
import path from "node:path";
export function defaultStateRoot(appName = "halttrace", env = process.env) {
    const currentPlatform = osPlatform();
    if (currentPlatform === "win32") {
        return path.join(env["LOCALAPPDATA"] ?? path.join(homedir(), "AppData", "Local"), appName);
    }
    if (currentPlatform === "darwin") {
        return path.join(homedir(), "Library", "Logs", appName);
    }
    return path.join(env["XDG_STATE_HOME"] ?? path.join(homedir(), ".local", "state"), appName);
}
export function projectHash(cwd) {
    return createHash("sha256").update(path.resolve(cwd).toLowerCase()).digest("hex").slice(0, 16);
}
export function resolveStoragePaths(options) {
    const appName = options.appName ?? "halttrace";
    const stateRoot = path.resolve(options.stateRoot ?? defaultStateRoot(appName));
    const hash = projectHash(options.cwd);
    const safeSession = safeSegment(options.sessionId);
    const sessionDir = path.join(stateRoot, hash, safeSession);
    const incidentId = `${timestampSegment(options.now ?? new Date())}-${randomUUID()}`;
    return {
        appName,
        stateRoot,
        projectHash: hash,
        sessionId: safeSession,
        sessionDir,
        eventsPath: path.join(sessionDir, "events.jsonl"),
        incidentStatePath: path.join(sessionDir, "incident-state.json"),
        dumpPath: path.join(sessionDir, `${incidentId}.md`),
    };
}
export async function ensurePrivateDirectory(dir) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await chmodBestEffort(dir, 0o700);
}
export async function assertStateRootSafeForProject(projectCwd, stateRoot) {
    if (projectCwd === undefined || projectCwd.trim().length === 0) {
        return;
    }
    const lexicalProject = path.resolve(projectCwd);
    const lexicalStateRoot = path.resolve(stateRoot);
    if (isInsideOrSame(lexicalProject, lexicalStateRoot)) {
        throw new Error(`Refusing to write state inside project directory: ${stateRoot}`);
    }
    const resolvedProject = await resolveExistingOrParent(lexicalProject);
    const resolvedStateRoot = await resolveExistingOrParent(lexicalStateRoot);
    if (isInsideOrSame(resolvedProject, resolvedStateRoot)) {
        throw new Error(`Refusing to write state inside project directory after symlink resolution: ${stateRoot}`);
    }
    if (hasGitMetadata(resolvedStateRoot)) {
        throw new Error(`Refusing to write state inside git worktree: ${resolvedStateRoot}`);
    }
}
export async function assertSafeWritePath(root, target) {
    const resolvedRoot = await resolveExistingOrParent(root);
    const resolvedTargetParent = await resolveExistingOrParent(path.dirname(target));
    assertInside(resolvedRoot, resolvedTargetParent);
    const targetExists = existsSync(target);
    if (targetExists) {
        const targetStats = await lstat(target);
        if (targetStats.isSymbolicLink()) {
            throw new Error(`Refusing to write through symlink: ${target}`);
        }
    }
}
export function assertInside(root, target) {
    const relative = path.relative(path.resolve(root), path.resolve(target));
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`Path escapes state root: ${target}`);
    }
}
export async function chmodBestEffort(target, mode) {
    try {
        await chmod(target, mode);
    }
    catch {
        // Windows and some mounted filesystems may ignore POSIX modes.
    }
}
function safeSegment(value) {
    return value.replace(/[^A-Za-z0-9_.-]+/g, "-").slice(0, 96) || "session";
}
function timestampSegment(date) {
    return date.toISOString().replace(/[:.]/g, "-");
}
async function resolveExistingOrParent(input) {
    const resolved = path.resolve(input);
    if (existsSync(resolved)) {
        return realpath(resolved);
    }
    const parent = path.dirname(resolved);
    if (parent === resolved) {
        return resolved;
    }
    return resolveExistingOrParent(parent);
}
function hasGitMetadata(dir) {
    return existsSync(path.join(dir, ".git"));
}
function isInsideOrSame(root, target) {
    const relative = path.relative(path.resolve(root), path.resolve(target));
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
//# sourceMappingURL=storage.js.map