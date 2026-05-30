# Agent Event Backtrace

## Summary

An agent session hit a `host-blocked` event while attempting a tool action. This report preserves recent local context for debugging. It does not approve, deny, retry, or judge the action.

## Incident

- Incident ID: `inc_2026-05-30T10-42-18Z_7f3a`
- Host: `claude-code`
- Session: `session_8b21`
- Project hash: `project_91c4`
- Trigger: `host-blocked`
- Created: `2026-05-30T10:42:18Z`
- Dump mode: `rich-local`

## Trigger Event

- Event type: `PermissionDenied`
- Normalized type: `host-blocked`
- Tool: `Write`
- Path: `src/example.ts`
- Reason: host denied the requested tool action

## Recent Context

| Time | Type | Summary |
| --- | --- | --- |
| 10:41:50 | `PreToolUse` | Agent prepared file edit |
| 10:41:52 | `PostToolUse` | Prior read completed |
| 10:42:17 | `PreToolUse` | Agent attempted write |
| 10:42:18 | `PermissionDenied` | Host blocked write |

## Captured Output

### stdout tail

```text
[content omitted: stdout unavailable for this event]
```

### stderr tail

```text
Permission denied by host policy.
```

## Relevant Diff Context

```diff
[content omitted: no applied diff was available because the host blocked the write]
```

## Redactions And Elisions

- Full file contents: omitted
- Full stdout: omitted
- Full repository diff: omitted
- Secrets/tokens: redacted when matched
- Long fields: truncated with visible markers

## Router Diagnostics

No sink failure was recorded.

## Local Dump Path

```text
%LOCALAPPDATA%\halttrace\project_91c4\session_8b21\inc_2026-05-30T10-42-18Z_7f3a.md
```
