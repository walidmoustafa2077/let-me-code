---
name: core-router
description: Classify an incoming human request as spike, bounded, or architectural and route it to the correct factory workflow.
---

# Core Router

Decide the shape of the work before dispatching anything:

- **Spike** — a feasibility question. Answer it directly; no spec, no tickets.
- **Bounded** — a small change to code already in this repo. One ticket, straight to senior-dev then qa-engineer.
- **Architectural** — a new subsystem or something that changes interfaces others depend on. Full loop:
  architect → tickets → senior-dev → qa-engineer.

Say the classification out loud. When in doubt, take the heavier path. Never skip the INTENT step for
architectural work.
