---
name: code-review-and-quality
description: Review the implementation diff against the spec and CONSTRAINTS.md, reporting every violation with file, line, and reason.
---

# Code Review and Quality

Review the ticket's diff **against the spec and `CONSTRAINTS.md`** (not against taste):

1. Does every requirement in the ticket have a corresponding change?
2. Does any change violate a `CONSTRAINTS.md` rule? Cite it.
3. Interfaces: do the signatures match the spec exactly?
4. Edge cases: are the spec's listed cases handled?
5. YAGNI: is there unneeded abstraction or dead code?

Report findings as a precise list (file, line, why). This step runs **before** tests. A diff with an
unresolved finding does not proceed.
