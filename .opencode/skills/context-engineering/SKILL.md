---
name: context-engineering
description: Assemble the minimal, precise context a child agent needs; never dump the whole repo.
---
# Context Engineering
- Pass only the files a child needs: the ticket, `CONSTRAINTS.md`, the relevant spec section.
- Prefer paths in `contextFiles` over pasting content into the prompt.
- Keep prompts scoped to ONE ticket. Name the exact acceptance criteria to satisfy.
- If a child returns `needs-input`, add the missing artifact rather than re-explaining.
