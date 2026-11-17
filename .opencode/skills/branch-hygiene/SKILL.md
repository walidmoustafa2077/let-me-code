---
name: branch-hygiene
description: Prune stale worktrees, clean temporary task branches, and enforce pre-commit checks.
---
# Branch Hygiene
- List worktrees before touching anything: `git worktree list`.
- Prune stale worktrees whose branch is merged or gone: `git worktree prune`.
- Remove a worktree only after `git worktree remove <path>` succeeds without `--force`.
- Delete a temporary task branch only when it is merged into the base: verify with `git branch --merged <base>`.
- Never delete a branch with unmerged commits; escalate instead of forcing.
- Before merging, require a clean state: no unstaged changes, tests green, and no untracked task artifacts.
- Run the repo's pre-commit checks (lint, typecheck, tests) and read the raw output before declaring the tree clean.
- Leave the main worktree checked out on the base branch with a clean `git status`.
