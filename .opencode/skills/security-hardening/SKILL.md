---
name: security-hardening
description: Multi-tier security SAST — dynamically leverage Semgrep MCP if available, falling back to static regex and heuristic pattern scans.
---

# Security Hardening

`qa-engineer` runs a tiered SAST pass on the ticket diff:

1. **Detect the tool** — check for `semgrep_*` MCP tools (e.g. `semgrep_scan`). Use them if present.
2. **Tier 1 — Semgrep** — when available, run Semgrep SAST against the changed files and triage its
   findings by severity.
3. **Tier 2 — static fallback** — when Semgrep is unavailable, scan the diff with regex/heuristic
   rules:
   - **Secrets** — API keys, tokens, passwords in code, logs, or error messages.
   - **Command injection** — unvalidated input reaching shell, `exec`, or `eval`.
   - **Path traversal** — `..`, absolute paths, writes outside the repo root.
   - **Unsafe eval/SQL** — dynamic `eval`, string-built SQL, or unsanitized query construction.

Any finding → report `status: blocked` with file, line, severity, and the concrete fix. No finding →
say so explicitly in the HANDOFF. Never pass a diff you did not read.
