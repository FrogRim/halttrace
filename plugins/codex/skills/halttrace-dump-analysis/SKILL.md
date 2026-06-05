---
name: halttrace-dump-analysis
description: "Analyze local HaltTrace dumps and produce a recovery plan or handoff prompt."
---

# HaltTrace Dump Analysis

Use this skill when the user asks to inspect a HaltTrace dump, recover from a halted AI coding-agent session, explain why a coding agent stopped, or prepare a handoff from a HaltTrace incident report.

## Workflow

1. Find the dump:
   - If the user gave a path, use that path.
   - Otherwise run `halttrace latest`.
   - If the project uses a non-default state root, include `--state-root <dir>`.
2. Summarize the dump:
   - Run `halttrace explain <dump>`.
   - Read the output before drawing conclusions.
3. Prepare continuation:
   - Run `halttrace handoff <dump>` when another agent or resumed session should continue.
   - Use the handoff as input, not as permission to bypass host policy.
4. Verify locally:
   - Inspect referenced files or rerun only the narrowest safe command if the dump lacks needed evidence.

## Safety Boundary

HaltTrace dump analysis is local diagnostic automation. Do not claim that it repairs code, retries failed actions, approves permissions, denies permissions, or guarantees redaction.

Do not send dump contents to a remote service unless the user explicitly asks and has reviewed the dump for sensitive content.
