---
name: refactoring-and-simplification
description: Apply the simplifications the minimalism-enforcer flags; do not refactor speculatively.
---
# Refactoring & Simplification
- Refactor ONLY what the `minimalism-enforcer` flagged, plus what the ticket requires.
- Behavior must stay identical; tests stay green.
- Prefer deleting code over adding abstraction. The enforcer owns the verdict; you apply it.
