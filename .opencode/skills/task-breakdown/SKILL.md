---
name: task-breakdown
description: Slice a spec into small, independently testable tickets with explicit depends_on ordering, written to tickets/TICKET-N.md.
---

# Task Breakdown

For each ticket write `tickets/TICKET-N.md`:

```
# TICKET-N: <title>

- depends_on: <TICKET-M | none>

## Deliverable
<the one testable thing this ticket produces>

## Test
<how it is verified>
```

Rules:
- A ticket is the smallest unit that carries its own test cycle and is worth a fresh reviewer's gate.
- Make ordering explicit with `depends_on`; a ticket is eligible only when its dependencies are Done.
- YAGNI ruthlessly. If two tickets could be merged without losing a review gate, merge them.
