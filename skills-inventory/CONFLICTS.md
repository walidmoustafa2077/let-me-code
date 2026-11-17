# Skill Conflicts & Overlaps — Cross-Set Analysis

**Scope:** the 5 vendored skill sets under `vendor/` — `addy-agent-skills` (25), `delegate-skills` (18), `matt-skills` (38), `ponytail` (6), `superpowers` (15). **Total distinct-named skills: 102.**

This document flags where two or more skills compete for the same trigger or hold mutually exclusive philosophies, so a dispatcher (human or agent) knows which to prefer and which to suppress.

---

## 1. Direct conflicts (mutually exclusive — pick one)

These pairs/dispatchers **cannot both fire** on the same task without contradicting each other.

### 1.1 Meta-discovery authority — who governs all skills?
| Skill | Set | Claim |
|-------|-----|-------|
| `using-agent-skills` | addy | "The meta-skill that governs how all other skills are discovered and invoked." |
| `using-superpowers` | superpowers | "Establishes how to find and use skills, requiring skill invocation before ANY response." |
| `ask-matt` | matt | "A router over the skills in this repo." |

**Conflict:** three skills each claim to be *the* discovery layer. Two "govern all skills" authorities is a contradiction — only one router can own dispatch. **Resolution:** choose one as top-level router; treat the others as set-local only.

### 1.2 Over-engineering philosophy vs. add-more-code skills
| Skill | Set | Stance |
|-------|-----|--------|
| `ponytail` (+ audit/review/debt) | ponytail | YAGNI, stdlib first, delete abstractions, **add nothing unrequested** |
| `constraint-driven-development` | addy | Enforce thresholds/coverage/quality bar in `CONSTRAINTS.md` |
| `security-and-hardening` | addy | Add validation, auth, dependency audits |
| `observability-and-instrumentation` | addy | Add logging, metrics, tracing, alerting |
| `documentation-and-adrs` | addy | Add ADRs and docs |

**Conflict:** ponytail says "do less, delete code, no unrequested abstractions"; the addy skills say "add gates, add instrumentation, add hardening, add docs." Running ponytail mode *and* an add-safety skill simultaneously is philosophically opposed. **Resolution:** ponytail wins on *structure/abstraction/deps*; the addy skills win on *mandated non-functional requirements* (security, observability) — never let ponytail strip a required safety control.

### 1.3 Simplification ownership
| Skill | Set |
|-------|-----|
| `code-simplification` | addy |
| `ponytail` / `ponytail-review` | ponytail |

Both target "refactor for clarity / delete complexity." Different triggers and severity model (ponytail = lazy-minimalist mode with intensity levels). **Resolution:** pick one simplification authority per task.

### 1.4 Delegation target is mutually exclusive
The 17 `*-delegate` skills (agy, aider, claude, cline, codex, commandcode, copilot, cursor, grok, kimi, omp, opencode, pi, qoder, vibe, warp, zcode) all share one trigger ("delegate this to <CLI>"). Since each names a *different* external CLI, only one can execute a given task — they are **mutually exclusive by construction**, not merely redundant. Additionally `delegate-setup` explicitly excludes dispatch (config only), so it must not be confused with the 17.

### 1.5 Delegation model: external CLI vs. in-session subagents
| Approach | Skills | Set |
|----------|--------|-----|
| External CLI implementer | the 17 `*-delegate` | delegate-skills |
| In-session subagents | `subagent-driven-development`, `dispatching-parallel-agents` | superpowers |
| Inline self-execution | `executing-plans` | superpowers |

**Conflict:** `executing-plans` says *execute it yourself inline*; the delegate skills say *hand it to an external CLI*; `subagent-driven-development` says *use in-session subagents*. Three incompatible execution models for "run this plan." **Resolution:** pick the execution model once, per plan.

---

## 2. Direct name collisions (same skill name in two sets)

| Skill name | Sets | Note |
|------------|------|------|
| `test-driven-development` | addy **and** superpowers | Two skills, identical name, different bodies/workflows → dispatcher ambiguity. |
| `ponytail` | ponytail (×2 internally) | Short form + full form in the same repo. |
| `ponytail-*` (audit/debt/gain/help/review) | ponytail `skills/` **and** `ponytail/.openclaw/skills/` | Same 6 skills duplicated in two directories — install one copy only. |

---

## 3. Functional overlaps (redundant — pick one per task)

### 3.1 Testing / TDD — 3 skills
- addy `test-driven-development`
- superpowers `test-driven-development`
- matt `tdd`

All trigger on "implement test-first / red-green-refactor." **Pick one.**

### 3.2 Debugging — 3 skills
- addy `debugging-and-error-recovery`
- superpowers `systematic-debugging`
- matt `diagnosing-bugs`

All trigger on "bug / failure / broken / slow." Competing methodologies; **pick one.**

### 3.3 Planning & execution — 5+ skills
- superpowers `writing-plans`, `executing-plans`
- addy `planning-and-task-breakdown`, `incremental-implementation`
- matt `implement`, `implement-spec`, `to-tickets`, `wayfinder`

Overlapping "break work down / execute a plan."

### 3.4 Spec creation — 3 skills
- addy `spec-driven-development`
- matt `to-spec`
- superpowers `brainstorming` (produces design/spec intent)

### 3.5 Clarify-intent interviewing — 4 skills
- addy `interview-me`
- matt `grill-me`, `grilling`, `grill-with-docs`
- superpowers `brainstorming` (intent exploration)

All "extract what the user actually wants before building." `grill-with-docs` additionally writes ADRs/glossary — overlapping `documentation-and-adrs` and `domain-modeling`.

### 3.6 Code review — 5 skills
- addy `code-review-and-quality` (multi-axis)
- superpowers `requesting-code-review`
- superpowers `receiving-code-review`
- matt `code-review` (Standards + Spec axes)
- ponytail `ponytail-review` (over-engineering only)

`requesting`/`receiving` are complementary (produce vs. consume), but `addy code-review-and-quality`, `matt code-review`, and `ponytail-review` all *perform* review. ponytail-review is intentionally narrow (complexity only) and can coexist as an *additional* lens, but not as a replacement for correctness review.

### 3.7 Writing skills/docs authored for agents — 2 skills
- superpowers `writing-skills`
- matt `writing-for-agents`

Both cover authoring SKILL.md / AGENTS.md / CLAUDE.md.

### 3.8 Handoff — 2 skills
- matt `handoff`
- matt `claude-handoff`

Same repo, overlapping purpose (compact conversation → another agent).

### 3.9 Architecture/design vocabulary
- matt `codebase-design`, `improve-codebase-architecture`, `domain-modeling`
- addy `api-and-interface-design`

Adjacent; matt's are deep-module-centric, addy's is API-contract-centric — overlap where a module boundary is both.

### 3.10 ADR / decision recording
- addy `documentation-and-adrs`
- matt `domain-modeling` (records ADRs) and `grill-with-docs` (creates ADRs)

---

## 4. Intra-set overlaps inside `matt-skills`

- `grill-me` vs `grilling` vs `grill-with-docs` — three grilling variants.
- `handoff` vs `claude-handoff` — both conversation handoff.
- `implement` vs `implement-spec` — both "implement a spec."
- `tdd` vs `code-review`'s Spec axis — minor.

Inside `superpowers`:
- `using-git-worktrees` vs `finishing-a-development-branch` vs `subagent-driven-development` — all touch the plan-execution lifecycle; sequential, not conflicting, but all may try to own "before executing a plan."

---

## 5. Adjacent / low-grade tensions (coordinate, not conflict)

| A | B | Tension |
|---|---|---------|
| ponytail "stdlib before deps" | addy `performance-optimization` / `source-driven-development` | ponytail discourages adding libs; optimization/docs skills may recommend one. |
| matt `git-guardrails-claude-code` (block `git push`) | addy `git-workflow-and-versioning` (commit/push/PR flow) | Guardrail may block a step the workflow wants. |
| addy `constraint-driven-development` | superpowers `verification-before-completion` | Both enforce "prove it"; overlap on evidence gates (complementary). |
| matt `prototype` (throwaway UI/logic) | ponytail (no speculative code) | Prototype builds disposable code; ponytail hates disposable code. |
| addy `frontend-ui-engineering` | matt `prototype` | Both may generate UI; one production, one throwaway. |

---

## 6. Summary — conflict clusters

| Cluster | Skills involved | Type |
|---------|-----------------|------|
| Skill-discovery authority | `using-agent-skills`, `using-superpowers`, `ask-matt` | Direct |
| Minimalism vs. hardening | `ponytail*` vs `constraint-driven-development`, `security-and-hardening`, `observability-and-instrumentation`, `documentation-and-adrs` | Direct |
| Simplification owner | `code-simplification` vs `ponytail*` | Direct |
| Delegation target | 17 `*-delegate` | Direct (mutually exclusive) |
| Execution model | 17 `*-delegate` vs `subagent-driven-development`/`dispatching-parallel-agents` vs `executing-plans` | Direct |
| TDD | 3 skills | Overlap |
| Debugging | 3 skills | Overlap |
| Planning/execution | 5+ skills | Overlap |
| Spec creation | 3 skills | Overlap |
| Intent interviewing | 4 skills | Overlap |
| Code review | 5 skills | Overlap |
| Writing skills | 2 skills | Overlap |

---

## 7. Recommended dispatch rules

1. **One discovery router.** Pick `using-superpowers` **or** `using-agent-skills` **or** `ask-matt` as the entry skill; scope the other two to their own set.
2. **One TDD, one debugger, one reviewer.** Keep a single primary per function (e.g. superpowers `test-driven-development`, `systematic-debugging`, addy `code-review-and-quality`), and demote the rest to opt-in.
3. **Ponytail is a mode, not a peer.** Apply it as a lint lens on *structure/deps*, and explicitly exempt mandated safety/observability/doc requirements from its "delete" mandate.
4. **Delegation is one-flag.** Enable exactly one `*-delegate` per installed CLI; never let two fire on one task.
5. **Decide execution model up front** (inline vs subagents vs external CLI) before loading any planning skill.
6. **Dedupe the vendored files:** drop `ponytail/.openclaw/skills/` (duplicate of `ponytail/skills/`) and reconcile the two `test-driven-development` skills to one.
