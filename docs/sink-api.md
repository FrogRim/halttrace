# Sink API

## Contract

A sink is a side-effect-only observer. It receives normalized event or incident data and may write diagnostics, but it cannot influence host execution.

A sink API must not expose return values such as:

- `allow`
- `deny`
- `approve`
- `block`
- `retry`

## Normalized Event

`AgentEvent` represents host-neutral runtime activity.

Key fields:

- `id`
- `timestamp`
- `host`
- `sessionId`
- `type`
- `severity`
- `cwd`
- `toolName`
- `command`
- `args`
- `exitCode`
- `filePaths`
- `stdout`
- `stderr`
- `diffHunks`
- `error`
- `metadata`

Host-specific payloads belong in adapter-owned mapping logic, not core trigger branches.

`command`, `args`, `stdout`, `stderr`, `diffHunks`, and `error` are content-bearing fields. Routers must apply the privacy policy before durable storage or sink delivery.

## Sink Interface

```ts
export interface EventSink {
  id: string;
  handleEvent?(event: AgentEvent): Promise<void> | void;
  handleIncident?(incident: IncidentSnapshot): Promise<void> | void;
}
```

If a sink throws, times out, or fails to write, the router records a diagnostic and keeps host behavior unchanged.

## BacktraceSink

BacktraceSink writes a local Markdown dump containing:

- incident metadata
- trigger event
- recent normalized event context
- bounded stdout/stderr tails
- bounded relevant diff hunks
- explicit redaction/truncation markers
- router diagnostics if present

BacktraceSink must not include full file contents, full stdout, or a full repository diff by default.

## Future Sinks

Future sinks must preserve the same contract. Transmit-capable sinks are outside the Value MVP and should require explicit export behavior or metadata-only defaults.
