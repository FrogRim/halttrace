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

## Release Gate

Value MVP can proceed only when:

- automated trigger/non-trigger/storage/redaction tests pass
- at least one non-author tester demonstrates active reach-for behavior
- no surprise secret exposure occurs in a sharing or commit context
- dump output does not become noisy enough to ignore
