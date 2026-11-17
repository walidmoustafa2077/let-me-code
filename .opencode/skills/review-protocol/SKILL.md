---
name: review-protocol
description: How to review an uncommitted diff — verify against the spec, not the author's summary.
---
# Review Protocol
- Review `git diff HEAD` (the uncommitted work); the author's summary is a claim, not evidence.
- For each acceptance criterion, cite the code and the test that prove it.
- Report findings as PASS/FAIL with file:line and the exact reason.
- Never approve code you did not read. Never soften a failure to be agreeable.
