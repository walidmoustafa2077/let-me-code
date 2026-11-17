---
name: incremental-implementation
description: Build in thin, verifiable slices — smallest change that passes, then expand.
---
# Incremental Implementation
- Implement ONE thin slice, run its test, then the next.
- Never batch a large change you cannot verify step by step.
- Keep each slice small enough to hold in your head and to review in isolation.
