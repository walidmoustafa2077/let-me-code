---
name: commit-conventions
description: Land verified work as clean, separated feat and test commits — and never push.
---
# Commit Conventions
- Commit ONLY work you were told passed the quality gate.
- Separate the **test** commit (`test(TICKET-N): ...`) from the **feat** commit (`feat(TICKET-N): ...`).
- One ticket = those two commits, nothing unrelated.
- Never `git push`, never force, never `reset --hard`. Push/PR only via a GitHub MCP if the human asked.
- If the tree is clean or unverified, refuse and HANDOFF `blocked`.
