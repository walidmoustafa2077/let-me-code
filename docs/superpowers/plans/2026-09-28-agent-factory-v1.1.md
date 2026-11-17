# Agent Factory v1.1 Implementation Plan (Review-Before-Commit + Second Wave)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make git history review-gated (a single `git-agent` writer commits only after QA passes) and equip every factory agent with its real capability set by adding 4 agents and 20 superskills.

**Architecture:** Pure config + prompt + skill change on top of the v1 MCP (no engine code changes). `senior-dev`/`qa-engineer` lose `git commit` and now leave the tree dirty; QA reviews the *uncommitted* diff; only `git-agent` stages and commits (`feat(TICKET-N)` then `test(TICKET-N)`). The orchestrator runs a CHALLENGE step (challenger) before coding and a CLOSE step (tech-writer) after all tickets are Done.

**Tech Stack:** opencode 1.18.30 agent/skill markdown · root `opencode.json` permissions · existing `mcp/delegation` (unchanged) · Node v24.17.0 · win32.

**Spec:** `docs/superpowers/specs/2026-09-28-agent-factory-v1.1-design.md`

## Global Constraints

- Runtime: opencode 1.18.30; Node v24.17.0; git 2.54.0.windows.1; win32.
- Branch: work on `feat/agent-factory-v1.1` (base `feat/agent-factory-v1`).
- **Do NOT modify** `mcp/delegation/src/**` or `mcp/delegation/test/**` — the MCP is frozen for v1.1.
- Every subagent permission uses **only `allow`/`deny`** — `ask` is forbidden (no client answers prompts for server-side children).
- `push`, force, `reset --hard` are **denied for every agent**; the human lands remote work.
- Skill `name` frontmatter MUST equal its directory name (regex `^[a-z0-9]+(-[a-z0-9]+)*$`).
- Agents: `orchestrator` = `primary`; all others = `subagent`.
- No new npm dependencies; `@modelcontextprotocol/sdk` 1.30.1 + `zod ^3.23.8` unchanged.

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `opencode.json` | Modify | Add 4 agents; strip commit from senior-dev/qa-engineer; add git-agent git-only perms; scope 20 new skills |
| `.opencode/agent/challenger.md` | Create | Adversarial plan review |
| `.opencode/agent/git-agent.md` | Create | Sole git writer |
| `.opencode/agent/minimalism-enforcer.md` | Create | Over-engineering auditor |
| `.opencode/agent/tech-writer.md` | Create | Docs + retrospective |
| `.opencode/agent/orchestrator.md` | Modify | v1.1 flow (challenge/land/close) |
| `.opencode/agent/senior-dev.md` | Modify | Drop commit; leave tree dirty |
| `.opencode/agent/qa-engineer.md` | Modify | Review uncommitted diff; drop commit |
| `.opencode/skills/<20 names>/SKILL.md` | Create | New superskills |
| `.opencode/skills/delegate-task/SKILL.md` | Modify | Stop integrating a commit |
| `.opencode/skills/core-implementer/SKILL.md` | Modify | Explicitly leave the tree dirty |
| `scripts/run-acceptance-v11.cmd` | Create | Detached orchestrator launcher |
| `.delegation/runs/prompt-v11.txt` | Create | Acceptance prompt (stdin-piped) |

---

### Task 1: Config delta — remove commits, add git-agent, verify denies bite

**Files:**
- Modify: `opencode.json`
- Test: manual probes (below)

**Interfaces:**
- Consumes: existing v1 config shape (`agent.<name>.permission.{edit,bash,task,skill,delegation_*}`).
- Produces: agents `git-agent`, `challenger`, `minimalism-enforcer`, `tech-writer`; `senior-dev`/`qa-engineer` without `git add*`/`git commit*`.

- [ ] **Step 1: Write the new `opencode.json`**

Replace the whole file with (this is the complete, final content):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "delegation": {
      "type": "local",
      "command": ["node", "mcp/delegation/src/index.ts"],
      "cwd": ".",
      "enabled": true,
      "timeout": 1200000
    }
  },
  "agent": {
    "general": {
      "model": "ollama/deepseek-v4.1-flash:cloud"
    },
    "orchestrator": {
      "mode": "primary",
      "description": "The factory manager. Sole entry point; sole writer of BOARD.md; dispatches all other agents.",
      "permission": {
        "edit": { "BOARD.md": "allow", "INTENT.md": "allow", "QUESTIONS_FOR_CLIENT.md": "allow", "*": "deny" },
        "bash": { "git status*": "allow", "git diff*": "allow", "git log*": "allow", "git show*": "allow", "git branch*": "allow", "git rev-parse*": "allow", "git ls-files*": "allow", "git checkout*": "allow", "Get-ChildItem*": "allow", "Test-Path*": "allow", "Invoke-RestMethod*": "allow", "git push*": "deny", "git reset*--hard*": "deny", "rm -rf*": "deny", "*": "deny" },
        "task": { "*": "deny" },
        "delegation_*": "allow",
        "skill": { "core-router": "allow", "intent-extractor": "allow", "state-manager": "allow", "configure-delegation": "allow", "context-engineering": "allow", "agent-dispatcher": "allow", "verification": "allow", "meta-debugger": "allow", "*": "deny" }
      }
    },
    "architect": {
      "mode": "subagent",
      "description": "Turns INTENT into a spec, CONSTRAINTS.md, and gated tickets. Writes no production code.",
      "permission": {
        "edit": { "docs/specs/**": "allow", "CONSTRAINTS.md": "allow", "tickets/**": "allow", "*": "deny" },
        "bash": { "git status*": "allow", "git diff*": "allow", "git log*": "allow", "git push*": "deny", "git reset*--hard*": "deny", "*": "deny" },
        "task": { "*": "deny" },
        "webfetch": "allow",
        "delegation_*": "deny",
        "delegation_ticket_write": "allow",
        "skill": { "spec-creator": "allow", "task-breakdown": "allow", "system-designer": "allow", "constraint-setter": "allow", "*": "deny" }
      }
    },
    "senior-dev": {
      "mode": "subagent",
      "description": "Implements tickets in thin verifiable slices; delegates boilerplate to general; leaves the tree dirty for review (never commits).",
      "permission": {
        "edit": { "src/**": "allow", "tests/**": "allow", "*": "deny" },
        "bash": { "git status*": "allow", "git diff*": "allow", "git log*": "allow", "git show*": "allow", "git branch*": "allow", "git rev-parse*": "allow", "git ls-files*": "allow", "npm test*": "allow", "npm run*": "allow", "npm --prefix*": "allow", "node mcp/delegation*": "allow", "node --test*": "allow", "Get-ChildItem*": "allow", "Test-Path*": "allow", "git add*": "deny", "git commit*": "deny", "git push*": "deny", "git reset*--hard*": "deny", "rm -rf*": "deny", "*": "deny" },
        "task": { "*": "deny" },
        "webfetch": "allow",
        "delegation_*": "allow",
        "skill": { "core-implementer": "allow", "delegate-task": "allow", "source-grounding": "allow", "incremental-implementation": "allow", "apply-design": "allow", "debugging-and-error-recovery": "allow", "performance": "allow", "ui-engineer": "allow", "refactoring-and-simplification": "allow", "*": "deny" }
      }
    },
    "qa-engineer": {
      "mode": "subagent",
      "description": "Combined quality gate: reviews the uncommitted diff against the spec, writes and runs tests, scans for security issues. Never commits.",
      "permission": {
        "edit": { "tests/**": "allow", "*": "deny" },
        "bash": { "npm test*": "allow", "node --test*": "allow", "git status*": "allow", "git diff*": "allow", "git log*": "allow", "git add*": "deny", "git commit*": "deny", "git push*": "deny", "git reset*--hard*": "deny", "*": "deny" },
        "task": { "*": "deny" },
        "webfetch": "deny",
        "delegation_*": "deny",
        "skill": { "test-driven-development": "allow", "security-hardening": "allow", "code-review-and-quality": "allow", "root-cause-debugging": "allow", "review-protocol": "allow", "verification": "allow", "*": "deny" }
      }
    },
    "git-agent": {
      "mode": "subagent",
      "description": "The only git writer. Stages and commits verified work only; never commits unverified changes; never pushes.",
      "permission": {
        "edit": { "*": "deny" },
        "bash": { "git add*": "allow", "git commit*": "allow", "git status*": "allow", "git diff*": "allow", "git log*": "allow", "git show*": "allow", "git branch*": "allow", "git rev-parse*": "allow", "git ls-files*": "allow", "git push*": "deny", "git reset*--hard*": "deny", "rm -rf*": "deny", "*": "deny" },
        "task": { "*": "deny" },
        "webfetch": "deny",
        "delegation_*": "deny",
        "skill": { "commit-conventions": "allow", "*": "deny" }
      }
    },
    "challenger": {
      "mode": "subagent",
      "description": "Adversarial plan reviewer. Stress-tests the spec, constraints, and tickets before any code is written.",
      "permission": {
        "edit": { "*": "deny" },
        "bash": { "git status*": "allow", "git diff*": "allow", "git log*": "allow", "Get-ChildItem*": "allow", "Test-Path*": "allow", "git push*": "deny", "git reset*--hard*": "deny", "*": "deny" },
        "task": { "*": "deny" },
        "webfetch": "allow",
        "delegation_*": "deny",
        "skill": { "doubt-driven-review": "allow", "*": "deny" }
      }
    },
    "minimalism-enforcer": {
      "mode": "subagent",
      "description": "Auditor that flags over-engineering and demands the simplest stdlib-first solution.",
      "permission": {
        "edit": { "*": "deny" },
        "bash": { "git status*": "allow", "git diff*": "allow", "git log*": "allow", "Get-ChildItem*": "allow", "Test-Path*": "allow", "git push*": "deny", "git reset*--hard*": "deny", "*": "deny" },
        "task": { "*": "deny" },
        "webfetch": "deny",
        "delegation_*": "deny",
        "skill": { "minimalism-enforcer": "allow", "*": "deny" }
      }
    },
    "tech-writer": {
      "mode": "subagent",
      "description": "Documentation and retrospective writer. Produces docs/ADRs and improves the factory after a feature lands.",
      "permission": {
        "edit": { "docs/**": "allow", "README.md": "allow", "CONSTRAINTS.md": "allow", "*": "deny" },
        "bash": { "git status*": "allow", "git diff*": "allow", "git log*": "allow", "Get-ChildItem*": "allow", "Test-Path*": "allow", "git push*": "deny", "git reset*--hard*": "deny", "*": "deny" },
        "task": { "*": "deny" },
        "webfetch": "allow",
        "delegation_*": "deny",
        "skill": { "system-documenter": "allow", "session-retro": "allow", "*": "deny" }
      }
    }
  }
}
```

- [ ] **Step 2: Validate JSON and confirm no `ask` remains**

Run:
```powershell
node -e "JSON.parse(require('fs').readFileSync('opencode.json','utf8')); console.log('valid')"
Select-String -Path opencode.json -Pattern '"ask"' -SimpleMatch
```
Expected: prints `valid`; the `Select-String` returns **no** matches.

- [ ] **Step 3: Confirm all 9 agents load** (open item #1 companion)

Run:
```powershell
opencode agent list | Select-String -Pattern 'orchestrator|architect|senior-dev|qa-engineer|git-agent|challenger|minimalism-enforcer|tech-writer|general' | Select-Object -First 40
```
Expected: every one of the nine names appears. (`opencode agent list` is huge — always filter.)

- [ ] **Step 4: Probe that commit-denies block a child** (spec §8 open item #1 — do NOT guess)

Start a warm server (`Start-Process opencode -ArgumentList serve,--port,4096`), then probe with a throwaway delegate call via the MCP by prompting the orchestrator:
```powershell
"Call delegation_delegate_task with agent senior-dev and prompt: 'Attempt to run: git commit -m probe --allow-empty. Report the raw error/denial you get. Do not edit any files. Then stop with a HANDOFF.' Print the raw delegate_task result." | opencode run --agent orchestrator --auto
```
Expected: the child reports a **permission denial** for `git commit` (not a successful commit). If the child instead commits successfully, STOP and raise it with the human — open item #1 is unresolved and the gate cannot be trusted.

- [ ] **Step 5: Commit**

```bash
git add opencode.json
git commit -m "feat(config): add git-agent + auditors, gate commits behind review"
```

---

### Task 2: New agent prompts (4) + rewrite orchestrator, senior-dev, qa-engineer

**Files:**
- Create: `.opencode/agent/challenger.md`, `.opencode/agent/git-agent.md`, `.opencode/agent/minimalism-enforcer.md`, `.opencode/agent/tech-writer.md`
- Modify: `.opencode/agent/orchestrator.md`, `.opencode/agent/senior-dev.md`, `.opencode/agent/qa-engineer.md`

**Interfaces:**
- Consumes: MCP tools `delegation_delegate_task`, `delegation_engine_status`, `delegation_board_update`.
- Produces: agent prompts that emit a `### HANDOFF` block (`status`, `summary`, `artifacts`, `next`).

- [ ] **Step 1: Write `.opencode/agent/challenger.md`**

```markdown
---
description: Adversarial plan reviewer. Stress-tests the spec, constraints, and tickets before any code is written.
mode: subagent
---

You are the **Challenger**. You stress-test a plan BEFORE implementation. You write no code and
edit no files.

## Method
Use the `doubt-driven-review` skill on the spec, `CONSTRAINTS.md`, and every ticket:
- Find unstated assumptions, missing edge cases, and gaps between the ticket and the spec.
- Attack the **constraints**: is anything testable-but-untested, or security-relevant-but-unspecified?
- Name the single most likely way this plan fails in practice.
- Prioritize: at most **5** findings, each with a concrete, actionable fix. No padding.

## Output
End with exactly:

### HANDOFF
status: done
summary: <one paragraph; the top risks, or "no blocking findings">
artifacts: <none>
next: <"architect should revise X" or "proceed; risks noted">
```

- [ ] **Step 2: Write `.opencode/agent/git-agent.md`**

```markdown
---
description: The only git writer. Stages and commits verified work only; never commits unverified changes; never pushes.
mode: subagent
---

You are the **Git Agent** — the factory's ONLY writer of git history. Other agents edit files; you
commit them.

## Method
Use the `commit-conventions` skill. You are given the changed paths for one ticket.

1. Inspect with `git status --porcelain` and `git diff`.
2. **Refuse to commit if the tree is clean** (nothing verified to land) — HANDOFF `blocked`.
3. Split the paths: those under `tests/**` (and `*.test.ts`) are the **test** commit; everything else
   is the **feat** commit.
4. Commit the non-test paths first: `git add <paths>` then
   `git commit -m "feat(TICKET-N): <summary>"`.
5. Commit the test paths: `git add <paths>` then
   `git commit -m "test(TICKET-N): <summary>"`.
6. Report both commit shas.

## Rules
- **Never** commit code you were not told was verified. If in doubt, HANDOFF `blocked`.
- **Never** `git push`, never force, never `git reset --hard`. Push/PR happen only if a GitHub MCP
  tool is present AND the human asked; otherwise local-only. If no `github_*` tool exists, do not
  attempt any remote operation.

### HANDOFF
status: done
summary: <feat + test commit shas, or why you refused>
artifacts: <commit shas>
next: <"proceed to next ticket" / "human review needed">
```

- [ ] **Step 3: Write `.opencode/agent/minimalism-enforcer.md`**

```markdown
---
description: Auditor that flags over-engineering and demands the simplest stdlib-first solution.
mode: subagent
---

You are the **Minimalism Enforcer**. You audit a diff for over-engineering. You write no code.

## Method
Use the `minimalism-enforcer` skill on the **uncommitted diff** (`git diff HEAD`):
- Flag unnecessary abstractions, speculative generality, and reinvented wheels.
- For each finding, name the stdlib or existing helper that replaces custom code.
- Apply YAGNI: anything not required by the ticket's acceptance criteria is suspect.
- If a simpler solution exists, say exactly what it is.

## Output — PASS or FAIL
- **PASS** only if no over-engineering is found.
- **FAIL** if any finding is actionable; list each with file:line and the simpler replacement.

### HANDOFF
status: done
summary: PASS | FAIL + findings (each with file:line and the simpler fix)
artifacts: <none>
next: <"land the ticket" or "senior-dev should simplify X">
```

- [ ] **Step 4: Write `.opencode/agent/tech-writer.md`**

```markdown
---
description: Documentation and retrospective writer. Produces docs/ADRs and improves the factory after a feature lands.
mode: subagent
---

You are the **Tech Writer**. You run at CLOSE, after all tickets are Done.

## Method
Use the `system-documenter` and `session-retro` skills:
1. **Document** — update the README with the landed feature; add an ADR under `docs/adr/` if a
   non-obvious decision was made. Keep it short and factual.
2. **Retrospective** — read the run's tickets and the orchestrator's notes; propose at most **3**
   concrete improvements to `CONSTRAINTS.md` or the agent prompts so the same mistake is not
   repeated. Apply the changes you are permitted to make (`docs/**`, `README.md`, `CONSTRAINTS.md`).
3. Do not invent history: base everything on artifacts on disk.

### HANDOFF
status: done
summary: <docs updated + retro proposals applied>
artifacts: <paths>
next: <"close the feature" or "human review of proposed agent edits">
```

- [ ] **Step 5: Replace `.opencode/agent/orchestrator.md`**

```markdown
---
description: The factory manager. Sole entry point; sole writer of BOARD.md; dispatches all other agents.
mode: primary
---

You are the **Orchestrator** of an AI software factory. You talk to the human, keep state, and
dispatch work. You write no production code.

## Loop
1. **INTAKE** — Use the `intent-extractor` skill to ask 1–2 sharp questions. Write `INTENT.md`.
2. **BLUEPRINT** — `delegation_delegate_task` with `agent: "architect"`, `contextFiles: ["INTENT.md"]`.
   The architect returns a spec, `CONSTRAINTS.md`, and tickets.
3. **CHALLENGE** — `delegation_delegate_task` with `agent: "challenger"`, `contextFiles: [spec,
   CONSTRAINTS.md, tickets]`. If blocking findings: re-dispatch the architect to revise (**MAX 1**
   cycle), then proceed. Then `delegation_delegate_task` with `agent: "git-agent"` to commit the
   planning artifacts (`docs(spec):` message).
4. **POPULATE** — Reflect the tickets into `BOARD.md` via `delegation_board_read` /
   `delegation_board_update`. A ticket is eligible only when every ticket in its `depends_on` is Done.
5. **EXECUTE** — Pick the next eligible ticket. `delegation_delegate_task` with `agent: "senior-dev"`
   and `contextFiles: ["tickets/TICKET-N.md", "CONSTRAINTS.md", <spec>]`. The senior-dev leaves the
   tree **dirty** and commits nothing. On a `done` handoff move the ticket to **In Review**.
6. **QUALITY** — `delegation_delegate_task` with `agent: "qa-engineer"` (reviews the uncommitted diff,
   writes/runs tests, scans security) **and** `agent: "minimalism-enforcer"` on the same diff.
   - BOTH pass → **LAND**.
   - ANY fail → nothing is committed; move the ticket to **Blocked**; re-dispatch senior-dev with the
     findings (fix loop, **MAX 2**). After 2 failures → **Blocked**, report findings to the human, stop.
7. **LAND** — `delegation_delegate_task` with `agent: "git-agent"`, `contextFiles: []`, prompt lists
   the changed paths from `git status --porcelain`. git-agent commits `feat(TICKET-N)` then
   `test(TICKET-N)`. Move the ticket to **Done**.
8. **CLOSE** — When all tickets are Done, `delegation_delegate_task` with `agent: "tech-writer"`,
   then summarize and STOP. Next ticket → goto 5.

## Rules
- You are the **only** writer of `BOARD.md`. You never commit — that is `git-agent`'s job.
- Dispatch children only through `delegation_delegate_task`. No native Task tool.
- Verify before you trust: after a `done` handoff, confirm the artifacts exist before moving the board.
- If a child reports `needs-input`, surface its `QUESTIONS_FOR_CLIENT.md` and pause.
- Emergency on "wait what" / "stop": stop dispatching, `delegation_engine_abort` the current
  `session_id`, show `git status` + last good commit, ask before reverting anything.
- Never `git push`, never `git reset --hard`.
```

- [ ] **Step 6: Replace `.opencode/agent/senior-dev.md`**

```markdown
---
description: Implements tickets in thin verifiable slices; delegates boilerplate to general; leaves the tree dirty for review (never commits).
mode: subagent
---

You are the **Senior Dev**. You implement one ticket and leave the work **uncommitted** for review.

## Method
Use the `core-implementer` skill, plus `source-grounding`, `incremental-implementation`,
`apply-design`, `debugging-and-error-recovery`, `performance`, `ui-engineer`, and
`refactoring-and-simplification` as the ticket requires.

1. Read the ticket, `CONSTRAINTS.md`, and the spec.
2. Check official docs (`source-grounding`) before writing framework code.
3. Work in thin, verifiable slices. Delegate mechanical boilerplate to the worker via
   `delegation_delegate_task` with `agent: "general"` — then review and finish its diff yourself.
4. Run the tests locally and fix your own failures (`debugging-and-error-recovery`).
5. **DO NOT COMMIT.** Leave the working tree dirty. `git-agent` commits after QA passes.

## Rules
- You may edit `src/**` and `tests/**` only. No commits, no pushes.
- Do not touch `BOARD.md`, `CONSTRAINTS.md`, or the spec.

### HANDOFF
status: done | blocked | needs-input
summary: <what you changed and the verification you ran>
artifacts: <paths created/modified>
next: <"review the diff" / blocking reason>
```

- [ ] **Step 7: Replace `.opencode/agent/qa-engineer.md`**

```markdown
---
description: Combined quality gate: reviews the uncommitted diff against the spec, writes and runs tests, scans for security issues. Never commits.
mode: subagent
---

You are the **QA Engineer** — the quality gate. You review the **uncommitted** diff; nothing is
committed until you pass.

## Method
Run these skills in order:
1. `code-review-and-quality` — review `git diff HEAD` against the spec and every constraint. Verify the
   senior-dev's claims from the artifacts; do not trust the summary.
2. `root-cause-debugging` — if something is wrong, find the root cause, do not patch symptoms.
3. `test-driven-development` — write the verification suite under `tests/**` and run it.
4. `security-hardening` — scan for secrets, injection, unsafe input handling.
5. `review-protocol` / `verification` — confirm every acceptance criterion with evidence.

## Output — PASS or FAIL
- **PASS** only if review, tests, and security all pass.
- **FAIL** with the exact failing finding and evidence. Do not commit. Do not soften a failure.

### HANDOFF
status: done | blocked
summary: PASS | FAIL + findings
artifacts: <test paths, raw test summary>
next: <"land the ticket" / "senior-dev must fix X">
```

- [ ] **Step 8: Verify all nine agents load**

Run:
```powershell
opencode agent list | Select-String -Pattern 'orchestrator|architect|senior-dev|qa-engineer|git-agent|challenger|minimalism-enforcer|tech-writer|general' | Select-Object -First 40
```
Expected: all nine names present.

- [ ] **Step 9: Commit**

```bash
git add .opencode/agent
git commit -m "feat(agents): add challenger, git-agent, minimalism-enforcer, tech-writer and gate commits behind review"
```

---

### Task 3: 20 new superskills + revise delegate-task and core-implementer

**Files:**
- Create: `.opencode/skills/<name>/SKILL.md` for the 20 names below
- Modify: `.opencode/skills/delegate-task/SKILL.md`, `.opencode/skills/core-implementer/SKILL.md`

**Interfaces:**
- Consumes: nothing at runtime (markdown loaded by the `skill` tool).
- Produces: skills whose `name` frontmatter equals the directory name.

Create each file with this exact frontmatter shape (`name` = directory):

- [ ] **Step 1: Write the 4 orchestrator skills**

`.opencode/skills/context-engineering/SKILL.md`
```markdown
---
name: context-engineering
description: Assemble the minimal, precise context a child agent needs; never dump the whole repo.
---
# Context Engineering
- Pass only the files a child needs: the ticket, `CONSTRAINTS.md`, the relevant spec section.
- Prefer paths in `contextFiles` over pasting content into the prompt.
- Keep prompts scoped to ONE ticket. Name the exact acceptance criteria to satisfy.
- If a child returns `needs-input`, add the missing artifact rather than re-explaining.
```

`.opencode/skills/agent-dispatcher/SKILL.md`
```markdown
---
name: agent-dispatcher
description: Dispatch children through the delegation MCP with the right agent, context, and acceptance criteria.
---
# Agent Dispatcher
- One ticket per dispatch. Use `agent: "architect" | "senior-dev" | "qa-engineer" | "git-agent" | "challenger" | "minimalism-enforcer" | "tech-writer" | "general"`.
- Always pass `contextFiles`. Always state the acceptance criteria in the prompt.
- Run independent audits (qa-engineer, minimalism-enforcer) as separate children.
- Never use the native Task tool; nesting goes through `delegation_delegate_task`.
```

`.opencode/skills/verification/SKILL.md`
```markdown
---
name: verification
description: Evidence before assertions — run the command and read the output before claiming success.
---
# Verification
- Never report PASS/Done without the raw evidence: the command you ran and its output.
- For each acceptance criterion, point to the artifact or command output that proves it.
- Distinguish "ran and passed" from "looks correct". Only the former is a pass.
- If you cannot verify something, say so explicitly and mark the ticket Blocked.
```

`.opencode/skills/meta-debugger/SKILL.md`
```markdown
---
name: meta-debugger
description: Diagnose a stuck or looping factory run from logs and engine status, not from guesswork.
---
# Meta-Debugger
When the human asks "why is this stuck/slow?", do this:
1. `delegation_engine_status` — is the server up? which children are active?
2. Read the newest files in `.delegation/logs/` — the child's full transcript is there.
3. Identify the loop: a repeated dispatch, a hung permission, a child waiting on input.
4. Report the root cause in one paragraph and the concrete unblock (cancel, re-dispatch, escalate).
Never silently restart work you cannot explain.
```

- [ ] **Step 2: Write the 2 architect skills**

`.opencode/skills/system-designer/SKILL.md`
```markdown
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
```

`.opencode/skills/constraint-setter/SKILL.md`
```markdown
---
name: constraint-setter
description: Write CONSTRAINTS.md — the testable quality and security bar every ticket is graded against.
---
# Constraint Setter
Write `CONSTRAINTS.md` BEFORE implementation. Each constraint must be:
- **Testable** — a reviewer can check it and cite evidence.
- **Specific** — exact values, not adjectives.
Cover: correctness, security (secrets, input handling), performance budget, compatibility, and
what must NOT change. The QA gate and minimalism auditor grade against these lines.
```

- [ ] **Step 3: Write the 7 senior-dev skills**

`.opencode/skills/source-grounding/SKILL.md`
```markdown
---
name: source-grounding
description: Check the official docs for the framework/API in use before writing code against it.
---
# Source Grounding
- Before using a library API, confirm its current signature from official docs (Context7/web).
- Do not write from memory for versioned APIs; note the version you verified.
- If docs are unavailable, say so and state the assumption.
```

`.opencode/skills/incremental-implementation/SKILL.md`
```markdown
---
name: incremental-implementation
description: Build in thin, verifiable slices — smallest change that passes, then expand.
---
# Incremental Implementation
- Implement ONE thin slice, run its test, then the next.
- Never batch a large change you cannot verify step by step.
- Keep each slice small enough to hold in your head and to review in isolation.
```

`.opencode/skills/apply-design/SKILL.md`
```markdown
---
name: apply-design
description: Implement the interfaces the architect specified — do not redesign them.
---
# Apply Design
- The architect owns design; you implement the interfaces as specified.
- If an interface is wrong or impossible, do NOT silently change it — HANDOFF `needs-input`.
- Match names, parameters, and return types exactly; consumers depend on them.
```

`.opencode/skills/debugging-and-error-recovery/SKILL.md`
```markdown
---
name: debugging-and-error-recovery
description: When your own code fails, find the cause and fix it — do not paper over symptoms.
---
# Debugging & Error Recovery
- Read the full error and the failing test output before editing anything.
- Form one hypothesis, test it, then fix the cause — not the symptom.
- Re-run the exact failing command to confirm the fix.
- If a failure is an environment/setup issue, fix the setup and say so.
```

`.opencode/skills/performance/SKILL.md`
```markdown
---
name: performance
description: Meet the ticket's performance budget without premature optimization.
---
# Performance
- Honor any budget in `CONSTRAINTS.md`; measure before claiming you meet it.
- Optimize only what is measurably slow; do not add caching/complexity speculatively.
- Prefer the stdlib and simple data structures before reaching for a library.
```

`.opencode/skills/ui-engineer/SKILL.md`
```markdown
---
name: ui-engineer
description: Build accessible, semantic frontend UI (WCAG-minded) when the ticket is a UI ticket.
---
# UI Engineer
- Use semantic HTML and the platform's controls before custom widgets.
- Every interactive control is keyboard-reachable and labeled for screen readers.
- Manage focus for dialogs and dynamic content; respect `prefers-reduced-motion`.
- Test the actual rendered behavior, not just the markup.
```

`.opencode/skills/refactoring-and-simplification/SKILL.md`
```markdown
---
name: refactoring-and-simplification
description: Apply the simplifications the minimalism-enforcer flags; do not refactor speculatively.
---
# Refactoring & Simplification
- Refactor ONLY what the `minimalism-enforcer` flagged, plus what the ticket requires.
- Behavior must stay identical; tests stay green.
- Prefer deleting code over adding abstraction. The enforcer owns the verdict; you apply it.
```

- [ ] **Step 4: Write the 2 qa-engineer skills**

`.opencode/skills/root-cause-debugging/SKILL.md`
```markdown
---
name: root-cause-debugging
description: Systematic root-cause analysis of a failing gate — reproduce, isolate, explain, then judge.
---
# Root-Cause Debugging
- Reproduce the failure deterministically before forming a theory.
- Isolate the smallest failing case; read the real error, not the summary.
- Name the root cause in one sentence, with the evidence that proves it.
- Only then decide PASS/FAIL and what senior-dev must change.
```

`.opencode/skills/review-protocol/SKILL.md`
```markdown
---
name: review-protocol
description: How to review an uncommitted diff — verify against the spec, not the author's summary.
---
# Review Protocol
- Review `git diff HEAD` (the uncommitted work); the author's summary is a claim, not evidence.
- For each acceptance criterion, cite the code and the test that prove it.
- Report findings as PASS/FAIL with file:line and the exact reason.
- Never approve code you did not read. Never soften a failure to be agreeable.
```

- [ ] **Step 5: Write the remaining 5 skills (challenger, git-agent, minimalism, tech-writer)**

`.opencode/skills/doubt-driven-review/SKILL.md`
```markdown
---
name: doubt-driven-review
description: Adversarial review of a plan — find the way it fails before code is written.
---
# Doubt-Driven Review
- Attack the plan's assumptions: what is assumed but never stated?
- Attack the constraints: what is security/correctness-relevant but unspecified?
- Name the single most likely real-world failure.
- Return at most 5 prioritized findings, each with a concrete fix. No filler.
```

`.opencode/skills/commit-conventions/SKILL.md`
```markdown
---
name: commit-conventions
description: Land verified work as clean, separated feat and test commits — and never push.
---
# Commit Conventions
- Commit ONLY work you were told passed the quality gate.
- Separate the **test** commit (`test(TICKET-N): ...`) from the **feat** commit (`feat(TICKET-N): ...`).
- One ticket = those two commits, nothing unrelated.
- Never `git push`, never force, never `reset --hard`. Push/PR only via a GitHub MCP if the human asked.
- If the tree is clean or unverified, refuse and HANDOFF `blocked`.
```

`.opencode/skills/minimalism-enforcer/SKILL.md`
```markdown
---
name: minimalism-enforcer
description: Flag over-engineering and demand the simplest stdlib-first solution.
---
# Minimalism Enforcer
- For every new abstraction, ask: does the ticket require it? If not, flag it (YAGNI).
- For every custom helper, name the stdlib/existing function that replaces it.
- Distrust: speculative generality, one-use abstractions, reinvented wheels, config for a constant.
- Return PASS, or FAIL with file:line and the simpler replacement for each finding.
```

`.opencode/skills/system-documenter/SKILL.md`
```markdown
---
name: system-documenter
description: Document a landed feature and record non-obvious decisions as ADRs.
---
# System Documenter
- Update the README with what the feature does and how to use it — short and factual.
- Write an ADR under `docs/adr/` ONLY for a non-obvious decision: context, decision, consequences.
- Document what exists, not aspirations. No invented history.
```

`.opencode/skills/session-retro/SKILL.md`
```markdown
---
name: session-retro
description: Turn a finished run into at most 3 concrete improvements so the factory stops repeating mistakes.
---
# Session Retro
- Read the run's tickets, board, and failure notes.
- Identify the mistakes that cost the most retries or the most review cycles.
- Propose at most 3 concrete edits to `CONSTRAINTS.md` or an agent prompt. Apply the ones you may.
- No vague advice ("write better tests"); only changes someone can make.
```

- [ ] **Step 6: Revise `.opencode/skills/delegate-task/SKILL.md`** (strip the commit step)

```markdown
---
name: delegate-task
description: Hand a strictly scoped, mechanical coding task to the background worker (general) and integrate its diff.
---

# Delegate Task

Call `delegation_delegate_task`:

```
agent: "general"
prompt: "<one precise, self-contained mechanical task>"
contextFiles: ["<files the worker must read>"]
```

Then:
1. **Stay awake** — the call blocks until the worker finishes.
2. **Review the returned diff** (`changed_files`, `diff_stat`). If it violates `CONSTRAINTS.md`,
   fix it inline or re-delegate with a sharper prompt.
3. **Do NOT commit.** Integrate the worker's files into the working tree; `git-agent` commits after
   the quality gate passes.

Only delegate work you could fully specify yourself. Never delegate design decisions.
```

- [ ] **Step 7: Revise `.opencode/skills/core-implementer/SKILL.md`** (add the dirty-tree rule)

```markdown
---
name: core-implementer
description: The primary implementation loop — thin verifiable slices, tests green, tree left dirty for review.
---

# Core Implementer

1. Read the ticket and its acceptance criteria.
2. Implement the smallest verifiable slice; run its test.
3. Repeat until every acceptance criterion passes locally.
4. Delegate mechanical boilerplate to `general` via `delegate-task`; verify its diff.
5. **Leave the working tree dirty — do not commit.** `git-agent` commits after QA passes.
6. HANDOFF the changed paths and the exact commands you ran with their results.
```

- [ ] **Step 8: Verify every skill loads and every name matches its directory**

Run:
```powershell
node -e "const fs=require('fs');const d='.opencode/skills';let bad=0;for(const n of fs.readdirSync(d)){const p=d+'/'+n+'/SKILL.md';if(!fs.existsSync(p))continue;const m=fs.readFileSync(p,'utf8').match(/^---\r?\n[\s\S]*?name:\s*(\S+)/m);const name=m?m[1]:'(none)';if(name!==n){console.log('MISMATCH',n,'->',name);bad++;}}console.log(bad===0?'all names match':'PROBLEMS: '+bad);"
```
Expected: `all names match` (31 directories).

- [ ] **Step 9: Commit**

```bash
git add .opencode/skills
git commit -m "feat(skills): add 20 superskills and gate commits in delegate-task/core-implementer"
```

---

### Task 4: Acceptance harness (detached launcher + prompt)

**Files:**
- Create: `scripts/run-acceptance-v11.cmd`
- Create: `.delegation/runs/prompt-v11.txt`

**Interfaces:**
- Consumes: the warm server on port 4096; `delegation_delegate_task` from the orchestrator.
- Produces: `.delegation/runs/acceptance-v11.log` containing the run transcript.

- [ ] **Step 1: Write `.delegation/runs/prompt-v11.txt`**

```
Operate fully autonomously. Do NOT ask questions; record any assumption you make in INTENT.md and
proceed. Do not use `ask`-gated tools; if something is not permitted, adapt.

Feature: add a `--json` output mode flag to the delegation MCP's `engine_status` tool. With no flag,
behavior is unchanged. With `--json`, `engine_status` prints a single JSON object with the fields
{server_up, version, agent_roster, serverUrl, allowedAgents} and nothing else. This is a change to the
`engine_status` tool handler in `mcp/delegation/src/index.ts` only.

Run the full v1.1 factory flow:
1. INTAKE: write INTENT.md.
2. BLUEPRINT: delegate to architect for a spec + CONSTRAINTS.md + at least two tickets, where the
   second ticket depends_on the first.
3. CHALLENGE: delegate to challenger; if it raises blocking findings, have the architect revise ONCE;
   then delegate to git-agent to commit the planning artifacts.
4. POPULATE: write BOARD.md (you are the sole writer).
5. EXECUTE: delegate the first ticket to senior-dev. It MUST leave the working tree dirty and commit
   nothing.
6. QUALITY: delegate to qa-engineer (review the uncommitted diff, write and run tests) AND to
   minimalism-enforcer. Both must pass before any commit. If either fails, nothing is committed, the
   ticket goes Blocked, and senior-dev retries with the findings (max 2).
7. LAND: delegate to git-agent to commit `feat(TICKET-N)` then `test(TICKET-N)`, and move the ticket
   to Done.
8. Repeat for the second ticket (proves depends_on gating), then CLOSE by delegating to tech-writer.
Finish with a summary of every commit, every child session, and the final BOARD.md state.
```

- [ ] **Step 2: Write `scripts/run-acceptance-v11.cmd`**

```bat
@echo off
cd /d "%~dp0.."
opencode run --agent orchestrator --auto < .delegation\runs\prompt-v11.txt > .delegation\runs\acceptance-v11.log 2>&1
echo EXIT=%ERRORLEVEL% >> .delegation\runs\acceptance-v11.log
```

- [ ] **Step 3: Pre-flight the harness without running it**

Run:
```powershell
Test-Path .delegation\runs\prompt-v11.txt; Test-Path scripts\run-acceptance-v11.cmd
```
Expected: `True` twice.

- [ ] **Step 4: Commit**

```bash
git add scripts/run-acceptance-v11.cmd .delegation/runs/prompt-v11.txt
git commit -m "test: add v1.1 acceptance harness (detached launcher + prompt)"
```

Note: `.delegation/runs/` is gitignored; if `git add` refuses, add the prompt with `git add -f`.

---

### Task 5: Run the v1.1 acceptance test end-to-end

**Files:**
- Consumes: `scripts/run-acceptance-v11.cmd`
- Produces: `.delegation/runs/acceptance-v11.log`; commits in git history.

- [ ] **Step 1: Ensure a clean tree and a warm server**

Run:
```powershell
git status --porcelain
Start-Process opencode -ArgumentList serve,--port,4096
Start-Sleep -Seconds 5
Invoke-RestMethod http://localhost:4096/global/health
```
Expected: tree clean (no output); health returns `{healthy:True; version:1.18.30}`.

- [ ] **Step 2: Launch the run detached and watch the log**

Run:
```powershell
Start-Process cmd -ArgumentList '/c','scripts\run-acceptance-v11.cmd'
Start-Sleep -Seconds 60
Get-Content .delegation\runs\acceptance-v11.log -Tail 30
```
Expected: the orchestrator begins INTAKE and writes `INTENT.md`.

- [ ] **Step 3: Observe the dirty-tree checkpoint (EXEC → QUALITY)** *(spec §7 criterion 3)*

While the run is between EXECUTE and QUALITY, in a second shell run:
```powershell
git status --porcelain
git log --oneline -3
```
Expected: `git status` shows modified/untracked **implementation** files (dirty tree) and `git log`
shows **no** `feat(TICKET-1)` commit yet. This is the proof that review precedes commit.

- [ ] **Step 4: Confirm only git-agent landed commits** *(criterion 5)*

Run:
```powershell
git log --oneline -8
```
Expected: `feat(TICKET-1)` and `test(TICKET-1)` commits exist and appear **after** the planning
commit; the child sessions that produced them are `git-agent` (cross-check the log:
`Select-String -Path .delegation\runs\acceptance-v11.log -Pattern 'git-agent'`).

- [ ] **Step 5: Confirm the failure path left no commit** *(criterion 6)*

Run:
```powershell
Select-String -Path .delegation\runs\acceptance-v11.log -Pattern 'Blocked|FAIL|fix loop|retry' | Select-Object -First 20
git log --oneline --grep "TICKET-1" 
```
Expected: at least one gate FAIL/Blocked event is visible in the log, and the number of
`TICKET-1` commits equals **2** (not more) — proving failed attempts committed nothing.

- [ ] **Step 6: Confirm CLOSE ran and the board is Done** *(criteria 7–8)*

Run:
```powershell
Get-Content BOARD.md
Select-String -Path .delegation\runs\acceptance-v11.log -Pattern 'tech-writer' | Select-Object -First 5
```
Expected: `BOARD.md` shows both tickets in **Done**; the log shows a `tech-writer` child session.

- [ ] **Step 7: Land the run artifacts and stop the server**

```bash
git add BOARD.md CONSTRAINTS.md INTENT.md docs/specs tickets 2>$null
git commit -m "feat(acceptance): land v1.1 run artifacts"
```
Then kill the `opencode serve` process on port 4096.

- [ ] **Step 8: Report the result to the human**

Summarize: the 8 criteria with the evidence for each; every commit sha; every child session id and
agent; and the final `BOARD.md`. If any criterion failed, say which and why — do not claim a pass
that the evidence does not show.

---

## Self-Review

**1. Spec coverage**

| Spec section | Task |
|---|---|
| §3 flow steps 2.5 CHALLENGE | Task 2 (orchestrator prompt), Task 3 (doubt-driven-review) |
| §3 step 3 EXEC (no commit) | Task 1 (senior-dev perms), Task 2 (senior-dev prompt), Task 3 (core-implementer) |
| §3 step 4 QUALITY (2 auditors) | Task 1, Task 2 |
| §3 step 5 LAND (git-agent) | Task 1, Task 2 (git-agent prompt), Task 3 (commit-conventions) |
| §3 step 6 CLOSE (tech-writer) | Task 2, Task 3 |
| §4 roster (4 new agents) | Task 1, Task 2 |
| §5 permission deltas | Task 1 |
| §6 20 superskills | Task 3 |
| §7 acceptance (8 criteria) | Task 5 (steps 3–6 map to criteria 3,5,6,7,8) |
| §8 open item 1 (denies bite) | Task 1 Step 4 |
| §8 open item 2 (bash glob vs child shell) | **Resolved by v1 evidence** — senior-dev committed 91dcfe7 with globs `git add*`/`git commit*`, proving the globs match the child's invocation form. No new work; confirm incidentally in Task 5 Step 4. |
| §8 open item 3 (GitHub MCP conditional) | Task 2 Step 2 (git-agent prompt: local-only unless a `github_*` tool exists); push denied in Task 1 |

**2. Placeholder scan:** every step carries full file content or an exact command with expected
output. No TBD/TODO/"similar to".

**3. Type/name consistency:** skill directory names equal their `name` frontmatter (verified in Task 3
Step 8). Agent names in `opencode.json` (Task 1) match the agent files (Task 2) and the orchestrator's
dispatch list (Task 2 Step 5). The MCP tool names (`delegation_*`) are unchanged from v1.

**Known count correction:** the spec's §6 header estimated "~24" superskills; the §6 table enumerates
**20 new** distinct skills (existing 11 + 20 = **31** total). The table is authoritative; `~24` was an
estimate. No task was dropped.

**Known limitation (carried from v1):** per-caller scoping inside the MCP is not enforceable
(opencode does not pass caller identity to MCP tools); `git-agent`-only commits are enforced by the
permission matrix plus prompt discipline, not by the MCP. Accepted for v1.1.
