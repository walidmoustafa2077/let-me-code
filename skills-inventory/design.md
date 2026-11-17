# Skills Inventory — design method

**Source:** tasteskill 2.5.1, skill `design-taste-frontend`, from the locally installed kit at
`~/.config/opencode/skills/taste-skill`. Ideas only — no upstream file is vendored, and the kit is
not a dependency of this factory.
**Delivered as:** `.opencode/skills/design-language/` (the method) and
`.opencode/skills/design-review/` (the gate + its checker)
**Size:** two `SKILL.md` files and one dependency-free script (~25 KB total, no assets, no build step)

## What moved where

| # | Upstream material | Factory home | Form |
|---|-------------------|--------------|------|
| 1 | The bar, the nine house rules | `design-language/SKILL.md` | House rules, rewritten as reviewable statements |
| 2 | Page kinds and the plan for each | `design-language/SKILL.md` | Kind table plus what each kind gets |
| 3 | One system, type, colour, rhythm tokens | `design-language/SKILL.md` | A single system section with the tokens in CSS-ready form |
| 4 | Copy, motion, responsive, accessibility | `design-language/SKILL.md` | Four short sections |
| 5 | The checklist, the run loop, the gate verdict | `design-review/SKILL.md` | Checker + visual walk + triage rules |
| 6 | `scripts/gate.mjs` (browser checker) | `design-review/scripts/review-ui.mjs` | New static checker, standard library only |
| 7 | Section library, palettes, type files, photo and icon tooling | *not carried over* | The method describes the intent; the factory does not ship a component catalogue |

## The checker

`node .opencode/skills/design-review/scripts/review-ui.mjs <file-or-dir> [--json]` walks the HTML,
reads inline and linked stylesheets, and reports `FAIL`/`WARN` findings against rule ids:

- **H1–H15** structure and copy: language, viewport, title and description, one `h1`, heading order,
  image alt text, no captions under visuals, no placeholder image hosts, no lorem or TODO text,
  real link targets, unique ids, labelled controls, `.example` contacts, a `main` landmark.
- **C1–C7** system: no violet or lavender, a media query, reduced-motion support, a 13px type floor,
  no tracked capitals, no positive `tabindex`, muted autoplay.

It prints one line per finding with `file:line`, then a `GATE: PASS` or `GATE: OPEN` verdict and exits
non-zero on any failure. It cannot judge taste — the visual walk in `design-review` covers what a
static checker cannot see.

## Wiring

- `visualizer` loads `design-language` before a prototype and runs `design-review` before reporting.
- `ui-engineer` loads `design-language` for page work and runs the same gate before handoff.
- `code-review-and-quality` runs `design-review` on any diff that touches a page, component or
  stylesheet, and treats an unwaived `GATE: OPEN` as a blocking finding.

## Relationship to the upstream kit

The kit stays installed locally for anyone who wants its browser checker, photo tooling and layout
library. Nothing here reads it: the factory skills are self-contained, and no install step or asset
link is required. Local adaptation from the upstream text: the house rules were tightened into
testable statements, the gate was reduced to what a static pass can prove, and the report format now
puts the verdict line first so a HANDOFF can quote it.
