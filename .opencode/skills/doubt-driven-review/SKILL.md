---
name: doubt-driven-review
description: Adversarial review of a plan — find the way it fails before code is written.
---
# Doubt-Driven Review
- Attack the plan's assumptions: what is assumed but never stated?
- Attack the constraints: what is security/correctness-relevant but unspecified?
- Name the single most likely real-world failure.
- Return at most 5 prioritized findings, each with a concrete fix. No filler.
