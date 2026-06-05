---
name: halttrace-dump-analysis
description: "Analyze local HaltTrace dumps and produce a goal-mode recovery plan or handoff prompt. Use when a HaltTrace dump exists, when an AI coding-agent session halted, or when the user asks to explain, diagnose, recover, resume, hand off, or create a recovery plan from a HaltTrace incident report."
---

# HaltTrace Dump Analysis

Use this skill to turn a local HaltTrace dump into a recovery plan. This is read-only diagnostic automation unless the user separately asks for implementation.

## Workflow

1. Establish the recovery goal:
   - If native goal/task functionality is available, create or update one goal: `Analyze the HaltTrace dump and produce a verified recovery plan.`
   - If no goal tool is available, keep the same objective as the active checklist in chat.
   - Do not mark the goal complete until the recovery plan is written and evidence-backed.
2. Find the dump:
   - If the user gave a path, use that path.
   - Otherwise use the latest dump by omitting the dump argument.
   - If the project uses a non-default state root, include `--state-root <dir>`.
   - If no dump exists, report that as the blocker and include the command attempted.
3. Summarize the dump:
   - Run `halttrace:explain <dump>` when the PowerShell alias module is loaded; otherwise run `halttrace explain <dump>`.
   - Omit `<dump>` to read the latest matching dump.
   - Read the output before drawing conclusions.
4. Check dump health:
   - Run `halttrace:doctor <dump>` when available; otherwise run `halttrace doctor <dump>`.
   - Omit `<dump>` to read the latest matching dump.
   - Treat warnings as local diagnostic cues, not as automatic repair instructions.
5. Prepare continuation:
   - Run `halttrace:handoff <dump>` when available; otherwise run `halttrace handoff <dump>`.
   - Omit `<dump>` to read the latest matching dump.
   - Use the handoff as input, not as permission to bypass host policy.
6. Inspect locally:
   - Inspect referenced files or rerun only the narrowest safe command if the dump lacks needed evidence.
   - Do not rerun broad, destructive, credentialed, or host-policy-bypassing actions.
7. Write the recovery plan:
   - Include dump path, likely cause, evidence, recovery steps, verification commands, risks, and unknowns.
   - Separate facts from inferences.
   - If the user asked only for a plan, stop after the plan.

## Recovery Plan Template

```markdown
# HaltTrace Recovery Plan

- Dump: <path>
- Goal: Analyze the HaltTrace dump and recover the halted agent workflow.
- Likely cause: <one short paragraph>
- Evidence: <bullets with dump sections, files, commands, or doctor checks>
- Recovery steps: <ordered smallest-safe steps>
- Verification: <commands or checks that prove recovery>
- Risks: <host policy, missing evidence, sensitive dump content, Codex/Claude caveats>
- Unknowns: <what still needs local inspection>
```

## Safety Boundary

HaltTrace dump analysis is local diagnostic automation. Do not claim that it repairs code, retries failed actions, approves permissions, denies permissions, mutates hook configuration, or guarantees redaction.

Do not send dump contents to a remote service unless the user explicitly asks and has reviewed the dump for sensitive content.
