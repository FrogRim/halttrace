# AGENTS.md

Guidance for Codex and other coding agents working in HaltTrace.

## Scope And Precedence

- This file applies to the entire repository.
- If a nested `AGENTS.md` is added later, the closest file to the edited path wins.
- Direct user, developer, and system instructions override this file.
- Do not overwrite or revert user or agent changes you did not make.

## Project Overview

- HaltTrace is a TypeScript/Node local observability aid for coding-agent sessions.
- It observes host hook/runtime events, keeps a bounded local event history, and writes a local backtrace dump when progress involuntarily halts.
- The package name is `halttrace`; the CLI entry is built to `dist/src/cli/claude-hook.js`.
- The current MVP is Claude Code first, with a `BacktraceSink` and local files only.
- The core architecture is inspired by spdlog's emitter/router/sink/backtrace dispatch model, but HaltTrace is not an spdlog port and has no spdlog dependency.

## Commands

- Install dependencies: `npm install`
- Run tests: `npm test`
- Type-check without emitting files: `npm run typecheck`
- Build: `npm run build`
- Run the Claude backtrace scenario smoke test: `powershell -ExecutionPolicy Bypass -File .\examples\scenarios\run-claude-backtrace-scenario.ps1 -StateRoot .\.scenario-state -SkipBuild`

## Coding Style

- Keep TypeScript strict mode green. Do not relax `tsconfig.json`.
- Do not introduce `any`, implicit `any`, unchecked casts, or broad type escapes.
- Prefer explicit, narrow domain types in `src/core/types.ts` and reuse existing helpers before adding new abstractions.
- Keep core host-neutral. Core modules must not import host adapters or encode Claude/Codex event names directly.
- Preserve the spdlog-inspired dispatch boundary: host-specific code belongs in adapters, the core router fans out normalized events, and sinks stay independent side-effect handlers.
- Keep source comments sparse and useful; explain non-obvious policy or safety constraints, not mechanics.

## Testing Expectations

- Run the smallest relevant check first, then broaden when behavior changes across modules.
- Run `npm run typecheck` and `npm test` before claiming completion for code changes.
- Run `npm run build` when CLI output, plugin wrapper behavior, package layout, or generated `dist` behavior matters.
- Add or update tests for changed behavior in `tests/`; do not add tests for unrelated issues.
- Use the scenario smoke test for changes that affect Claude hook parsing, trigger policy, dump writing, or wrapper behavior.

## Safety Constraints

- HaltTrace must remain local-only and observer-only unless a future explicit policy layer is designed separately.
- Do not use the spdlog-inspired dispatcher as an enforcement gate; veto, retry, approval, and policy decisions belong outside the observer sink router.
- Do not add network output, telemetry, remote upload, or background service behavior by default.
- Do not emit host control JSON such as `decision`, `permissionDecision`, `continue:false`, or `retry:true`.
- Do not use host blocking exit-code semantics for handled observer events.
- Treat sink failures as diagnostics; do not turn dump-write failures into host failures.
- Keep persisted event history and dumps bounded, redacted/truncated, and outside the repo by default.

## Documentation And PR Guidance

- Update docs when behavior, commands, public contracts, plugin layout, or safety guarantees change.
- Keep documentation concise and factual; do not claim universal host support until a second structurally different host adapter works through the same core contract without core changes.
- In PR summaries, call out behavior changes, safety/privacy impact, and verification commands run.
- If a verification command cannot run, state why and list the next-best check used.
