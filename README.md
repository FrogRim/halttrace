# HaltTrace

HaltTrace is a local observability aid for coding-agent sessions. It watches Claude Code hook/runtime events, keeps a bounded local event history, and writes a local Markdown backtrace when progress involuntarily halts.

HaltTrace uses an spdlog-inspired dispatch architecture: host hook events are normalized into internal events, routed through a small dispatcher, and handled by independent sinks. The first sink is `BacktraceSink`, which keeps a bounded local event buffer and writes a diagnostic dump when the host reports an involuntary halt.

This is architectural inspiration only. HaltTrace does not depend on spdlog, does not reimplement spdlog, and does not use the router as an enforcement gate.

HaltTrace is observational only. It does not approve, deny, retry, veto, emit Claude Code control JSON, or send network traffic by default.

## Current Status

HaltTrace is currently:

- a TypeScript/Node package named `halttrace`
- a Claude Code hook/plugin wrapper under `plugins/claude-code`
- an spdlog-inspired local event router, bounded event store, trigger classifier, and Markdown backtrace sink

HaltTrace is not currently:

- an MCP server
- a tool server exposing callable tools
- a policy engine or safety gate
- a universal agent runtime adapter

The universal-host goal remains future work. HaltTrace should not claim host universality until a second structurally different host adapter works through the same core contract without core changes.

## Requirements

- Node.js 20 or newer
- npm
- Claude Code, when using the included Claude Code plugin wrapper

## Install From Source

```sh
git clone <repo-url> halttrace
cd halttrace
npm install
npm run build
```

The build compiles TypeScript and syncs the built CLI into the Claude Code plugin wrapper.

## Install With Claude Code Plugin Manager

From this checkout on your PC:

```sh
claude plugin marketplace add ./ --scope user
claude plugin install halttrace@halttrace --scope user
```

After the GitHub repository is available, a fresh machine can register the public repo as a marketplace instead:

```sh
claude plugin marketplace add FrogRim/halttrace --scope user
claude plugin install halttrace@halttrace --scope user
```

Verify the install:

```sh
claude plugin validate ./plugins/claude-code
claude plugin details halttrace
```
## Claude Code Plugin Setup

The Claude Code plugin lives at:

```text
plugins/claude-code/
  .claude-plugin/plugin.json
  hooks/hooks.json
  scripts/halttrace.mjs
```

Load it from a source checkout:

```sh
claude --plugin-dir ./plugins/claude-code
```

Claude Code plugin documentation describes plugins as directories with `.claude-plugin/plugin.json`, with hook configuration in `hooks/hooks.json` at the plugin root. HaltTrace follows that layout.

The hook command is:

```sh
node "$CLAUDE_PLUGIN_ROOT/scripts/halttrace.mjs"
```

The wrapper reads Claude Code hook JSON from stdin, forwards it to the built HaltTrace CLI, surfaces only HaltTrace diagnostic/backtrace lines, and exits `0`.

## What It Observes

| Claude Code hook | HaltTrace use | Trigger behavior |
| --- | --- | --- |
| `PreToolUse` | Records upcoming tool activity | Context only |
| `PostToolUse` | Records completed tool activity | Context only |
| `PostToolUseFailure` | Classifies failed tool activity | Triggers only for tool exceptions or edit-apply failures; ordinary command failures remain context |
| `PermissionDenied` | Records host-blocked tool attempts | Triggers `host-blocked` |
| `StopFailure` | Records distinguishable unrecoverable host stop failures | Triggers unless marked user-intended |
| `SessionEnd` | Records session closure | Context only |

## Trigger Policy

HaltTrace writes a dump only when progress involuntarily and unexpectedly halts.

Triggers:

- `host-blocked`
- `tool-exception`
- `edit-apply-failure`
- `host-unrecoverable-error`, when distinguishable from a user stop

Non-triggers:

- non-zero command exits
- test failures
- lint failures
- typecheck failures
- ordinary feedback from tools
- user-intended stops
- normal approval waits
- inferred stalls
- repeated same-step failures

## Output

When a trigger fires, HaltTrace writes a local Markdown incident report and prints the dump path:

```text
[halttrace] backtrace dump: <path-to-incident.md>
```

A generated report includes:

- incident metadata
- a recent event table
- trigger event details
- captured args, stderr, stdout, diff, or error blocks only when the triggering event contains them
- redaction and truncation notes

See [examples/sample-report.md](examples/sample-report.md) for an illustrative richer report.

## Privacy And Storage

By default, HaltTrace stores data outside the repository:

| Platform | Default state root |
| --- | --- |
| Linux | `$XDG_STATE_HOME/halttrace` or `~/.local/state/halttrace` |
| macOS | `~/Library/Logs/halttrace` |
| Windows | `%LOCALAPPDATA%\halttrace` |

When Claude Code provides `CLAUDE_PLUGIN_DATA`, the plugin wrapper prefers that location unless `HALTTRACE_STATE_DIR` is set.

Storage is sharded by project hash and session ID:

```text
<state-root>/<project-hash>/<session-id>/
  events.jsonl
  incident-state.json
  <incident-id>.md
```

Dump content is rich but bounded. HaltTrace may include redacted/truncated command text, args, stdout tail, stderr tail, error details, and diff hunks when those fields are present on the host event. It does not include full file contents, full stdout, or full repository diffs by default.

Redaction is defense-in-depth, not a guarantee. Treat dumps as local diagnostic files and review them before sharing.

## Environment Variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `HALTTRACE_STATE_DIR` | Override the state directory | Platform state root, or `CLAUDE_PLUGIN_DATA` in Claude plugin mode |
| `HALTTRACE_DUMP_MODE` | Choose dump content mode: `rich-local` or `metadata-only` | `rich-local` |
| `HALTTRACE_MAX_EVENTS` | Maximum retained events in the local ring buffer | `80` |
| `HALTTRACE_MAX_BYTES` | Approximate byte budget for retained events | `512000` |
| `HALTTRACE_COOLDOWN_MS` | Incident deduplication cooldown | `5000` |
| `HALTTRACE_ENTRY` | Override CLI entry path for plugin wrapper development | Built plugin CLI, then repo `dist` CLI |

Use metadata-only mode when command/output content should be omitted from both the durable event buffer and dumps:

```sh
HALTTRACE_DUMP_MODE=metadata-only claude --plugin-dir ./plugins/claude-code
```

PowerShell:

```powershell
$env:HALTTRACE_DUMP_MODE="metadata-only"; claude --plugin-dir ./plugins/claude-code
```

## Development

```sh
npm install
npm run typecheck
npm test
npm run clean
```

Available scripts:

| Command | What it does |
| --- | --- |
| `npm run build` | Compiles TypeScript and syncs the Claude Code plugin build |
| `npm run typecheck` | Runs TypeScript without emitting files |
| `npm test` | Builds, then runs Node's built-in test runner against compiled tests |
| `npm run clean` | Removes `dist` |

## Documentation Pattern

This README borrows structure from official/high-visibility Claude plugin and MCP-style projects without claiming HaltTrace is an MCP server.

Observed patterns:

- The Anthropic Claude Code plugin docs emphasize a clear plugin directory layout, separate `hooks/hooks.json`, and executable hook commands that receive JSON on stdin: <https://code.claude.com/docs/en/plugins>
- The Anthropic hooks reference documents event/matcher structure and host hook configuration, which maps well to HaltTrace's observed-hook table: <https://docs.anthropic.com/en/docs/claude-code/hooks>
- The official Model Context Protocol servers README leads with scope, quick start, client configuration, and security caveats for reference implementations: <https://github.com/modelcontextprotocol/servers/blob/main/README.md>
- The GitHub MCP Server README documents installation, configuration modes, tool-surface controls, and security-relevant setup details: <https://github.com/github/github-mcp-server>

For HaltTrace, the useful pattern is: state scope first, show exact setup snippets, document observed host events, explain privacy/security, then link deeper architecture docs. The important difference is that HaltTrace currently observes Claude Code hooks and writes local backtraces; it does not expose MCP tools, resources, or prompts.

## More Docs

- [Architecture](docs/architecture.md)
- [Sink API](docs/sink-api.md)
- [Behavioral Evaluation Log](docs/evaluation-log.md)
- [Security Policy](SECURITY.md)
- [Sample Incident Report](examples/sample-report.md)

## Roadmap

Near-term:

- harden Claude Code plugin packaging and setup docs
- expand real-incident evaluation with non-author testers
- improve backtrace usefulness without increasing sensitive-content risk

Later:

- add a second host adapter, with Codex as the preferred validation target once its hook/plugin behavior is verified
- keep the core host-neutral while adding adapters
- consider additional sinks only if they preserve the side-effect-only observer contract

Networked sinks, MCP server behavior, and universal host claims are outside the current MVP.


