# HaltTrace Handoff Prompt

Use this local HaltTrace dump as the starting point for the next debugging pass.

- Dump: `%LOCALAPPDATA%\halttrace\project_91c4\session_8b21\inc_2026-05-30T10-42-18Z_7f3a.md`
- Trigger: host-blocked
- Host: claude-code
- Session: session_8b21
- Tool: Write
- Files: `src/example.ts`

## What Happened

The host blocked a Write action. The dump should be treated as evidence for why the action was blocked, not as approval to retry it.

## Continue With This Instruction

```text
Read the HaltTrace dump above before making changes.
Identify the failed step, the relevant file or command, and the smallest verification command.
Do not assume the dump is complete; if evidence is missing, inspect the referenced files or rerun the narrowest safe command.
Do not treat this as permission to approve, deny, retry, or auto-repair host actions.
Produce a short recovery plan before editing.
```

## Suggested Checks

1. Inspect the Tool, Files, Args, and stderr evidence before repeating the action.
2. Confirm whether the host policy or user approval state intentionally blocked the action.
3. If continuing, choose the smallest safe command or edit that avoids bypassing the host decision.
