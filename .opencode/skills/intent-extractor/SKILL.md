---
name: intent-extractor
description: Interview the human one question at a time until problem, scope, stack, data, privacy, interface, look and done-criteria are unambiguous, then write INTENT.md.
---

# Intent Extractor

Your job is to remove every assumption you would otherwise guess at. The factory builds exactly
what `INTENT.md` says, so an unasked question becomes a wrong line of code ten minutes later.

## How to run the interview

- **One question per turn.** Use the `question` tool. Never put two questions in one call.
- **Wait for the answer**, then write two lines: what you now know, and what that answer changed in
  your plan.
- **Offer options, not open prompts.** Two to four concrete choices, each carrying its trade-off in
  the label. The human can always type their own.
- **Follow the surprise.** If an answer contradicts an earlier one, or hides a word like *simple*,
  *fast*, *modern*, *clean*, *flexible* — ask what that means in numbers or in an example.
- **Never assume for them.** If they say "you decide", give two options with the consequence of
  each and make them pick. Record what they chose.
- **No maximum number of questions.** There is a minimum: every line below is answered, or the
  human explicitly defers it.
- **Stop when** the coverage list is done and the human says *enough* / *that's it* / *go*, or says
  *just build it*. Then write `INTENT.md`.

## Coverage list

Ask in this order, skipping only what the first message already answered.

**1. Problem and user**
- Who has this problem, and what do they do today instead?
- What one sentence describes success?
- Is this a demo, a tool for you, or something other people will use?

**2. Scope**
- What is in this version?
- What is explicitly out, even though it is tempting?
- What must not break or change?

**3. Stack and constraints** — only if the repo has no stack yet
- Language and framework, and why that one over the obvious alternative.
- Runtime and version floor, where it will be hosted, and the budget (free tier, local only, VPS).
- Dependency, licensing, or "no new dependency" limits.

**4. Data**
- What data comes in, in what shape, and who owns it?
- Does it persist? For how long, and who can read it?
- What happens to bad input — reject, repair, or guess?

**5. Accounts and privacy**
- Anonymous or accounts. Stored or stateless.
- What data must never leave the machine, and what must never appear in a log.

**6. Interface**
- Screens or endpoints, and the primary path through them.
- The one screen or endpoint that must not be slow or ugly.
- Device and viewport targets.

**7. Look and feel** — for anything with a UI
- Two products the human likes and one they hate.
- Three adjectives for the brand, and one thing to avoid.
- Is there existing brand — logo, colours, type, photographs?

**8. Done**
- How will the human check it works, in concrete steps?
- What is the smallest version they would still call finished?
- What should the factory confirm with them before shipping?

## INTENT.md format

```
# Intent — <project>

## Goal
<one sentence, no adjective you cannot test>

## Constraints
- <hard constraint, with its number or version>

## Success criteria
- [ ] <something a person can check without reading this chat>

## Decisions made with the human
| Question | Answer | Consequence |
|---|---|---|

## Out of scope
- <thing the factory must not build>
```

## Rules

- You produce `INTENT.md` and nothing else. No code, no spec, no tickets.
- Do not ask what you could read from the repo — check first, then ask only the delta.
- If one message already covers everything, do not pad the interview. Write the file and say why
  the list is complete.
