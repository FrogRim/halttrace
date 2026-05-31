# Architecture

## Goal

HaltTrace provides local incident backtraces for agent sessions. Its job is to preserve recent context when a session is blocked or derailed, not to judge code or control the host.

## spdlog-Inspired Dispatch Model

HaltTrace borrows the shape of spdlog's dispatch architecture, but it is not a port of spdlog and has no spdlog dependency. The mapping is architectural only:

| spdlog concept | HaltTrace concept |
| --- | --- |
| logger | host hook event emitter |
| sink | independent observer sink |
| formatter | dump renderer, currently Markdown |
| registry | sink registration and router configuration |
| level | trigger kind and event severity |
| async logger / thread pool | non-blocking observer execution boundary for future slow sinks |
| backtrace buffer | bounded local event history used by `BacktraceSink` |

The important constraint is the side-effect-only sink contract. The router fans out normalized events to sinks, and sinks may write diagnostics, but they must not approve, deny, retry, veto, or otherwise feed decisions back into the host.

## Data Flow

```text
Host hook event
  -> host adapter
  -> AgentEvent
  -> EventRouter
  -> FileEventStore
  -> AnomalyTrigger
  -> IncidentSnapshot
  -> BacktraceSink
  -> local dump file + surfaced dump path
```

## Modules

### `core`

Owns normalized event types, routing, event storage, trigger classification, dedup/cooldown, redaction/truncation helpers, and storage path resolution.

Core must not import host adapters or encode Claude/Codex event names directly.

### `adapter-claude-code`

Owns Claude Code hook input parsing and event normalization.

The adapter is observational only. It must not emit host control decisions or blocking exit statuses.

### `sink-backtrace`

Owns Markdown incident formatting, local dump writing, and surfacing the dump path through non-control output.

### `replay`

Owns JSONL fixture ingestion and replay-based contract tests.

## Trigger Policy

The core trigger rule is:

> Dump only when progress involuntarily and unexpectedly halts.

Triggers:

- `host-blocked`
- `tool-exception`
- `edit-apply-failure`
- `host-unrecoverable-error` when distinguishable from user stop

Non-triggers:

- command exit failures
- tests
- lint
- typecheck
- user stops
- normal approval waits
- inferred stalls
- repeated same-step failures

## Host Hook Safety Contract

Adapter wrappers must:

- exit successfully for handled observer events
- never emit `decision`, `permissionDecision`, `continue:false`, or `retry:true`
- never use host-specific blocking exit codes
- treat sink failures as router diagnostics
- avoid turning dump-write failures into host failures

## Storage

Default storage is outside the repository and sharded by project hash and session ID:

```text
<state-dir>/<project-hash>/<session-id>/<incident-id>.md
```

Repo-local storage is opt-in only and must verify ignore coverage before writing. This implementation currently ships the repo-external default and state-root hardening; repo-local opt-in remains future work.

## Privacy

Default mode is `rich-local`: diagnostically useful, bounded, local-only content with visible redaction and truncation markers.

Events are sanitized before they are appended to the durable `events.jsonl` ring buffer. In `metadata-only` mode, command text, args, stdout, stderr, diff hunks, and error details are omitted before persistence, not just hidden from the Markdown dump.

No network output is produced by the Value MVP.
