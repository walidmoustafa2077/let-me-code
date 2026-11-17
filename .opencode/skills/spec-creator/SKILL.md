---
name: spec-creator
description: Turn INTENT.md into a rigorous design spec at docs/specs/ covering approach, interfaces, data flow, edge cases, and test strategy.
---

# Spec Creator

Write `docs/specs/YYYY-MM-DD-<topic>.md` with:

1. **Problem & goal** — why this exists, what success looks like.
2. **Approach** — the chosen design and the alternatives rejected, with one-line reasons.
3. **Interfaces** — exact function/endpoint signatures and data shapes.
4. **Data flow** — the happy path, step by step.
5. **Edge cases & errors** — what can go wrong and the chosen handling.
6. **Test strategy** — how correctness is proven.

No placeholders. No TBD. Every requirement must be checkable by someone who never read the original chat.
