---
name: security-hardening
description: Scan the ticket diff for secrets, injection, unsafe input handling, and destructive operations, and block on any finding.
---

# Security Hardening

Review the diff for:

- **Secrets** — API keys, tokens, passwords in code, logs, or error messages.
- **Injection** — unvalidated input reaching shell, SQL, or file paths.
- **Unsafe paths** — `..` traversal, writing outside the repo.
- **Destructive ops** — `push`, `reset --hard`, `rm -rf`.

Any finding → report `status: blocked` with file, line, and the concrete fix. No finding → say so
explicitly in the HANDOFF. Never pass a diff you did not read.
