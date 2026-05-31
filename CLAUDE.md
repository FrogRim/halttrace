# HaltTrace Agent Guide

## Project Overview

- HaltTrace is a TypeScript/Node local observability aid for coding-agent sessions.
- It observes Claude Code and experimental Codex hook/runtime events, keeps a bounded local event history, and writes a local Markdown backtrace dump when progress involuntarily halts.
- The npm package name is `halttrace`.
- The MVP scope is Claude Code plus experimental Codex adapter support, `BacktraceSink` only, and local files only.
- Treat Codex support as conservative: ordinary Bash results are context-only, full plugin hook activation is environment-sensitive, and Codex dumps require an anomaly-bearing `apply_patch`, MCP, or explicit tool-exception event.
- The architecture is inspired by spdlog's emitter/router/sink/backtrace model, but HaltTrace does not depend on spdlog or reimplement it.
- Treat this file as Claude Code project memory: shared, concise instructions for agents working in this repository.

## Commands

- Install dependencies: `npm install`
- Run tests: `npm test`
- Typecheck only: `npm run typecheck`
- Build: `npm run build`
- Clean build output: `npm run clean`
- Scenario smoke test: `powershell -ExecutionPolicy Bypass -File .\examples\scenarios\run-claude-backtrace-scenario.ps1 -StateRoot .\.scenario-state -SkipBuild`

Run `npm test` before claiming behavior changes are complete. For documentation-only changes, run the narrowest useful validation and state what was not run.

## Code Style

- Use TypeScript with ESM imports and explicit `.js` import specifiers for local modules.
- Keep `strict`, `noImplicitAny`, `exactOptionalPropertyTypes`, and `noUncheckedIndexedAccess` clean.
- Prefer Node built-ins before adding dependencies.
- Keep public exports centralized through `src/index.ts` when adding API surface.
- Use Node's built-in test runner under `tests/`.
- Keep comments sparse and focused on non-obvious behavior or safety boundaries.

## Architecture Boundaries

- Preserve the spdlog-inspired dispatch contract: host adapters normalize hook events into `AgentEvent`, core routes events, sinks perform independent side effects, and `BacktraceSink` owns bounded backtrace dump behavior.
- Do not turn the dispatcher or sinks into a gate, policy engine, retry loop, or host-control surface.
- `src/core/` owns normalized event types, routing, event storage, trigger classification, dedup/cooldown, redaction/truncation helpers, privacy handling, and storage path resolution.
- `src/adapters/claude-code.ts` owns Claude Code hook input parsing and normalization into `AgentEvent`.
- `src/adapters/codex.ts` owns Codex hook input parsing and normalization into `AgentEvent`.
- `src/sinks/backtrace.ts` owns Markdown incident rendering and local dump writing.
- `src/replay/` owns JSONL replay helpers for fixture and contract testing.
- `src/cli/claude-hook.ts` wires Claude stdin hook input to the adapter, router, store, deduper, and sink.
- `src/cli/codex-hook.ts` wires Codex stdin hook input to the same core pipeline and keeps stdout empty.
- Core code must not import host adapters or encode Claude/Codex event names directly.
- Host-specific behavior belongs in adapters or plugin wrapper code, not in core.

## Safety And Privacy Constraints

- HaltTrace is an observer, not an enforcement layer.
- Do not add veto, approval, denial, retry, forced continuation, or host-control behavior.
- Do not emit host control JSON such as `decision`, `permissionDecision`, `continue:false`, or `retry:true` from HaltTrace observer paths.
- Do not use host blocking exit-code semantics for handled observer events; handled events should exit successfully. Codex observer output must keep stdout empty and use stderr for `[halttrace]` diagnostics.
- Treat sink failures as diagnostics. Do not turn dump-write failures into host failures.
- Keep default storage local and outside the repository unless an explicit feature changes that contract with tests.
- Do not add network output by default.
- Preserve bounded retention, redaction, truncation, and `metadata-only` behavior.
- Assume rich local dumps can contain sensitive context even after redaction. Do not encourage sharing dumps without explicit review.

## Trigger Policy

Dump only when progress involuntarily and unexpectedly halts.

Trigger examples:

- `host-blocked`
- `tool-exception`
- `edit-apply-failure`
- distinguishable `host-unrecoverable-error`

Non-trigger examples:

- non-zero command exits
- test failures
- lint failures
- typecheck failures
- user-intended stops
- normal approval waits
- repeated same-step failures

## Non-Goals

- Do not turn HaltTrace into an AI reviewer, policy engine, safety gate, merge gate, or broad runtime framework without explicit scope approval.
- Do not claim mature universal agent support; the current Universal MVP only means Claude Code and experimental Codex adapters share the same revised core contract.
- Do not claim Codex trigger parity with Claude Code. Document whether a Codex change is context-only or can actually emit a dump.
- Do not expand `CLAUDE.md` into marketing copy or broad process guidance.

## Contribution Guidance For Agents

- Read `README.md` and `docs/architecture.md` before changing behavior.
- Keep diffs small and aligned with existing module ownership.
- Add or update focused tests for behavior changes.
- Prefer deletion or reuse of existing helpers over new abstractions.
- Do not edit package metadata, plugin metadata, or generated build output unless the task explicitly requires it.
- Do not commit local state directories, scenario output, dumps, or secrets.
- If changing Claude Code or Codex hook handling, verify the observer contract explicitly: no blocking exit status, no control JSON, and Codex stdout remains empty.
