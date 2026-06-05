# Failure Automation Workflow

HaltTrace has two layers:

1. The observer plugin captures local incident dumps when a supported host anomaly is observed.
2. The dump workflow reads those Markdown dumps and turns them into deterministic triage or a handoff prompt.

This is local AI-agent failure automation, not automatic repair. The workflow automates evidence discovery, summary, and handoff packaging. It does not approve, deny, retry, edit files, call an AI provider, or send network traffic.

## Commands

```sh
halttrace latest
halttrace explain
halttrace handoff
```

Use `--state-root <dir>` when reading from a non-default HaltTrace state directory. Use `--cwd <path>` to filter to the project hash for a specific checkout, and `--session <id>` to filter to one agent session.

```sh
halttrace latest --state-root ./tmp-state --cwd .
halttrace explain ./incident.md
halttrace handoff --state-root ./tmp-state --cwd . --session session-one
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

## Recommended Agent Flow

1. Run `halttrace latest` to find the newest dump.
2. Run `halttrace explain <dump>` to orient yourself.
3. Run `halttrace handoff <dump>` when another agent or a resumed session should continue.
4. Inspect referenced files or rerun the narrowest safe command only when the dump does not contain enough evidence.

## Non-Goals

- No automatic repair.
- No automatic retry.
- No host control JSON.
- No policy enforcement.
- No network upload.
- No claim that redaction is complete.
