# Security Policy

HaltTrace captures local agent-session context that can include command arguments, stderr, stdout tails, error messages, paths, and bounded diff hunks. Treat generated dumps as potentially sensitive diagnostics.

## Security Model

- HaltTrace is local-only by default.
- HaltTrace does not send telemetry, network requests, webhooks, or remote uploads by default.
- HaltTrace is observer-only. It does not approve, deny, retry, veto, or control host execution.
- Dumps and event history are written outside the project repository by default.
- Repo-local storage is not part of the Value MVP. State roots inside the current project, symlink-resolved project paths, and state roots that are git repositories are refused.
- Persisted event history is bounded and sanitized before storage.

## Redaction Limits

Redaction is best-effort defense-in-depth, not a guarantee. HaltTrace attempts to mark and redact common secret-like assignments, bearer tokens, high-entropy tokens, and sensitive path segments, but secret detection is not sound.

Do not assume a dump is safe to share because redaction ran. Review dumps manually before posting them in issues, chats, tickets, pull requests, or bug reports.

## Sharing Dumps

Before sharing a dump:

1. Inspect the full file manually.
2. Remove project-specific secrets, paths, customer data, credentials, tokens, internal hostnames, and private code.
3. Prefer a minimized excerpt that preserves the failure evidence without exposing unrelated context.
4. State which fields were removed or elided when that affects diagnosis.

## Reporting Security Issues

Please do not paste secrets or full dumps into public GitHub issues. If you find a vulnerability or a dump-exposure issue, use GitHub's private vulnerability reporting if available for the repository, or open a minimal public issue that describes the class of problem without sensitive payloads.

Useful details for a report:

- HaltTrace version or commit
- host adapter used
- dump mode (`rich-local` or `metadata-only`)
- operating system
- whether the issue involves storage location, redaction, trigger noise, or host-control behavior
- a sanitized reproduction case