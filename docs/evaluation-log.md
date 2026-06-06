# Behavioral Evaluation Log

Use this log for real incidents. Do not count staged demos as the adoption verdict.

```text
Tester:
Host:
Project:
Date:
Trigger:
Was the dump opened first without prompting? yes/no
Was rerun/scrolling still needed? yes/no
Cause answered by dump: full/partial/no
Missing context:
Surprising sensitive content: yes/no
Noise/spam concern: yes/no
Notes:
```

## Active Reach-For Protocol

Do not treat install count, passive retention, badges, or staged demos as the Value MVP verdict. The adoption signal is active reach-for: during real halted/error sessions, a non-author tester opens the dump first without prompting, uses it before rerunning or scrolling, and can identify the cause fully or partially from the dump.

Record the counterfactual for each incident: would the tester still have rerun the command, searched logs, or scrolled the transcript without the dump? If yes, record the missing context instead of counting the case as a clean success.

## Release And Adoption Gates

Engineering validation can proceed when:

- automated trigger/non-trigger/storage/redaction tests pass
- fresh install or packaged-wrapper smoke checks pass for the supported host paths
- no surprise secret exposure occurs in a sharing or commit context
- dump output does not become noisy enough to ignore

The adoption verdict remains separate. Do not treat install count, passive retention, badges, or staged demos as the Value MVP verdict. The adoption signal still requires at least one non-author tester demonstrating active reach-for behavior during a real halted/error session. For the current plan, that reach-for evidence is collected after public deployment rather than before the engineering Universal MVP lands.

## Fresh Install Checks

### 2026-05-31 - GitHub Marketplace Install

- Commit: `a77bbf8`
- Environment: isolated temporary Claude user profile on Windows
- Commands: `claude plugin marketplace add FrogRim/halttrace --scope user`, `claude plugin install halttrace@halttrace --scope user`, `claude plugin details halttrace`
- Result: install succeeded; plugin details reported `halttrace 0.1.0` with hooks `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionDenied`, `StopFailure`, and `SessionEnd`
- Smoke test: invoked installed `scripts/halttrace.mjs` with a `PermissionDenied` event and `HALTTRACE_STATE_DIR` pointed at the isolated profile
- Evidence: wrapper printed `[halttrace] backtrace dump:` and wrote exactly one Markdown dump
- Verdict: pass
### 2026-05-31 - Universal MVP Local Validation

- Commit: `ec9f892`
- Environment: Windows PC, Node local runtime, Codex CLI `0.130.0`
- Codex feature state observed locally: `hooks` stable true, `plugins` stable true, `plugin_hooks` under-development false
- Validators: `claude plugin validate ./plugins/claude-code` passed; Codex plugin creator validator passed for `plugins/codex`
- Automated checks: `npm run typecheck` passed; `npm test` passed with 25/25 tests; GitHub Actions CI run `26704431392` passed on Node 20.x and Node 22.x
- Codex smoke test: invoked `plugins/codex/scripts/halttrace.mjs` with `PLUGIN_DATA` and a Codex-style `PostToolUse` `apply_patch` failure payload
- Codex smoke result: exit `0`, stdout empty, stderr contained `[halttrace] backtrace dump:`, and exactly one Markdown dump was written
- Limitation: full Codex plugin activation through the local Codex CLI was not verified because the installed CLI exposes marketplace add/upgrade/remove but no plugin install/enable command in `codex plugin --help`; packaged wrapper and manifest validation are the current local evidence
- Non-author reach-for: pending post-deployment real-incident evaluation
- Verdict: engineering Universal MVP smoke pass; adoption verdict pending

### 2026-05-31 - RedTeam Codex Scope Follow-up

- Trigger: RedTeam review challenged Codex trigger coverage, README wording, Codex contract tests, Windows verification, and the "core unchanged" claim.
- Official-doc check: current OpenAI Codex hook docs list matcher/canonical support for `Bash`, `apply_patch` with `Edit`/`Write` aliases, and MCP tool names; the reviewed "Bash-only" claim does not match the current docs. The practical limitation remains that Codex is not a complete interception boundary and ordinary Bash results are context-only for HaltTrace.
- Documentation correction: README, architecture docs, `CLAUDE.md`, and `AGENTS.md` now state that Codex dumps require an anomaly-bearing `apply_patch`, MCP, or explicit tool-exception event; lifecycle, permission, stop, and ordinary Bash events only build context.
- Windows clarification: docs now distinguish Windows state-directory support from full Codex plugin hook activation, which was not verified on this PC beyond wrapper/manifest/packaged smoke checks.
- Core-contract clarification: `ec9f892` did widen `src/core/types.ts` with host-neutral lifecycle/context event kinds, so Universal MVP is documented as a revised contract pinned by tests, not a pure zero-core-edit adapter proof.
- Added tests: `tests/codex-contract.test.ts` explicitly covers context-only Codex events, ordinary Bash non-trigger behavior, `apply_patch` failure triggers, and non-Bash/MCP exception triggers.
- Verification: `npm run typecheck` passed; `npm test` passed with 27/27 tests.

### 2026-06-05 - Dump Workflow Validation

- Trigger: productized the next layer as a local dump-reading workflow instead of changing the observer hook plugin.
- Scope: added `halttrace latest`, `halttrace explain`, and `halttrace handoff`; added Claude Code and Codex agent-facing dump-analysis skill docs.
- Safety boundary: workflow reads local Markdown dumps only; it does not repair code, retry actions, approve/deny host decisions, call an AI provider, or send network traffic.
- Version: package and plugin manifests updated to `0.2.0` so fresh installs can pick up the new CLI entrypoint.
- Automated checks: `npm run typecheck` passed; `npm test` passed with 30/30 tests.
- Smoke checks: `node dist/src/cli/main.js explain examples/sample-report.md` and `node dist/src/cli/main.js handoff examples/sample-report.md` both produced deterministic local output without host-control JSON.
- Validators: `claude plugin validate ./plugins/claude-code` passed; Codex plugin creator validator passed for `plugins/codex`.
- Fresh install check: `npm pack` produced `halttrace-0.2.0.tgz`; installing it into an isolated temporary npm project exposed `halttrace help` with the new `latest`, `explain`, and `handoff` commands.
- Non-author reach-for: still pending post-deployment real-incident evaluation.
- Verdict: engineering dump workflow pass; adoption verdict pending.

### 2026-06-06 - Dump Analysis Skill Sync Follow-up

- Trigger: kept Claude Code and Codex `halttrace-dump-analysis` skills aligned with the new dump workflow and goal-mode recovery handoff.
- Scope: verified the user-facing `halttrace latest`, `halttrace explain`, `halttrace handoff`, and `halttrace doctor` CLI surface plus the packaged agent skill docs.
- Safety boundary: still observer-only; no automatic repair, automatic retry, host approval/denial decision, network upload, or AI provider dependency was added.
- Automated checks: `npm run typecheck` passed; `npm test` passed with 31/31 tests.
- Verdict: release proof now covers the local dump workflow and the agent-facing skill packaging.
