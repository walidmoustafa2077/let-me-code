# Agent Factory v1.2 Design Specification

**Status:** Approved  
**Date:** 2026-09-28  
**Branch:** `feat/agent-factory-v1.2`  
**Base:** `feat/agent-factory-v1`

---

## 1. Goal & Architectural Overview

Agent Factory v1.1 established single-writer Git authority (`git-agent`), uncommitted diff verification, and multi-agent quality gates (`qa-engineer`, `challenger`, `minimalism-enforcer`, `tech-writer`). 

**v1.2 introduces three major capabilities:**
1. **Parallel Execution via Ephemeral Git Worktrees (`delegate_parallel`):** Enable multiple independent subagents to run concurrently in isolated working directories, preventing state interference and race conditions.
2. **Specialist Production & Prototyping Roles (`devobs` & `visualizer`):** Dedicated agents for infrastructure/deployment readiness and UI/UX rapid prototyping.
3. **Deterministic Failure Recovery (`emergency-halt` & `async-unblocker`):** Fast multi-session aborts, uncommitted change snapshots, and automated stuck-session resolution.

---

## 2. MCP Layer Enhancements (`mcp/delegation`)

The delegation MCP server (`mcp/delegation`) expands from 7 tools to 9 tools:

| Tool Name | Purpose | Parameters | Returns |
|---|---|---|---|
| `delegate_parallel` | Run multiple child tasks concurrently in isolated worktrees | `tasks: array of { agent, prompt, contextFiles?, model? }` | `results: array of DelegateResult` |
| `engine_halt_and_revert` | Abort all in-flight runs, snapshot dirty state, revert to HEAD | `reason?: string` | `{ aborted_sessions: string[], snapshot_path: string, reverted: boolean }` |

### 2.1 `delegate_parallel` Mechanics & Worktree Lifecycle
1. **Worktree Creation:** For each task in `tasks`:
   - Unique worktree directory created under `.worktrees/<session-id>`.
   - `git worktree add -f .worktrees/<session-id> HEAD`.
2. **Concurrent Execution:**
   - Dispatches each task against the warm OpenCode HTTP server with working directory pointed to its worktree.
   - Tasks execute in parallel using `Promise.all`.
3. **Diff Capture & Cleanup:**
   - Captures `changed_files`, `diff_stat`, and `HANDOFF` for each worktree.
   - Executes `git worktree remove --force .worktrees/<session-id>` and `git worktree prune`.
4. **Aggregation:**
   - Returns array of `{ agent, status, summary, handoff, diff_stat, changed_files, session_id }`.

### 2.2 `engine_halt_and_revert` Mechanics
1. Queries active sessions or uses tracked session IDs.
2. Posts `POST /session/:id/abort` to all active sessions.
3. If working tree has uncommitted modifications, exports `git diff HEAD` to `.delegation/snapshots/<timestamp>.patch`.
4. Executes `git checkout -- .` and `git clean -fd` to return the workspace to a known clean state.

---

## 3. Specialist Agent Roles & Permissions

Factory roster expands to **10 custom agents + `general` worker**:

| Agent | Mode | Focus Area | Permissions (`opencode.json`) |
|---|---|---|---|
| **`devobs`** *(new)* | `subagent` | Production readiness, Docker, CI/CD pipelines, release validation | `edit`: `deploy/**`, `.github/**`, `docker/**`, `Dockerfile*`, `compose*.yml`<br>`bash`: `allow` for linters/validation (`docker compose config`, `npm run lint`, etc.), `git add/commit/push` denied<br>`delegation_*`: `deny` |
| **`visualizer`** *(new)* | `subagent` | Rapid UI prototyping, mockups, HTML/React previews, WCAG audits | `edit`: `prototypes/**`, `mockups/**`, `docs/visual/**`<br>`bash`: `allow` for preview servers and lightweight scripts, `git add/commit/push` denied<br>`delegation_*`: `deny` |
| **`orchestrator`** | `primary` | Factory coordination, board state, unblocker, emergency halt | Unchanged edit/bash rules + new recovery skills + `delegation_*` allow |
| **`senior-dev`** | `subagent` | Implementation in thin slices, leaves tree dirty | `edit`: `src/**`, `tests/**`, `mcp/**/src/**`<br>`bash`: test runners + read-only git<br>`delegation_*`: allow |
| **`qa-engineer`** | `subagent` | Quality gate & test verification suites | `edit`: `tests/**`, `mcp/**/test/**`<br>`bash`: test runners + read-only git<br>`delegation_*`: deny |
| **`git-agent`** | `subagent` | Sole writer of git commits | `edit`: `deny`<br>`bash`: `git add/commit/status/diff/log` (`push` denied)<br>`delegation_*`: deny |
| **`challenger`** | `subagent` | Adversarial blueprint review | `edit`: `deny`, `bash`: read-only git |
| **`minimalism-enforcer`** | `subagent` | Code minimalism audit | `edit`: `deny`, `bash`: read-only git |
| **`tech-writer`** | `subagent` | Documentation, ADRs, skill authoring | `edit`: `docs/**`, `README.md`, `CONSTRAINTS.md`, `.opencode/skills/**`<br>`bash`: read-only git |
| **`architect`** | `subagent` | Blueprint, constraints, ticket breakdown | `edit`: `docs/specs/**`, `CONSTRAINTS.md`, `tickets/**` |
| **`general`** | `subagent` | Subagent worker fallback | Managed worker |

---

## 4. Superskills Expansion (5 New Skills, 36 Total)

| Agent | Superskill | Responsibility |
|---|---|---|
| `git-agent` | `branch-hygiene` | Worktree lifecycle cleanup, branch pruning, and pre-commit validation |
| `qa-engineer` | `e2e-and-browser-testing` | Playwright & browser automation testing workflows |
| `tech-writer` | `agent-skill-author` | Authoring, validating, and formatting new OpenCode skills |
| `orchestrator` | `emergency-halt` | Coordinated run abort, snapshot export, and tree rollback |
| `orchestrator` | `async-unblocker` | Timeout tracking, hung process diagnosis, ticket retry / block escalation |

---

## 5. End-to-End Acceptance Test (v1.2)

**Acceptance Feature:**  
*Add `delegate_parallel` and `engine_halt_and_revert` to the delegation MCP, add `devobs` & `visualizer` agent configurations, and execute a parallel multi-agent task run verifying worktree isolation.*

**Verification Criteria:**
1. MCP exposes all 9 tools (`delegate_task`, `delegate_parallel`, `engine_status`, `engine_abort`, `engine_halt_and_revert`, `board_read`, `board_update`, `ticket_write`, `ticket_read`).
2. `delegate_parallel` runs two subagents simultaneously in separate `.worktrees/` directories with zero file conflicts.
3. `engine_halt_and_revert` captures uncommitted modifications to a snapshot patch and restores working tree to clean HEAD.
4. `devobs` and `visualizer` roles configured and verified via `opencode agent list`.
5. Full automated test suite passes with 100% green tests.
