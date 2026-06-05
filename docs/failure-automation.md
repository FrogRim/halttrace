# Failure Automation Workflow

HaltTrace has two layers:

1. The observer plugin captures local incident dumps when a supported host anomaly is observed.
2. The dump workflow reads those Markdown dumps and turns them into deterministic triage, a handoff prompt, or a local health report.
3. The packaged Claude/Codex skill can wrap those commands in a single recovery goal and produce an evidence-backed recovery plan.

This is local AI-agent failure automation, not automatic repair. The workflow automates evidence discovery, summary, handoff packaging, dump-health inspection, and recovery-plan drafting. It does not approve, deny, retry, edit files, mutate hook configuration, call an AI provider, or send network traffic.

## Commands

```sh
halttrace latest
halttrace explain
halttrace handoff
halttrace doctor
```

`[dump.md]` is optional for `explain`, `handoff`, and `doctor`; omitted dump paths resolve to the latest matching dump.

Short npm bin aliases:

```sh
halttrace-latest
halttrace-explain
halttrace-handoff
halttrace-doctor
```

PowerShell C++-style aliases for the current session:

```powershell
Import-Module ./scripts/halttrace-powershell-aliases.psm1
halttrace:explain
halttrace:handoff
halttrace:doctor
```

Use `--state-root <dir>` when reading from a non-default HaltTrace state directory. Use `--cwd <path>` to filter to the project hash for a specific checkout, and `--session <id>` to filter to one agent session.

```sh
halttrace latest --state-root ./tmp-state --cwd .
halttrace explain ./incident.md
halttrace handoff --state-root ./tmp-state --cwd . --session session-one
halttrace doctor --state-root ./tmp-state --cwd .
```

All commands support `--json`.

## What `explain` Does

`halttrace explain` parses the Markdown dump and prints:

- incident metadata
- trigger, host, session, tool, cwd, and files when available
- recent event count
- likely cause based on the trigger class
- evidence previews from fenced dump blocks
- recommended next local checks

The explanation is deterministic. It is intentionally narrower than an LLM review so it can run locally without provider setup.

## What `handoff` Does

`halttrace handoff` generates a prompt that another agent can use to continue from the dump. It tells the next agent to read the dump first, identify the failed step, avoid treating the dump as permission to bypass host decisions, and produce a recovery plan before editing.

## What `doctor` Does

`halttrace doctor` inspects a dump for local hook and evidence health:

- recognized host adapter
- trigger presence
- evidence block and recent-event availability
- dump mode
- storage location relative to the recorded project CWD
- project-hash path consistency
- Codex experimental coverage caveat when applicable

The command reports `PASS`, `WARN`, or `FAIL` checks and suggested next local actions. It does not edit configuration or run hook activation tests.

## Recommended Agent Flow

1. Run `halttrace latest` to find the newest dump.
2. Run `halttrace explain` or `halttrace:explain` to orient yourself.
3. Run `halttrace handoff` or `halttrace:handoff` when another agent or a resumed session should continue.
4. Run `halttrace doctor` or `halttrace:doctor` if the dump looks incomplete, metadata-only, or environment-specific.
5. Inspect referenced files or rerun the narrowest safe command only when the dump does not contain enough evidence.

## Goal-Mode Skill Flow

The packaged `halttrace-dump-analysis` skill is available in both `plugins/claude-code` and `plugins/codex`.

When a user asks to recover from a HaltTrace dump, the skill should:

1. Create or track one goal: `Analyze the HaltTrace dump and produce a verified recovery plan.`
2. Locate the dump with the user-provided path or `halttrace latest`.
3. Run `halttrace explain` and `halttrace doctor` unless a specific dump path was provided.
4. Run `halttrace handoff` if continuation by another agent is relevant.
5. Write a recovery plan with dump path, likely cause, evidence, recovery steps, verification, risks, and unknowns.

If the host has no native goal feature, the skill keeps the same objective as an in-chat checklist. The output remains a plan unless the user separately asks the agent to implement the recovery.

## Non-Goals

- No automatic repair.
- No automatic retry.
- No host control JSON.
- No policy enforcement.
- No network upload.
- No automatic hook reconfiguration.
- No claim that redaction is complete.
