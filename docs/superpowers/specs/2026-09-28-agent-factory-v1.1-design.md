# Design — "Agent Factory" v1.1 (Review-Before-Commit + Second Wave)

- **Date:** 2026-09-28
- **Status:** Approved (pending spec review)
- **Repo:** `C:\Dev\let-me-code`
- **Base branch:** `feat/agent-factory-v1` (v1 accepted, unmerged) · **work branch:** `feat/agent-factory-v1.1`
- **Runtime:** opencode 1.18.30 (harness) · Node v24.17.0 (MCP) · git 2.54.0.windows.1 · win32
- **Supersedes/extends:** `docs/superpowers/specs/2026-09-28-agent-factory-design.md` (v1)

---

## 1. Problem & Goal

v1 proved the spine: an orchestrator LLM driving architect → senior-dev → qa-engineer through a
warm-server delegation MCP, with a markdown `BOARD.md` and a nested-delegation payoff. Two problems
remain:

1. **History pollution.** In v1 the implementer (senior-dev) and the test author (qa-engineer) commit
   *before* review. A quality-gate failure therefore lands in git history. Review must happen **before**
   anything is committed.
2. **Scope hunger.** v1 shipped 11 superskills and 4 agents; the vendored inventory (102 skills) holds
   substantially more useful capability that was never assigned. Every agent is under-skilled.

**v1.1 goal:** introduce a **review-before-commit gate** with a single git writer (`git-agent`), and add a
**core second wave** of agents and superskills so each agent owns its real capability set. No bad commit
ever enters history; no agent is a one-trick pony.

## 2. Approach (chosen: A — "git-agent owns all git writes; QA gates before commit")

- **Single git writer.** `git-agent` is the ONLY actor permitted to run `git add` / `git commit`.
  `senior-dev`, `qa-engineer`, and `architect` edit files and read git, but **never commit**. This extends
  the v1 single-writer principle (orchestrator owns `BOARD.md`) to git history.
- **Gate before commit.** The implementer leaves the working tree **dirty**; QA reviews the *uncommitted*
  diff against the spec and runs tests; only on PASS does the orchestrator dispatch `git-agent` to land the
  commits.
- **Failure is free.** A failed gate commits nothing; the ticket goes to `Blocked` and enters the fix loop.

Rejected alternatives:
- **B — git-agent calls new MCP `git_commit`/`git_status` tools** instead of bash. More structured and
  auditable (reuses `mcp/delegation/src/git.ts`), but duplicates capability and adds tools. Kept as a
  **later refinement**, not v1.1.
- **C — orchestrator commits.** Rejected: re-introduces "the manager does everything" and widens the
  orchestrator's blast radius.

## 3. The v1.1 Flow

```
1 INTAKE     orchestrator: core-router + intent-extractor → INTENT.md → board_init
2 BLUEPRINT  --delegation_delegate_task(architect, ctx:[INTENT.md])-->
                architect: spec-creator → spec ; task-breakdown → CONSTRAINTS.md + tickets
             orchestrator: board_update → Todo populated, depends_on gated
2.5 CHALLENGE --delegation_delegate_task(challenger, ctx:[spec, CONSTRAINTS, tickets])-->
                challenger: doubt-driven-review → findings (risks, gaps, missing constraints)
             findings ⇒ orchestrator re-dispatches architect to revise (MAX 1 cycle)
             --delegation_delegate_task(git-agent, ctx:[planning artifacts])-->
                git-agent: commit docs(spec): <topic> specification and tickets
3 EXEC LOOP  orchestrator picks next UNBLOCKED ticket:
             --delegation_delegate_task(senior-dev, ctx:[TICKET-N, CONSTRAINTS, spec])-->
                senior-dev: core-implementer edits the working tree, runs tests locally
                   └─ may delegation_delegate_task(general, "scaffold X") for boilerplate
                *** NO COMMIT — working tree intentionally left dirty ***
                HANDOFF: status, files changed, verification results
             orchestrator: board_update → In Review
4 QUALITY    --delegation_delegate_task(qa-engineer, ctx:[TICKET-N, CONSTRAINTS, spec])-->
                qa-engineer: code-review-and-quality (uncommitted diff vs spec)
                             → test-driven-development (write/run tests)
                             → security-hardening (scan)
             --delegation_delegate_task(minimalism-enforcer, ctx:[diff])-->
                minimalism-enforcer: over-engineering / stdlib-first findings
             BOTH pass  ⇒ step 5
             ANY fail   ⇒ NOTHING committed; ticket → Blocked; fix loop (MAX 2)
                          after 2 failures ⇒ Blocked, needs-input, escalate findings to the human
5 LAND       --delegation_delegate_task(git-agent, ctx:[changed files])-->
                git-agent: split paths (tests/** vs rest) →
                           commit feat(TICKET-N): <summary>  then  commit test(TICKET-N): <summary>
             orchestrator: board_update → Done
6 CLOSE      all tickets Done → --delegation_delegate_task(tech-writer)-->
                tech-writer: system-documenter (README/ADR) + session-retro (update CONSTRAINTS.md / agents)
             orchestrator summarizes; STOP
```

**Key properties**
- Implementer and QA **never commit**; only `git-agent` writes history.
- A failed quality gate leaves git history **untouched** (tree dirty, no commit).
- The `feat` and `test` commits remain **separate**, both landed by `git-agent` per ticket.
- Challenger runs **before** implementation; Tech-Writer runs **after** all tickets are Done.

## 4. Roster Delta (v1: 4 + 1 worker → v1.1: 8 + 1 worker)

| Agent | Mode | Job | Spawned by |
|---|---|---|---|
| `challenger` *(new)* | subagent | Stress-test the plan before coding (step 2.5) | orchestrator |
| `git-agent` *(new)* | subagent | **Only** git writer: add/commit; push/PR only via a connected GitHub MCP | orchestrator |
| `minimalism-enforcer` *(new)* | subagent | Separate auditor: over-engineering, stdlib-first | orchestrator |
| `tech-writer` *(new)* | subagent | Docs + session-retro self-improvement (step 6) | orchestrator |
| `orchestrator` | primary | (unchanged role; +4 skills) | the human |
| `architect` | subagent | (unchanged role; +2 skills) | orchestrator |
| `senior-dev` | subagent | (unchanged role; +7 skills; **gives up commit**) | orchestrator |
| `qa-engineer` | subagent | (unchanged role; +3 skills; **gives up commit**) | orchestrator |
| `general` (built-in) | subagent | raw worker (model overridden) | orchestrator / senior-dev |

**`meta-debugger`** is an **orchestrator skill**, not a separate agent (answers "why is this stuck?" by
reading `.delegation/logs/` + `engine_status`). No new agent.

## 5. Permission & Config Deltas

| Agent | edit | bash | delegation | skill (scoped) |
|---|---|---|---|---|
| **senior-dev** *(changed)* | `src/**`, `tests/**` | test/build + **read-only** git — **no commit** | allow → general | core-implementer, delegate-task, source-grounding, incremental-implementation, apply-design, debugging-and-error-recovery, performance, ui-engineer, refactoring-and-simplification |
| **qa-engineer** *(changed)* | `tests/**` | test runners + **read-only** git (`git diff HEAD`) — **no commit** | deny | test-driven-development, security-hardening, code-review-and-quality, root-cause-debugging, review-protocol, verification |
| **git-agent** *(new)* | **deny** | `git add/commit/status/diff/log` (**push denied**; PR/push only via a connected GitHub MCP, else human-only) | deny | commit-conventions |
| **challenger** *(new)* | deny | read-only git | deny | doubt-driven-review |
| **minimalism-enforcer** *(new)* | deny | read-only git + `git diff` | deny | minimalism-enforcer |
| **tech-writer** *(new)* | `docs/**`, `README.md`, `CONSTRAINTS.md` | read-only git | deny | system-documenter, session-retro |
| **orchestrator** *(changed)* | (unchanged) | (unchanged) | allow | + context-engineering, agent-dispatcher, verification, meta-debugger |

- `push` / force / `reset --hard` denied for **everyone**; the human lands remote work.
- **MCP change: none.** QA reviews `git diff HEAD` (uncommitted); `delegate_task`'s baseline logic already
  yields the right `changed_files`; the orchestrator reads `git status --porcelain` and passes the file
  list to `git-agent`.
- `git-agent` uses **bash git** in v1.1; the `git_commit`/`git_status` MCP tool refinement is deferred.

## 6. Skill Gap Audit & Phasing

Current factory skills (11): `core-router, intent-extractor, state-manager, configure-delegation,
spec-creator, task-breakdown, core-implementer, delegate-task, test-driven-development,
security-hardening, code-review-and-quality`.

Target superskills (each merges the best of the vendored sources):

| Agent | Superskill | Merges from |
|---|---|---|
| orchestrator | `context-engineering` | context-engineering |
| orchestrator | `agent-dispatcher` | dispatching-parallel-agents, subagent-driven-development |
| orchestrator | `verification` | verification-before-completion |
| orchestrator | `meta-debugger` | diagnosing-superpowers |
| architect | `system-designer` | api-and-interface-design, codebase-design, domain-modeling |
| architect | `constraint-setter` | constraint-driven-development |
| senior-dev | `source-grounding` | source-driven-development |
| senior-dev | `incremental-implementation` | incremental-implementation |
| senior-dev | `apply-design` | codebase-design, domain-modeling |
| senior-dev | `debugging-and-error-recovery` | debugging-and-error-recovery |
| senior-dev | `performance` | performance-optimization |
| senior-dev | `ui-engineer` | frontend-ui-engineering |
| senior-dev | `refactoring-and-simplification` | code-simplification |
| qa-engineer | `root-cause-debugging` | systematic-debugging, diagnosing-bugs |
| qa-engineer | `review-protocol` | requesting-code-review, receiving-code-review |
| qa-engineer | `verification` (shared) | verification-before-completion |
| challenger | `doubt-driven-review` | doubt-driven-development, improve-codebase-architecture |
| git-agent | `commit-conventions` | git-workflow-and-versioning, git-guardrails |
| minimalism-enforcer | `minimalism-enforcer` | ponytail, ponytail-review, code-simplification |
| tech-writer | `system-documenter` | documentation-and-adrs |
| tech-writer | `session-retro` | retro, teach |

**Ownership rules (lock these — no double-claiming):**
1. **Debugging split:** senior-dev gets `debugging-and-error-recovery` (fix its own broken code);
   qa-engineer owns `root-cause-debugging` (systematic RCA of a failing gate).
2. **Refactoring vs minimalism:** senior-dev's `refactoring-and-simplification` only *applies* what
   `minimalism-enforcer` *flags*; the enforcer owns the verdict.
3. **Design vs apply:** architect *decides* design (`system-designer`); senior-dev *applies* it
   (`apply-design`). Same source skills, different verbs.

### Roadmap (frozen)

| Phase | Contents |
|---|---|
| **v1.1** | review-before-commit gate + git-agent; agents: challenger, git-agent, minimalism-enforcer, tech-writer; skills: §6 table above (11 → ~24) |
| **v1.2** | qa-engineer `e2e-and-browser-testing`; git-agent `branch-hygiene` (finishing-a-development-branch, resolving-merge-conflicts, pr, setup-pre-commit); tech-writer `agent-skill-author`; DevOBS (`production-readiness`, `release-manager`); Visualizer (`ui-prototyper`); orchestrator `async-unblocker` + `emergency-halt`; `delegate_parallel` + worktree isolation |
| **v1.3** | observability/cost metrics (`engine_metrics` + run dashboard); `mentorship-mode`; finalize `junior-dev` worker; wire **semgrep MCP** into security-hardening; guardrail audit tests (deny-path tests) |
| **v1.4** | distribution/portability (per-project `DELEGATE_CONFIG`, plugin/skill packaging); per-caller scoping inside the MCP (blocked by opencode not passing caller identity to MCP tools) |

## 7. Acceptance Test (v1.1, end-to-end on THIS repo)

> Feature: *add a `--json` output mode flag to the delegation MCP's `engine_status` tool, with tests.*

Success requires **all** of:

1. Orchestrator writes `INTENT.md`; architect produces a spec + `CONSTRAINTS.md` + ≥2 tickets (second
   ticket `depends_on` the first).
2. `challenger` runs **before** implementation and its findings appear in the orchestrator log/board notes.
3. **Review-before-commit proven:** `senior-dev` edits the tree and leaves it **dirty**; a
   `git status --porcelain` check between EXEC and QUALITY shows changes **and** `git log` shows **no**
   TICKET-1 commit yet.
4. QA gate runs on the uncommitted diff; `minimalism-enforcer` runs as a separate child session.
5. `git-agent` alone lands both commits (`feat(TICKET-N)` + `test(TICKET-N)`); `git log` attributes them to
   a `git-agent` child session.
6. **Failure path proven:** at least one gate rejection occurs (or is forced) and results in **no commit**
   for that attempt before the retry passes.
7. `tech-writer` runs at CLOSE (docs and/or retro artifact produced).
8. Board `Todo→…→Done` for both tickets; ≥3 child sessions across ≥3 distinct agents (incl. git-agent,
   challenger, minimalism-enforcer).

No human code-writes during the run — only approvals.

## 8. Open Items to Confirm at Build Time (do not guess)

1. Whether `senior-dev`/`qa-engineer` *denies* on `git commit` actually block the child (permission
   inheritance across the warm-server session) — verify with a probe child that attempts a commit and must
   be refused.
2. Whether `git-agent` bash-glob for `git add*`/`git commit*` matches the **child's** shell invocation form
   (e.g. `cmd /c git commit -m ...`) — confirm empirically; widen the glob or switch to the MCP `git_commit`
   tool (Approach B) if it does not.
3. GitHub-MCP push/PR path is **conditional**: if no `github_*` MCP tool is present, `git-agent` must
   degrade to local-only and never attempt push.
