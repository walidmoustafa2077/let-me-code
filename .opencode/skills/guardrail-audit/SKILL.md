---
name: guardrail-audit
description: Systematically audit agent permission boundaries, path traversal guards, and MCP tool schemas.
---

# Guardrail Audit

`challenger` verifies that a proposed blueprint, file write, or execution contract cannot escape its
sandbox. Check each item:

- **Permission boundaries** — does the plan use only tools/agents the actor is permitted to call?
- **Repo roots** — does every path stay inside the repo? Reject `..` traversal, absolute paths, and
  writes outside the workspace root.
- **MCP tool schemas** — do the arguments match the declared schema, with no free-form fields that
  bypass validation?
- **Destructive operations** — flag `push`, `reset --hard`, `rm -rf`, and any force or overwrite that
  is not explicitly sanctioned by the ticket.

Report each violation with file, line, and the fix; state `status: blocked` on any escape. Clean →
say so explicitly. Never approve a plan you did not trace end to end.
