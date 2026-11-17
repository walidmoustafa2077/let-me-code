---
name: design-language
description: Design and build a company website that looks made for its client — one system, one section per screen, real photographs, quiet motion; use for any landing, marketing, product, place or company page, in static HTML or inside an existing framework.
---

# Design Language

The bar: the website a good company would ship. It says plainly what is sold, shows the real
thing on every screen, and looks made for this client and no other. Sit beside figma.com and
x.ai, not beside a template.

Use with `design-review` — that skill runs the gate. This one decides the design.

## House rules (these win over your taste, and over the brief)

1. **No caption under any visual.** No description, no "figure 1", no dimension note. Licence
   credits go in one footer line.
2. **Every visual renders.** No empty frame, no blank ground, at 1440, 1024, 768 and 390.
3. **One section per screen.** The hero stands alone on the first screen. Each section is one
   to two screens at 1440×900; a neighbouring heading never peeks in.
4. **Equal left and right content edges.** The text block and everything under it share the
   same left and right edge.
5. **Quiet motion, always present.** Linked card lifts 2px; photograph zooms 1.02–1.03 inside
   its frame; buttons step on hover, press on click; underlines draw. Nothing tilts, no
   carousels, no timed tabs. The hero enters once on load. Every page carries one dealt moment,
   two on a long page.
6. **Real photographs beat everything.** More of them, better ones, where they fit — and
   better backgrounds, heroes, layouts and fonts than the obvious ones.
7. **Real icons and real diagrams.** A known product's real, full-colour icon, never a drawn
   look-alike. Small diagrams inside cards (a hub with branches, input → processor → three
   lanes, a pulse along a line).
8. **Scenes only for technical trades.** Shader effects and 3D scenes belong to tech, AI, dev
   tools, gaming, fintech and hardware. A cafe, bakery, guesthouse or shop gets photographs,
   flat colour and type.
9. **Addresses and contacts stay fictive.** Street and district only (district alone if there
   is no street), never a house number, postcode or coordinates. No register or VAT numbers.
   No phone in a real format. Every contact on `.example`.

## Pick the page kind first

| The client | Kind |
| --- | --- |
| Sells an app, SaaS, AI product or dev tool; fintech; a studio selling its own software | `software` |
| A game, or a studio launching one | `gaming` |
| Hardware, a device, a drone, a robot arm, a keyboard | `tech` |
| Any other physical product | `product` |
| People are hired — clinic, law firm, agency, trade | `service` |
| People come to it — cafe, bar, bakery, restaurant, guesthouse, hotel, shop, florist, bike shop, gym | `place` |

A maker who also opens the door or teaches is a **place**; the web shop becomes its goods
section. `software`, `gaming` and `tech` share the tech license (effects, scenes, loops,
counters, CSS grounds, dark pages). Every other kind works with photographs, flat colour,
type, real icons, a hero entrance, one dealt moment and the hover layer.

## What each kind gets

**Place.** Photographs lead: 12–20 across the page (8–12 when compact; fewer than 8 means a
three-screen page, not a shorter one). The hero is a photograph whenever a frame fits. Screen
two is the visit block; then what is on offer, the place itself, orders and booking. Flat
grounds, square photographs, one button style, a phone action bar. One type moment — the
address or the name set large. List text 16px. No effects, grounds, loops, diagram or tabs.

**Product and service.** Photographs lead: the product, the people, the rooms, the work. Real
icons for the tools the client actually uses. At most one still diagram. Flat grounds plus one
brand band. No shader, print, grain, gradient, scene or loop. A product with no photographs is
shown with stand-ins of the same kind of thing, each named in the report. A 3D render only
when the brief asks for one; never a drawing, never mood stock.

**Product page, every time.** The product big and whole where it stands — not mid-size in a
grey panel. A different picture per section. Every headline promise pictured. One contrasting
ground. A swatch change actually changes the picture. No fact stated twice.

**Tech.** The client's own subject leads at its true size. Software shows its own interface as
live HTML in one app frame (a real diff with its Accept action, not a generic dashboard).
Hardware shows its photographs or stand-ins. A game puts its name in the h1, a launch line,
and its world as full-bleed key art — or the name large over stand-in photographs of its
setting. 60–80 words a screen outside interface mocks. One effect plus one or two moments. At
most four live WebGL contexts. Nothing moves because the page scrolled. The client's own
assets (trailer, key art, screenshots, CAD, motion) each get a finished slot, never an empty
one.

One object never carries the page: hero plus at most two more sections.

## One system per page

One button shape, one radius family, one card recipe, one hairline, one link look, one block
template. Never a second grid, spacing scale or type scale.

- Spacing: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.
- Grid: 12 columns, 24px gap (12 under 640).
- Rhythm (desktop / under 640): `--nav` 72/56, `--padt` 120/96, `--padb` 72/48, `--gut` 80/24
  (place 120 from 1024), `--hgap` 48/40 (place 40/24), `--hpadb` 64/24.
- `* { box-sizing: border-box }`, body margin 0, viewport meta with `viewport-fit=cover`.
- Skip link is the first child of the header: `<a class="skip-link" href="#top">`, `main id="top"`.

**Type.** Tokens for h1, h2, h3, lead, card title, body 16, small 14, label 13, stat. Body is at
least 16px, line-height 1.5–1.8, nothing below 13px ever. Lines run to 62 characters at most.
Sentence case; labels 13px at weight 500; never tracked capitals or small caps. Italic only for
quotes, attributions and contacts. Curly quotes. A number never breaks from its unit. Text is
never baked into an image. One size per kind of element.

**Colour.** Interface is 90–95% neutral, one near-black ink (warm is fine, never `#000`), one
accent used on under 3% of a screen — it drives the primary button, links and focus. Real logos
keep their own colour. Three ground tokens plus at most one brand band. Choose the grade once,
on load, not by scroll. **Never violet or lavender** in the page's own design.

**Contrast.** Body ink at least 7:1; muted text at least 4.5:1 and only for labels or meta;
large text at least 3:1; on a place page 4.5:1 everywhere and 7:1 on the brand band.

## Copy that says something

- The h1 names the category and either the buyer or the place. A game: its name and genre.
- One hard fact on the first screen.
- A noun in every heading; buttons are verb + object; at most two hero actions and no action
  twice on one screen.
- 60–80 words per screen on tech.
- Invent nothing but a coined brand name (search it, keep the result) and, on a place,
  plausible hours and prices, each marked as assumed.
- No lorem, no placeholder, no sample note, no printed `.example` address on a live page.
- No slop word, no stock phrase. One fact, one wording.
- A heading's grey run-on is its own sentence, not a fragment.
- Every link lands; every form submits and errors per field.

## Motion

Every button, link, linked card and linked photograph answers the pointer. Nothing tilts. The
hero enters once. One or two dealt moments per page. A card loop runs 2.5–4s. Nothing moves
because the page scrolled, except a dealt moment inside its own section or the big scene on a
tech page. Anything moving longer than 5s has a pause button. Under `prefers-reduced-motion`
everything rests and nothing stays hidden.

## Responsive

Check 1440, 1024, 820×1180, 768×1024 and 390, plus a 320 walk for overflow, collisions and tap
size. On a phone every section is at least one screen tall and grows with its content. Every
control outside running text is at least 44px tall. One column at 390, buttons full width,
full-screen menu. Splits stack text first.

## Accessibility floor

Every control named, every picture described, visible labels, one heading level at a time, no
`tabindex` above 0. The skip link is first in tab order. Focus is visible immediately and never
lands under the header. A menu button announces its state. `lang`, title, description and share
tags are all set.

## Never

Cards or rows fading in on scroll, a fade on every section, parallax on text, scroll-jacking,
random blinking. Stock photographs passed off as the client's own product, people or place —
stand-ins are always labelled. A product page that never shows the product. A drawn look-alike
of a real logo. Invented reviews, quotes, customers or figures. Violet. Copied code, copy,
pictures or a signature effect from a reference site.
