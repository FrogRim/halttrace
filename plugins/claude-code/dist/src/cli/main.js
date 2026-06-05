#!/usr/bin/env node
import { env, cwd as processCwd } from "node:process";
import { findLatestDump, readDumpSummary, renderDoctor, renderExplanation, renderHandoff, runDumpDoctor } from "../core/dump-workflow.js";
async function main() {
    const parsed = parseArgs(process.argv.slice(2));
    switch (parsed.command) {
        case "latest":
            await latest(parsed.options);
            return;
        case "explain":
            await explain(parsed.positional[0], parsed.options);
            return;
        case "handoff":
            await handoff(parsed.positional[0], parsed.options);
            return;
        case "doctor":
            await doctor(parsed.positional[0], parsed.options);
            return;
        case "help":
        case "--help":
        case "-h":
            printHelp();
            return;
        default:
            throw new Error(`Unknown command: ${parsed.command}`);
    }
}
async function latest(options) {
    const dump = await findLatestDump(searchOptions(options));
    if (dump === undefined) {
        throw new Error("No HaltTrace dump found.");
    }
    if (options.json) {
        const summary = await readDumpSummary(dump.path);
        console.log(JSON.stringify({ ...summary, mtimeMs: dump.mtimeMs }, null, 2));
        return;
    }
    console.log(dump.path);
}
async function explain(dumpPath, options) {
    const summary = await summaryFor(dumpPath, options);
    if (options.json) {
        console.log(JSON.stringify(summary, null, 2));
        return;
    }
    console.log(renderExplanation(summary));
}
async function handoff(dumpPath, options) {
    const summary = await summaryFor(dumpPath, options);
    if (options.json) {
        console.log(JSON.stringify({ ...summary, handoff: renderHandoff(summary) }, null, 2));
        return;
    }
    console.log(renderHandoff(summary));
}
async function doctor(dumpPath, options) {
    const summary = await summaryFor(dumpPath, options);
    const report = runDumpDoctor(summary);
    if (options.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
    }
    console.log(renderDoctor(report));
}
async function summaryFor(dumpPath, options) {
    if (dumpPath !== undefined) {
        return readDumpSummary(dumpPath);
    }
    const dump = await findLatestDump(searchOptions(options));
    if (dump === undefined) {
        throw new Error("No HaltTrace dump found.");
    }
    return readDumpSummary(dump.path);
}
function parseArgs(args) {
    const command = args[0] ?? "help";
    const positional = [];
    const options = { json: false };
    for (let index = 1; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === undefined) {
            continue;
        }
        if (arg === "--json") {
            options.json = true;
            continue;
        }
        if (arg === "--state-root") {
            options.stateRoot = requireValue(args, index, arg);
            index += 1;
            continue;
        }
        if (arg === "--cwd") {
            options.cwd = requireValue(args, index, arg);
            index += 1;
            continue;
        }
        if (arg === "--project-hash") {
            options.projectHash = requireValue(args, index, arg);
            index += 1;
            continue;
        }
        if (arg === "--session") {
            options.sessionId = requireValue(args, index, arg);
            index += 1;
            continue;
        }
        if (arg.startsWith("--")) {
            throw new Error(`Unknown option: ${arg}`);
        }
        positional.push(arg);
    }
    return { command, positional, options };
}
function searchOptions(options) {
    const stateRoot = options.stateRoot ?? env["HALTTRACE_STATE_DIR"];
    return {
        ...(stateRoot === undefined ? {} : { stateRoot }),
        cwd: options.cwd ?? processCwd(),
        ...(options.projectHash === undefined ? {} : { projectHash: options.projectHash }),
        ...(options.sessionId === undefined ? {} : { sessionId: options.sessionId }),
    };
}
function requireValue(args, index, option) {
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
        throw new Error(`${option} requires a value`);
    }
    return value;
}
function printHelp() {
    console.log(`HaltTrace CLI

Usage:
  halttrace latest [--state-root <dir>] [--cwd <path>] [--project-hash <hash>] [--session <id>] [--json]
  halttrace explain [dump.md] [--state-root <dir>] [--cwd <path>] [--project-hash <hash>] [--session <id>] [--json]
  halttrace handoff [dump.md] [--state-root <dir>] [--cwd <path>] [--project-hash <hash>] [--session <id>] [--json]
  halttrace doctor [dump.md] [--state-root <dir>] [--cwd <path>] [--project-hash <hash>] [--session <id>] [--json]

Short bin aliases:
  halttrace-latest [options]
  halttrace-explain [dump.md] [options]
  halttrace-handoff [dump.md] [options]
  halttrace-doctor [dump.md] [options]

Commands:
  latest   Print the latest local HaltTrace dump path.
  explain  Summarize a dump into deterministic local triage.
  handoff  Generate a prompt for another agent to continue from the dump.
  doctor   Inspect the latest dump for local hook/storage/evidence health.

These commands only read local dump files. They do not repair code, control hosts, or send network traffic.`);
}
try {
    await main();
}
catch (error) {
    console.error(`[halttrace] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
}
//# sourceMappingURL=main.js.map