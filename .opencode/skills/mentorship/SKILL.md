---
name: mentorship
description: Guide, scaffold, and review junior-dev implementations — clear interfaces, thin slices, and coaching feedback.
---

# Mentorship

`senior-dev` mentors `junior-dev` before the QA quality gate:

1. **Scaffold the interface** — write the types, signatures, and stubs the junior will fill. The
   contract is yours; the implementation is theirs.
2. **Slice the task** — cut the ticket into one bounded, self-contained change at a time. No design
   decisions left to the junior.
3. **Delegate** — hand each slice to `junior-dev` via `delegation_delegate_task` with the scaffold
   files in `contextFiles` and acceptance criteria in the prompt.
4. **Inspect the uncommitted diff** (`changed_files`, `diff_stat`) against the scaffold, the ticket,
   and `CONSTRAINTS.md`. Read the diff; never pass one you did not read.
5. **Coach with specifics** — one finding at a time: file, line, what is wrong, and the concrete fix.
   Re-delegate the fix rather than silently rewriting it.
6. **Do NOT commit.** Leave the tree dirty; the QA quality gate and `git-agent` follow.
