# Skills Inventory — ponytail

**Source:** https://github.com/DietrichGebert/ponytail — vendored at `vendor/ponytail`
**Location:** `vendor/ponytail/skills/` (mirrored under `vendor/ponytail/.openclaw/skills/`)
**Total skills:** 6 (the `.openclaw` copy duplicates the same 6)

| # | Skill | Description |
|---|-------|-------------|
| 1 | ponytail | Lazy senior dev mode for any coding task (write, refactor, fix, review): YAGNI, stdlib first, no unrequested abstractions. Not for non-coding requests. (Short form.) |
| 2 | ponytail | Forces the laziest solution that actually works — simplest, shortest, most minimal. Channels a senior dev who has seen everything: question whether the task needs to exist (YAGNI), reach for the standard library before custom code, native platform features before dependencies, one line before fifty. Intensity levels: lite, full (default), ultra. Use on ANY coding task: writing, adding, refactoring, fixing, reviewing, designing code, choosing libraries/dependencies. Also on "ponytail", "be lazy", "lazy mode", "simplest solution", "minimal solution", "yagni", "do less", "shortest path", or complaints about over-engineering/bloat/boilerplate/unnecessary dependencies. Do NOT use for non-coding requests. (Full form.) |
| 3 | ponytail-audit | Whole-repo audit for over-engineering. Like ponytail-review but scans the entire codebase instead of a diff: a ranked list of what to delete, simplify, or replace with stdlib/native equivalents. One-shot report, does not apply fixes. Triggers: "audit this codebase", "audit for over-engineering", "what can I delete from this repo", "find bloat", "/ponytail-audit". |
| 4 | ponytail-debt | Harvest every `ponytail:` shortcut comment in the codebase into one debt ledger, so deliberate shortcuts and deferrals get tracked instead of rotting into "later means never". One-shot report, changes nothing. Triggers: "ponytail debt", "/ponytail-debt", "what did ponytail defer", "list the shortcuts", "ponytail ledger". |
| 5 | ponytail-gain | Show ponytail's measured impact as a compact scoreboard: less code, less cost, more speed, from the benchmark medians. One-shot display, not a persistent mode, not a per-repo number. Triggers: "/ponytail-gain", "ponytail gain", "what does ponytail save", "show ponytail impact", "ponytail scoreboard". |
| 6 | ponytail-help | Quick-reference card for all ponytail modes, skills, and commands. One-shot display, not a persistent mode. Triggers: "/ponytail-help", "ponytail help", "what ponytail commands", "how do I use ponytail". |
| 7 | ponytail-review | Code review focused exclusively on over-engineering. Finds what to delete: reinvented standard library, unneeded dependencies, speculative abstractions, dead flexibility. One line per finding: location, what to cut, what replaces it. Triggers: "review for over-engineering", "what can we delete", "is this over-engineered", "simplify review", "/ponytail-review". |

> **Note:** `ponytail` appears twice in the source (a short and a long SKILL.md); the set has 6 distinct skill names. Two copies of the whole set exist — `skills/` and `.openclaw/skills/`.
