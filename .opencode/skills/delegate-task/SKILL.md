---
name: delegate-task
description: Hand a strictly scoped, mechanical coding task to the background worker (general) and integrate its diff.
---

# Delegate Task

Call `delegation_delegate_task`:

```
agent: "general"
prompt: "<one precise, self-contained mechanical task>"
contextFiles: ["<files the worker must read>"]
```

Then:
1. **Stay awake** — the call blocks until the worker finishes.
2. **Review the returned diff** (`changed_files`, `diff_stat`). If it violates `CONSTRAINTS.md`,
   fix it inline or re-delegate with a sharper prompt.
3. **Do NOT commit.** Integrate the worker's files into the working tree; `git-agent` commits after
   the quality gate passes.

Only delegate work you could fully specify yourself. Never delegate design decisions.
