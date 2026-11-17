---
name: design-review
description: Gate a page against the design-language house rules before handoff — run the checker, walk the visual list at desktop and phone widths, and report a GATE verdict with every waiver; use when a UI page or prototype is about to be called done.
---

# Design Review

Evidence before `done`. A page is not finished because it looks right to its author; it is
finished when the house rules in `design-language` hold at 1440 and 390, and the checker agrees.

## Run the checker first

```bash
node .opencode/skills/design-review/scripts/review-ui.mjs <file-or-dir> [--json]
```

It statically checks one HTML file, every `*.html` under a directory (skipping
`node_modules`, `.git`, `dist`, `build`), and the local stylesheets they link. It prints one
line per finding with rule id, `file:line` and reason, then a final `GATE:` line. Exit code is
1 when any finding is a failure, 0 when only warnings remain.

What it can prove: lang, viewport meta, title and description, exactly one h1, heading order,
image alt text, no `<figcaption>`, no placeholder-image hosts, no lorem/TODO text, no `href="#"`,
no duplicate ids, labelled inputs, `.example` contacts, no violet, a `@media` block, a
`prefers-reduced-motion` block, no positive `tabindex`, no unmuted autoplay, no type under 13px,
a `<main>` landmark.

What it cannot prove — you must look: whether the design is any good, whether photographs are
the client's or labelled stand-ins, whether the section rhythm holds on screen, hover and focus
behaviour, contrast on real pixels, overflow at 320, and whether a claim in the copy is true.

## Then walk the visual list

At 1440 and at 390, on the rendered page:

1. One section per screen; the hero alone on the first screen; no neighbouring heading peeking.
2. Equal left and right edges; nothing wider than its container.
3. Every image loaded; no empty frame, no grey panel standing in for a product.
4. Motion: hover lift, photo zoom, button press; nothing tilts; no scroll-triggered fade.
5. Contrast and focus: tab through the page, read every label, watch the focus ring.
6. Copy: one hard fact on the first screen, nouns in headings, verb + object buttons, no
   invented figure, no lorem, no printed `.example` address.

## Triage and waivers

- Fix failures. Three rounds is the limit; if a failure survives three rounds, stop and report
  it as open rather than rewriting the page around the checker.
- A failure the checker has judged wrongly — a false positive — is waived **in writing**, with
  the rule id and the reason it does not apply. Never change the page to please a rule that is
  wrong, and never weaken the checker to pass.
- Warnings are judgement calls; list the ones you accepted.

## Report

Put the verdict on the first line of the handoff, then the findings:

```
GATE: PASS            (or GATE: OPEN — with the count of open failures)
FAIL ui/H9  src/index.html:42  placeholder image host picsum.photos
WARN ui/C3  src/index.html:9   no prefers-reduced-motion block
WAIVED ui/H10  src/index.html:61  "TODO" is inside a code sample, not visible copy
```

`GATE: OPEN` means the page is not done. Never report `status: done` without a `GATE:` line.
