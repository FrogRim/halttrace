import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { defaultStateRoot, projectHash } from "./storage.js";
export async function findLatestDump(options = {}) {
    const parsed = parseSearchOptions(options);
    if (!existsSync(parsed.stateRoot)) {
        return undefined;
    }
    const files = await collectDumpFiles(parsed.stateRoot, parsed);
    files.sort((left, right) => right.mtimeMs - left.mtimeMs || right.path.localeCompare(left.path));
    return files[0];
}
export async function readDumpSummary(dumpPath) {
    const content = await readFile(dumpPath, "utf8");
    return parseDumpMarkdown(content, dumpPath);
}
export function parseDumpMarkdown(content, dumpPath) {
    const trigger = firstBullet(content, ["Trigger"]);
    const normalizedType = firstBullet(content, ["Normalized type", "Type"]);
    const eventType = firstBullet(content, ["Event type"]);
    const tool = firstBullet(content, ["Tool"]);
    const files = readFiles(content);
    const evidenceBlocks = readEvidenceBlocks(content);
    return {
        ...(dumpPath === undefined ? {} : { path: dumpPath }),
        ...optional("incidentId", firstBullet(content, ["Incident", "Incident ID"])),
        ...optional("trigger", trigger),
        ...optional("host", firstBullet(content, ["Host"])),
        ...optional("sessionId", firstBullet(content, ["Session"])),
        ...optional("projectHash", firstBullet(content, ["Project hash"])),
        ...optional("dumpMode", firstBullet(content, ["Dump mode"])),
        ...optional("cwd", firstBullet(content, ["CWD"])),
        ...optional("created", firstBullet(content, ["Created"])),
        ...optional("eventType", eventType),
        ...optional("normalizedType", normalizedType),
        ...optional("tool", tool),
        files,
        recentEventCount: countRecentEvents(content),
        evidenceBlocks,
        likelyCause: inferLikelyCause(trigger, normalizedType ?? eventType, tool),
        recommendedNextSteps: recommendedNextSteps(trigger, normalizedType ?? eventType),
    };
}
export function renderExplanation(summary) {
    const lines = [];
    lines.push("# HaltTrace Explanation");
    lines.push("");
    appendField(lines, "Dump", summary.path);
    appendField(lines, "Trigger", summary.trigger);
    appendField(lines, "Host", summary.host);
    appendField(lines, "Session", summary.sessionId);
    appendField(lines, "Tool", summary.tool);
    appendField(lines, "CWD", summary.cwd);
    if (summary.files.length > 0) {
        lines.push(`- Files: ${summary.files.map((file) => `\`${file}\``).join(", ")}`);
    }
    lines.push(`- Recent events captured: ${summary.recentEventCount}`);
    lines.push("");
    lines.push("## Likely Cause");
    lines.push("");
    lines.push(summary.likelyCause);
    lines.push("");
    if (summary.evidenceBlocks.length > 0) {
        lines.push("## Evidence Preview");
        lines.push("");
        for (const block of summary.evidenceBlocks) {
            lines.push(`### ${block.label}`);
            lines.push("");
            lines.push("```text");
            lines.push(block.preview);
            lines.push("```");
            lines.push("");
        }
    }
    lines.push("## Recommended Next Steps");
    lines.push("");
    summary.recommendedNextSteps.forEach((step, index) => {
        lines.push(`${index + 1}. ${step}`);
    });
    lines.push("");
    lines.push("This is deterministic local triage. It does not retry, repair, approve, deny, or send data anywhere.");
    lines.push("");
    return lines.join("\n");
}
export function renderHandoff(summary) {
    const lines = [];
    lines.push("# HaltTrace Handoff Prompt");
    lines.push("");
    lines.push("Use this local HaltTrace dump as the starting point for the next debugging pass.");
    lines.push("");
    appendField(lines, "Dump", summary.path);
    appendField(lines, "Trigger", summary.trigger);
    appendField(lines, "Host", summary.host);
    appendField(lines, "Session", summary.sessionId);
    appendField(lines, "Tool", summary.tool);
    if (summary.files.length > 0) {
        lines.push(`- Files: ${summary.files.map((file) => `\`${file}\``).join(", ")}`);
    }
    lines.push("");
    lines.push("## What Happened");
    lines.push("");
    lines.push(summary.likelyCause);
    lines.push("");
    lines.push("## Continue With This Instruction");
    lines.push("");
    lines.push("```text");
    lines.push("Read the HaltTrace dump above before making changes.");
    lines.push("Identify the failed step, the relevant file or command, and the smallest verification command.");
    lines.push("Do not assume the dump is complete; if evidence is missing, inspect the referenced files or rerun the narrowest safe command.");
    lines.push("Do not treat this as permission to approve, deny, retry, or auto-repair host actions.");
    lines.push("Produce a short recovery plan before editing.");
    lines.push("```");
    lines.push("");
    lines.push("## Suggested Checks");
    lines.push("");
    summary.recommendedNextSteps.forEach((step, index) => {
        lines.push(`${index + 1}. ${step}`);
    });
    lines.push("");
    return lines.join("\n");
}
export function runDumpDoctor(summary) {
    const checks = [
        dumpPathCheck(summary),
        hostCheck(summary),
        triggerCheck(summary),
        evidenceCheck(summary),
        dumpModeCheck(summary),
        storageLocationCheck(summary),
        projectHashCheck(summary),
        codexCoverageCheck(summary),
    ].filter((check) => check !== undefined);
    return {
        status: overallStatus(checks),
        dump: summary,
        checks,
        recommendedNextSteps: doctorNextSteps(summary, checks),
    };
}
export function renderDoctor(report) {
    const lines = [];
    lines.push("# HaltTrace Doctor");
    lines.push("");
    lines.push(`Overall status: ${report.status.toUpperCase()}`);
    appendField(lines, "Dump", report.dump.path);
    appendField(lines, "Host", report.dump.host);
    appendField(lines, "Trigger", report.dump.trigger);
    appendField(lines, "Session", report.dump.sessionId);
    appendField(lines, "CWD", report.dump.cwd);
    lines.push("");
    lines.push("## Checks");
    lines.push("");
    for (const check of report.checks) {
        lines.push(`- [${check.status.toUpperCase()}] ${check.message}`);
        if (check.detail !== undefined && check.detail.length > 0) {
            lines.push(`  ${check.detail}`);
        }
    }
    lines.push("");
    lines.push("## Recommended Next Steps");
    lines.push("");
    report.recommendedNextSteps.forEach((step, index) => {
        lines.push(`${index + 1}. ${step}`);
    });
    lines.push("");
    lines.push("Doctor only inspects local dump evidence. It does not mutate hook configuration, repair code, or send network traffic.");
    lines.push("");
    return lines.join("\n");
}
async function collectDumpFiles(root, options) {
    const output = [];
    await walk(root, output, options);
    return output;
}
async function walk(current, output, options) {
    let entries;
    try {
        entries = await readdir(current, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
            await walk(fullPath, output, options);
            continue;
        }
        if (!entry.isFile() || !entry.name.endsWith(".md")) {
            continue;
        }
        if (!matchesFilters(fullPath, options)) {
            continue;
        }
        try {
            const stats = await stat(fullPath);
            output.push({ path: fullPath, mtimeMs: stats.mtimeMs });
        }
        catch {
            // Ignore files that disappear during traversal.
        }
    }
}
function parseSearchOptions(options) {
    const stateRoot = path.resolve(options.stateRoot ?? defaultStateRoot());
    const hash = options.projectHash ?? (options.cwd === undefined ? undefined : projectHash(options.cwd));
    return {
        stateRoot,
        ...(hash === undefined ? {} : { projectHash: hash }),
        ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
    };
}
function matchesFilters(filePath, options) {
    const segments = filePath.split(path.sep);
    if (options.projectHash !== undefined && !segments.includes(options.projectHash)) {
        return false;
    }
    return options.sessionId === undefined || segments.includes(options.sessionId);
}
function firstBullet(content, labels) {
    for (const label of labels) {
        const escaped = escapeRegex(label);
        const pattern = new RegExp(`^- ${escaped}:\\s*(.+)$`, "im");
        const match = pattern.exec(content);
        if (match?.[1] !== undefined) {
            return stripInlineCode(match[1].trim());
        }
    }
    return undefined;
}
function readFiles(content) {
    const filesLine = firstBulletRaw(content, ["Files", "Path"]);
    if (filesLine === undefined) {
        return [];
    }
    const backtickMatches = [...filesLine.matchAll(/`([^`]+)`/g)].map((match) => match[1]).filter((value) => value !== undefined);
    if (backtickMatches.length > 0) {
        return backtickMatches;
    }
    return [stripInlineCode(filesLine.trim())].filter((value) => value.length > 0);
}
function firstBulletRaw(content, labels) {
    for (const label of labels) {
        const pattern = new RegExp(`^- ${escapeRegex(label)}:\\s*(.+)$`, "im");
        const match = pattern.exec(content);
        if (match?.[1] !== undefined) {
            return match[1].trim();
        }
    }
    return undefined;
}
function readEvidenceBlocks(content) {
    const output = [];
    const pattern = /^### ([^\n]+)\n\n```(?:text|diff)?\n([\s\S]*?)\n```/gm;
    for (const match of content.matchAll(pattern)) {
        const label = match[1];
        const body = match[2];
        if (label === undefined || body === undefined) {
            continue;
        }
        output.push({ label, preview: preview(body, 1200) });
    }
    return output;
}
function countRecentEvents(content) {
    const section = sectionBetween(content, ["Recent Events", "Recent Context"]);
    if (section === undefined) {
        return 0;
    }
    return section
        .split(/\r?\n/)
        .filter((line) => line.startsWith("|") && !line.includes("---") && !line.toLowerCase().includes("time |"))
        .length;
}
function sectionBetween(content, headings) {
    for (const heading of headings) {
        const pattern = new RegExp(`^## ${escapeRegex(heading)}\\s*$`, "im");
        const match = pattern.exec(content);
        if (match === null) {
            continue;
        }
        const start = match.index + match[0].length;
        const rest = content.slice(start);
        const next = /^## /m.exec(rest);
        return next === null ? rest : rest.slice(0, next.index);
    }
    return undefined;
}
function inferLikelyCause(trigger, eventType, tool) {
    const normalized = (trigger ?? eventType ?? "").toLowerCase();
    if (normalized.includes("host-blocked")) {
        return `The host blocked a ${tool ?? "tool"} action. The dump should be treated as evidence for why the action was blocked, not as approval to retry it.`;
    }
    if (normalized.includes("edit-apply-failure")) {
        return "A file edit or patch failed to apply. The likely cause is stale context, mismatched file contents, or an invalid patch hunk.";
    }
    if (normalized.includes("tool-exception")) {
        return "A supported tool call threw, aborted, or returned an explicit exception signal. The useful evidence is usually in the Error or stderr block.";
    }
    if (normalized.includes("host-unrecoverable-error")) {
        return "The host reported an unrecoverable stop that was distinguishable from a user-intended stop.";
    }
    return "The dump contains a halted-session backtrace, but the trigger type was not recognized by this deterministic explanation workflow.";
}
function recommendedNextSteps(trigger, eventType) {
    const normalized = (trigger ?? eventType ?? "").toLowerCase();
    if (normalized.includes("host-blocked")) {
        return [
            "Inspect the Tool, Files, Args, and stderr evidence before repeating the action.",
            "Confirm whether the host policy or user approval state intentionally blocked the action.",
            "If continuing, choose the smallest safe command or edit that avoids bypassing the host decision.",
        ];
    }
    if (normalized.includes("edit-apply-failure")) {
        return [
            "Open the referenced file and compare the current contents with the failed patch hunk.",
            "Rebuild the edit from fresh file context instead of replaying the stale patch blindly.",
            "Run the narrowest test or typecheck that covers the edited file after applying a fix.",
        ];
    }
    if (normalized.includes("tool-exception")) {
        return [
            "Read the Error and stderr previews first; they usually identify the failed tool boundary.",
            "Rerun only the smallest reproducer if the dump does not include enough evidence.",
            "Check whether the failure was environmental before changing source code.",
        ];
    }
    return [
        "Read the trigger event details and recent event table before making changes.",
        "Identify the smallest missing piece of evidence, then gather that evidence locally.",
        "Write a short recovery plan before editing or rerunning broad commands.",
    ];
}
function dumpPathCheck(summary) {
    return summary.path === undefined
        ? { id: "dump-path", status: "warn", message: "No dump path was provided in the parsed summary." }
        : { id: "dump-path", status: "pass", message: "Dump path is available.", detail: summary.path };
}
function hostCheck(summary) {
    if (summary.host === undefined) {
        return { id: "host", status: "warn", message: "Dump does not identify a host adapter." };
    }
    if (summary.host === "claude-code" || summary.host === "codex") {
        return { id: "host", status: "pass", message: `Host adapter is recognized: ${summary.host}.` };
    }
    return { id: "host", status: "warn", message: `Host adapter is not recognized by doctor: ${summary.host}.` };
}
function triggerCheck(summary) {
    if (summary.trigger === undefined) {
        return { id: "trigger", status: "warn", message: "Dump does not include a trigger field." };
    }
    return { id: "trigger", status: "pass", message: `Trigger is present: ${summary.trigger}.` };
}
function evidenceCheck(summary) {
    if (summary.evidenceBlocks.length > 0) {
        return {
            id: "evidence",
            status: "pass",
            message: `Dump includes ${summary.evidenceBlocks.length} evidence block(s).`,
        };
    }
    if (summary.recentEventCount > 0) {
        return {
            id: "evidence",
            status: "warn",
            message: "Dump has recent event context but no fenced evidence blocks.",
            detail: "Hook wiring likely captured metadata, but stderr/stdout/error payloads may be unavailable or omitted.",
        };
    }
    return {
        id: "evidence",
        status: "warn",
        message: "Dump does not include recent events or evidence blocks.",
        detail: "Verify hook activation and dump mode before relying on this report.",
    };
}
function dumpModeCheck(summary) {
    if (summary.dumpMode === "metadata-only") {
        return {
            id: "dump-mode",
            status: "warn",
            message: "Dump mode is metadata-only.",
            detail: "This is safer for sensitive contexts but limits root-cause evidence.",
        };
    }
    if (summary.dumpMode === "rich-local") {
        return { id: "dump-mode", status: "pass", message: "Dump mode is rich-local." };
    }
    return { id: "dump-mode", status: "warn", message: "Dump mode is missing or unrecognized." };
}
function storageLocationCheck(summary) {
    if (summary.path === undefined) {
        return { id: "storage-location", status: "warn", message: "Cannot verify storage location without a dump path." };
    }
    if (summary.cwd === undefined) {
        return {
            id: "storage-location",
            status: "warn",
            message: "Cannot compare dump storage against project root because CWD is missing.",
        };
    }
    return isInsideOrSame(summary.cwd, summary.path)
        ? {
            id: "storage-location",
            status: "fail",
            message: "Dump appears to be stored inside the project checkout.",
            detail: "HaltTrace's default safety model keeps state outside the repository.",
        }
        : { id: "storage-location", status: "pass", message: "Dump path is outside the recorded project CWD." };
}
function projectHashCheck(summary) {
    if (summary.path === undefined || summary.projectHash === undefined) {
        return undefined;
    }
    return summary.path.split(path.sep).includes(summary.projectHash)
        ? { id: "project-hash", status: "pass", message: "Dump path includes the recorded project hash." }
        : {
            id: "project-hash",
            status: "warn",
            message: "Dump path does not include the recorded project hash.",
            detail: "This can happen with sample reports, copied dumps, or custom storage layouts.",
        };
}
function codexCoverageCheck(summary) {
    if (summary.host !== "codex") {
        return undefined;
    }
    return {
        id: "codex-coverage",
        status: "warn",
        message: "Codex hook coverage is experimental and build-sensitive.",
        detail: "If only lifecycle, permission, stop, or ordinary Bash events are captured, HaltTrace may record context without producing dumps.",
    };
}
function doctorNextSteps(summary, checks) {
    const steps = [...summary.recommendedNextSteps];
    if (checks.some((check) => check.id === "storage-location" && check.status === "fail")) {
        steps.unshift("Move HaltTrace state outside the project checkout and rerun the failing scenario.");
    }
    if (checks.some((check) => check.id === "dump-mode" && check.status === "warn")) {
        steps.push("Use rich-local mode for local debugging when sensitive-content risk is acceptable.");
    }
    if (checks.some((check) => check.id === "codex-coverage")) {
        steps.push("Verify the active Codex build emits the hook event type needed for this trigger.");
    }
    return [...new Set(steps)];
}
function overallStatus(checks) {
    if (checks.some((check) => check.status === "fail")) {
        return "fail";
    }
    if (checks.some((check) => check.status === "warn")) {
        return "warn";
    }
    return "pass";
}
function isInsideOrSame(root, target) {
    const relative = path.relative(path.resolve(root), path.resolve(target));
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
function appendField(lines, label, value) {
    if (value !== undefined && value.length > 0) {
        lines.push(`- ${label}: ${value}`);
    }
}
function stripInlineCode(value) {
    return value.replace(/^`/, "").replace(/`$/, "");
}
function preview(value, max) {
    const trimmed = value.trim();
    return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}...`;
}
function optional(key, value) {
    return value === undefined ? {} : { [key]: value };
}
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
//# sourceMappingURL=dump-workflow.js.map