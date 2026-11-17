---
name: emergency-halt
description: Safely abort active child sessions, snapshot uncommitted diffs, and revert working tree to clean HEAD.
---
# Emergency Halt
Use only when a run must stop immediately (runaway child, destructive change, human stop).
## Steps
1. Call `engine_halt_and_revert` to abort active child sessions and restore a clean tree.
2. Confirm the abort: check `engine_status` reports no active sessions.
3. Locate the preserved diffs in `.delegation/snapshots/` — the newest snapshot holds the uncommitted work.
4. Do not delete snapshots; they are the recovery record.
5. Report to the orchestrator and human: what was aborted, what snapshot was written, and the current HEAD.
## Rules
- Never force-push, hard-reset, or delete branches as part of a halt.
- Verify `git status` is clean and HEAD is unchanged before declaring the halt complete.
