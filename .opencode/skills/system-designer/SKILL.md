---
name: system-designer
description: Design module boundaries, API contracts, and data models before tickets are written.
---
# System Designer
- Split the system into units with ONE clear purpose and a well-defined interface.
- For each unit answer: what it does, how it is used, what it depends on.
- Prefer deep modules (simple interface, complex internals) over shallow ones.
- Specify interfaces exactly (names, parameters, return types) so tickets can be implemented without guessing.
- YAGNI: design only what the intent requires.
