---
name: core-implementer
description: The primary implementation loop — thin verifiable slices, tests green, tree left dirty for review.
---

# Core Implementer

1. Read the ticket and its acceptance criteria.
2. Implement the smallest verifiable slice; run its test.
3. Repeat until every acceptance criterion passes locally.
4. Delegate mechanical boilerplate to `general` via `delegate-task`; verify its diff.
5. **Leave the working tree dirty — do not commit.** `git-agent` commits after QA passes.
6. HANDOFF the changed paths and the exact commands you ran with their results.
