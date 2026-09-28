---
name: core-implementer
description: Implement a ticket in thin verifiable slices, checking CONSTRAINTS.md at each step and committing atomically.
---

# Core Implementer

1. Read the ticket, `CONSTRAINTS.md`, and the spec.
2. Work in **thin slices** — the smallest change that moves the ticket forward and can be checked.
3. After each slice, run the relevant check (`node --test`, build, lint).
4. Keep the diff small and aligned with the spec's interfaces.
5. Commit when the slice is green: `feat(TICKET-N): <summary>`.

Delegate only mechanical work (scaffolding, boilerplate, bulk renames) to `general` via the
`delegate-task` skill. Keep the judgment calls.
