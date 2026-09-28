---
name: state-manager
description: Maintain BOARD.md as the single source of truth, moving tickets between Todo, In Progress, In Review, Blocked, and Done.
---

# State Manager

You (the orchestrator) are the **only** writer of `BOARD.md`.

- Read with `delegation_board_read`.
- Move with `delegation_board_update` (`ticket`, `column`, optional `note`).
- A Todo ticket is **eligible** only when every ticket in its `depends_on` is **Done**.
- `Blocked` is reachable from any column; always attach the concrete reason in `note`.
- After a fix-loop failure ceiling (2 cycles), move the ticket to `Blocked` with `needs-input` and
  escalate to the human.
