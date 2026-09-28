# Design — "Agent Factory" on opencode (v1 Walking Skeleton)

- **Date:** 2026-09-28
- **Status:** Approved (pending spec review)
- **Repo:** `C:\Dev\let-me-code`
- **Runtime:** opencode 1.18.30 (primary harness) · Node v24.17.0 (MCP runtime) · git 2.54.0.windows.1 · win32

---

## 1. Problem & Goal

We vendored 102 skills from 5 skill-sets (`vendor/addy-agent-skills`, `delegate-skills`,
`matt-skills`, `ponytail`, `superpowers`) and catalogued their conflicts in
`skills-inventory/CONFLICTS.md`. The sets each claim authority over meta-discovery, TDD,
debugging, planning, review, and delegation; there are name collisions
(`test-driven-development` in both addy and superpowers) and functional overlaps.

The goal is to stop drowning in 102 competing skill files and instead build a **hierarchical
software factory**: a small set of specialized agents, each owning a curated set of "superskills"
(skills merged from the best of the vendors), coordinated by a single manager, with one universal
delegation engine that can spawn true nested sub-agents.

**Hard constraint discovered:** opencode subagents cannot spawn other subagents. The built-in Task
tool is one level deep only. A true Orchestrator → Architect → Senior Dev → QA hierarchy therefore
requires an external spawn mechanism. That mechanism is a local MCP server ("the delegation
engine") that drives a warm `opencode serve` instance.

## 2. Approach (chosen: A — "MCP as spawn layer, agents stay thin role prompts")

- The MCP owns **mechanics only** (spawn a child, run the board, report status). It makes **no**
  workflow decisions.
- The Orchestrator is an **LLM** (native opencode `primary` agent). Same-tier hops may use opencode's
  native Task tool; **true nesting / parallelism** goes through the MCP.
- Agents = `.opencode/agent/<role>.md` (frontmatter controls `mode`, `model`, `tools`, `permission`).
- Superskills = `.opencode/skills/<name>/SKILL.md`.

Rejected alternatives:
- **B — MCP owns the state machine:** deterministic but the "manager" becomes code to edit for every
  workflow change; bigger v1.
- **C — pure native, no MCP:** accepts opencode's one-level limit; collapses the hierarchy.

## 3. Repository Layout

```
C:\Dev\let-me-code\
├── opencode.json                 # registers the MCP + per-agent task/skill permissions
├── package.json                  # root scripts (serve, smoke test)
├── .gitignore
├── .opencode/
│   ├── agent/
│   │   ├── orchestrator.md       # mode: primary  (entry point)
│   │   ├── architect.md          # mode: subagent
│   │   ├── senior-dev.md         # mode: subagent
│   │   ├── qa-engineer.md        # mode: subagent
│   │   └── junior-dev.md         # mode: subagent  (only if `general` override proves fragile)
│   └── skills/
│       ├── core-router/SKILL.md
│       ├── intent-extractor/SKILL.md
│       ├── spec-creator/SKILL.md
│       ├── task-breakdown/SKILL.md
│       ├── core-implementer/SKILL.md
│       ├── test-driven-development/SKILL.md
│       ├── security-hardening/SKILL.md
│       ├── code-review-and-quality/SKILL.md
│       ├── state-manager/SKILL.md
│       ├── delegate-task/SKILL.md
│       └── configure-delegation/SKILL.md
├── mcp/delegation/               # the delegation engine (TypeScript / Node 24)
│   ├── package.json
│   └── src/{index.ts,http.ts,spawn.ts,board.ts,git.ts}
├── docs/superpowers/specs/       # this spec
├── skills-inventory/             # reference; may move to docs/archive/ post-acceptance
└── vendor/                       # reference "scrap yard"; see lifecycle below
```

**Vendor lifecycle:** keep `vendor/` + `skills-inventory/` during development (scrap yard for
prompt snippets). Add `vendor/` to `.gitignore` **now** so the 102 files never enter Git history.
After the acceptance test passes, delete `vendor/` entirely (or archive `skills-inventory/` under
`docs/archive/`). Nothing is deleted before acceptance.

**Git:** the repo must be `git init`-ed — the factory needs diffs (auditors), atomic commits, and
rollback (emergency-halt).

## 4. Runtime Mapping

| Blueprint concept | Realized as |
|---|---|
| Agent (`orchestrator.md`) | `.opencode/agent/<role>.md` — frontmatter: `description`, `mode`, `model`, `tools`, `permission` |
| Superskill (`delegate-task.md`) | `.opencode/skills/<name>/SKILL.md` — frontmatter: `name`, `description` |
| Delegation engine MCP | `mcp/delegation/` — TS, Node 24, registered in root `opencode.json` |
| Handoff (`[SYSTEM: YIELD…]`) | **Native** — Task tool (same tier) or MCP `delegate_task` (nested). No invented tokens. |
| `BOARD.md` / `TICKET-N.md` | Real markdown files, written via the `state-manager` skill |

## 5. The Delegation MCP (the engine)

### 5.1 Spawn contract — HTTP client of a warm server

The MCP calls the `opencode serve` HTTP API (NOT one CLI process per task). This is the key design
choice: the prompt travels in the **JSON request body**, so Windows' `CreateProcessW` 32,767-char and
`cmd.exe` 8,191-char command-line limits **do not apply**. No stdin plumbing, no temp payload file,
no truncation risk.

| Step | Call |
|---|---|
| Liveness (replaces TCP probe + lockfile) | `GET /global/health` → `{healthy, version}` |
| Roster validation (dynamic allowlist) | `GET /agent` → `Agent[]` |
| Create job session | `POST /session` `{title}` → `sessionID` |
| Run child & wait for result | `POST /session/:id/message` `{agent, model, parts:[{type:"text",text:<prompt>}]}` → returns `{info, parts}` |
| Abort in-flight child (emergency-halt) | `POST /session/:id/abort` *(endpoint to confirm at build)*; fallback = kill child process tree |

- **Warm server:** started lazily if `GET /global/health` is unreachable. `npm run serve` may also
  start it manually. Rooted at the repo root (single-tree v1; per-task `--dir` returns with worktrees
  in v1.1).
- **Config source:** `DELEGATE_CONFIG.json` at repo root — `{engine:"opencode", serverUrl,
  defaultModel, timeouts}`, written by the `configure-delegation` skill.
- **Auth:** if `OPENCODE_SERVER_PASSWORD` is set, the MCP sends HTTP basic auth (user defaults to
  `opencode`; override via `OPENCODE_SERVER_USERNAME`).
- **Fallback channel:** if the server is unavailable, the MCP shells out to
  `opencode run --agent <agent> --format json` and writes the prompt to **child stdin** (verified:
  stdin piping works). Kept as a documented degrade path, not the primary.

### 5.2 Tools exposed (v1)

| Tool | Input | Output | Caller |
|---|---|---|---|
| `delegate_task` | `agent, prompt, context_files[]?, model?, variant?, timeout_ms?` | `{status, summary, handoff, changed_files[], diff_stat, session_id, log_path}` | orchestrator, senior-dev |
| `engine_status` | — | `{server_up, port, version, agent_roster[], active_jobs}` | orchestrator boot, (future) meta-debugger |
| `engine_abort` | `session_id` | `{aborted, killed}` | orchestrator (emergency-halt) |
| `board_read` | — | `{todo[], in_progress[], in_review[], blocked[], done[]}` (parsed JSON) | orchestrator |
| `board_update` | `ticket, column, note?` | updated board summary | orchestrator (via state-manager skill) |
| `ticket_write` | `id, title, body, depends_on[]?` | path | architect |
| `ticket_read` | `id` | `{meta, body}` | senior-dev, qa-engineer |

`delegate_parallel` is **reserved for v1.1** (requires worktree isolation).

### 5.3 Result extraction (the context win)

The child's full JSON transcript streams to `.delegation/logs/<ts>-<agent>-<id>.jsonl` (gitignored).
The MCP returns to the parent **only** the parsed `HANDOFF` block + `git diff --stat` + changed-file
list. Verbose child output never enters the parent's context unless the parent explicitly reads the
log.

### 5.4 `changed_files` baseline snapshotting

Before running a child, the MCP records `git status --porcelain`. After the child finishes, it computes
the diff **against that baseline**. Prevents uncommitted files from a previous failed experiment from
being wrongly attributed to the current child.

### 5.5 Guardrails baked into the MCP

- `agent` must match the **allowlist roster** — no arbitrary agent injection.
- `dir` must resolve **inside the repo root** — no `..` escape.
- `timeout` kills the **whole process tree** (Windows `taskkill /T /F`) when the CLI fallback is used.
- Children run with `--auto` / auto-approved non-denied permissions; safety lives in each agent's
  frontmatter **`permission` denies** (inherited by child processes, which read the same agent files).

## 6. Child Output Discipline (the HANDOFF contract)

Every child agent's prompt ends with a required terminator:

```
### HANDOFF
status: done | blocked | needs-input
summary: <one paragraph>
artifacts: <paths created/modified>
next: <what the orchestrator should do>
```

The MCP parses this block; if missing, it falls back to the tail of the message. `blocked` /
`needs-input` → Orchestrator routes the ticket to `BOARD.md` **Blocked** (async-unblocker case: the
child wrote `QUESTIONS_FOR_CLIENT.md` and stopped).

## 7. v1 Agent Roster & Superskill Mapping

Frozen at **4 real agents + 1 worker**. Senior Dev is a bespoke agent (owns the
complex-thinking + delegation role).

| Agent | Mode | Owns superskills | Spawned by |
|---|---|---|---|
| **orchestrator** | `primary` | `core-router`, `intent-extractor`, `state-manager`, `configure-delegation` | the human |
| **architect** | `subagent` | `spec-creator`, `task-breakdown` | orchestrator (via `delegate_task`) |
| **senior-dev** | `subagent` | `core-implementer`, `delegate-task` | orchestrator (via `delegate_task`) |
| **qa-engineer** | `subagent` | `test-driven-development`, `security-hardening`, `code-review-and-quality` | orchestrator (via `delegate_task`) |
| **general** (built-in) *or* **junior-dev** (custom fallback) | `subagent` | none (raw worker) | orchestrator / senior-dev (via `delegate_task`) |

- **QA = combined Quality Gate.** `code-review-and-quality` (diff vs spec) runs **before** tests:
  review → tests → security scan.
- **The worker** is opencode's built-in `general` agent if its model/tools can be overridden via
  `opencode.json`. If that override proves undocumented/quirky, replace with a 10-line custom
  `.opencode/agent/junior-dev.md` for deterministic control. **Confirm empirically at build time.**
- **`general` is the nesting payoff:** the MCP can spawn `general`, and `general` may use opencode's
  native Task tool to fan out to `explore`/`scout` — nesting the CLI couldn't do, for free.

**Deferred to v1.1+ (not dropped):** Challenger/staff-review, DevOBS (production-readiness,
release-manager), Tech-Writer (system-documenter, session-retro, agent-skill-author), Visualizer
(UI-prototyper, diagrams), minimalism-enforcer (ponytail), meta-debugger, async-unblocker,
emergency-halt skill (the MCP `engine_abort` ships in v1). All bolt onto the same MCP.

## 8. Guardrails — Per-Agent Permission Matrix

| Agent | `edit` | `bash` | `webfetch` | `task` (native) | MCP `delegate_task` | `skill` (scoped) |
|---|---|---|---|---|---|---|
| **orchestrator** | allow `BOARD.md`, `INTENT.md`, `QUESTIONS_FOR_CLIENT.md` | allow `git status/diff/log/checkout`, board — **deny push, reset --hard** | allow | **deny `*`** | allow | core-router, intent-extractor, state-manager, configure-delegation |
| **architect** | allow `docs/specs/**`, `CONSTRAINTS.md`, `tickets/**` | allow read-only git | allow | deny | **deny** | spec-creator, task-breakdown |
| **senior-dev** | allow `src/**` (configurable) | allow `git add/commit`, build/test — deny `push`, `reset --hard`, `rm -rf` | allow | deny | **allow → general** | core-implementer, delegate-task |
| **qa-engineer** | allow `tests/**` | allow test runners, `git add/commit` (test commits) — deny push/reset | deny | deny | deny | test-driven-development, security-hardening, code-review-and-quality |
| **general / junior-dev** | allow (worker) | allow local build/format — deny destructive | deny | **allow** (`explore`, `scout`) | deny | none |

- `push` / force / `reset --hard` denied for **everyone**; the human lands remote work.
- `senior-dev → general` is the one sanctioned nesting edge.
- Each subagent gets `permission.skill` scoped to only its own superskills.
- Denies are inherited by child processes.

### Emergency-halt (`wait what` / `stop`)

1. **Immediate:** orchestrator stops dispatching, then `engine_abort` aborts the in-flight child
   session and kills the process tree.
2. **Recovery:** `halt_and_revert` shows `git status` + last good commit and restores the tree **only
   on explicit human confirm** (never silent `reset --hard`).

## 9. SOP & `BOARD.md` Data Flow

**Rule: the orchestrator is the ONLY writer of `BOARD.md`.** Children report status in their HANDOFF;
the orchestrator reconciles. Eliminates concurrent-write races on the single tree. (Deliberate
deviation from the blueprint's "devs run update-board".)

### Run artifacts

| Artifact | Written by | Git? |
|---|---|---|
| `INTENT.md` (goal, constraints, success criteria) | orchestrator | tracked |
| `docs/specs/YYYY-MM-DD-<topic>.md` (PRD) | architect | tracked |
| `CONSTRAINTS.md` (quality/security bar) | architect | tracked |
| `tickets/TICKET-N.md` (body + `depends_on`) | architect | tracked |
| `BOARD.md` (Todo/In Progress/In Review/Blocked/Done) | **orchestrator only** | tracked |
| `.delegation/logs/*.jsonl`, `.delegation/runs/*` | MCP | gitignored |

### Happy path (tool calls in order)

```
1 INTAKE      orchestrator: core-router + intent-extractor → INTENT.md → board_init
2 BLUEPRINT   orchestrator --delegate_task(architect, ctx:[INTENT.md])-->
                 architect: spec-creator → spec ; task-breakdown → CONSTRAINTS.md + tickets
                 HANDOFF: artifacts
              orchestrator: board_update → Todo populated, depends_on gated
3 EXEC LOOP   orchestrator picks next UNBLOCKED ticket:
              --delegate_task(senior-dev, ctx:[TICKET-N, CONSTRAINTS, spec])-->
                 senior-dev: core-implementer (thin slices)
                    └─ may call delegate_task(general|junior-dev, "scaffold X") → diff back → integrate
                 atomic commit; HANDOFF: artifacts, diff_stat, status
              orchestrator: board_update → In Review
4 QUALITY     --delegate_task(qa-engineer, ctx:[TICKET-N, CONSTRAINTS, spec])-->
                 qa-engineer: code-review-and-quality (diff vs spec)
                              → test-driven-development (write/run tests)
                              → security-hardening (scan)
                 HANDOFF: pass | fail + findings
              orchestrator: board_update → Done   or   Blocked(findings)
5 RECONCILE   if Blocked → re-dispatch senior-dev with findings (fix loop, MAX 2)
              → if still failing after 2 → ticket → Blocked, status needs-input,
                escalate findings to the human (never loop forever, never hallucinate a pass)
              else next ticket (goto 3)
6 CLOSE       all tickets Done → orchestrator summarizes; per-ticket commits stand. STOP.
```

### `BOARD.md` state machine

`Todo → In Progress → In Review → Done`, with `Blocked` reachable from any state. A Todo becomes
*eligible* only when every ticket in its `depends_on` is `Done`.

```
# BOARD — <feature>
## Todo
| Ticket | Title | Depends on |
## In Progress
| Ticket | Title | Owner | Started |
## In Review
| Ticket | Title | Reviewer |
## Blocked
| Ticket | Title | Reason | Since |
## Done
| Ticket | Title | Commit |
```

### Commits

- **Implementation commit** by senior-dev: `feat(TICKET-N): <summary>`.
- **Test commit** by qa-engineer on passing: `test(TICKET-N): add verification suite`.
  The repo preserves both.

## 10. Acceptance Test (end-to-end, on THIS repo)

> Feature: *add a `--version` flag to the delegation MCP that prints the version from `package.json`,
> with a passing test.*

Success requires **all** of:

1. Orchestrator writes `INTENT.md`, delegates to architect.
2. Architect produces `docs/specs/*.md`, `CONSTRAINTS.md`, ≥1 `tickets/TICKET-1.md`; board shows 1
   ticket.
3. `senior-dev` implements + commits — and **invokes `delegate_task → general`** for at least the
   boilerplate (proving nesting).
4. `qa-engineer` reviews diff vs spec, writes/commits tests, runs them.
5. Orchestrator drives board `Todo→…→Done`; a *second* ticket with `depends_on` proves gating.
6. Two commits exist (impl + test); `BOARD.md` shows Done; `engine_status` log shows ≥3 child sessions
   across ≥3 distinct agents.

No human code-writes during the run — only approvals.

## 11. Open Items to Confirm at Build Time (do not guess)

1. Exact `opencode.json` syntax to override the **built-in `general`** agent's model/tools. Fallback:
   custom `junior-dev` agent.
2. Exact abort endpoint (`POST /session/:id/abort`?) for `engine_abort`. Fallback: kill process tree.
3. Whether `POST /session/:id/message` returns the full parts (including the HANDOFF text) reliably for
   parsing, vs. needing `GET /session/:id/message` afterward.
