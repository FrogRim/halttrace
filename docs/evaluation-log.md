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

## Release Gate

Value MVP can proceed only when:

- automated trigger/non-trigger/storage/redaction tests pass
- at least one non-author tester demonstrates active reach-for behavior
- no surprise secret exposure occurs in a sharing or commit context
- dump output does not become noisy enough to ignore

## Fresh Install Checks

### 2026-05-31 - GitHub Marketplace Install

- Commit: `a77bbf8`
- Environment: isolated temporary Claude user profile on Windows
- Commands: `claude plugin marketplace add FrogRim/halttrace --scope user`, `claude plugin install halttrace@halttrace --scope user`, `claude plugin details halttrace`
- Result: install succeeded; plugin details reported `halttrace 0.1.0` with hooks `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionDenied`, `StopFailure`, and `SessionEnd`
- Smoke test: invoked installed `scripts/halttrace.mjs` with a `PermissionDenied` event and `HALTTRACE_STATE_DIR` pointed at the isolated profile
- Evidence: wrapper printed `[halttrace] backtrace dump:` and wrote exactly one Markdown dump
- Verdict: pass
