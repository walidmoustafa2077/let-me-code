---
name: constraint-setter
description: Write CONSTRAINTS.md — the testable quality and security bar every ticket is graded against.
---
# Constraint Setter
Write `CONSTRAINTS.md` BEFORE implementation. Each constraint must be:
- **Testable** — a reviewer can check it and cite evidence.
- **Specific** — exact values, not adjectives.
Cover: correctness, security (secrets, input handling), performance budget, compatibility, and
what must NOT change. The QA gate and minimalism auditor grade against these lines.
