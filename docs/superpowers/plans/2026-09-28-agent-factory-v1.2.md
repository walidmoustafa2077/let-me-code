# Agent Factory v1.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement ephemeral Git worktree parallel task execution (`delegate_parallel`), emergency halt and snapshot rollback (`engine_halt_and_revert`), two new specialist agents (`devobs`, `visualizer`), and five new superskills.

**Architecture:** Ephemeral worktrees under `.worktrees/<session-id>` isolate concurrent child executions against a warm OpenCode server. All changes are captured via diff summaries and worktrees are cleaned up immediately. Emergency recovery snapshots dirty state to `.delegation/snapshots/` and restores the working tree.

**Tech Stack:** Node.js 24 (native TypeScript), `@modelcontextprotocol/sdk` (1.30.1), `zod`, `node:test`, `node:assert/strict`, Git CLI.

**Spec:** `docs/superpowers/specs/2026-09-28-agent-factory-v1.2-design.md`

## Global Constraints

- Platform: Windows (win32), Node.js v24+, Git 2.54+.
- Single-writer Git policy: `git-agent` remains the sole writer of commits.
- Subagent permissions in `opencode.json` MUST use explicit `allow`/`deny` (no `"ask"`).
- `push`, force-push, and `reset --hard` are denied across all agents.
- All TypeScript imports MUST use `.ts` relative extensions.
- Exactly 9 MCP tools must be registered and returned by `listToolNames()`.

---

## File Structure

| File | Purpose |
|---|---|
| `mcp/delegation/src/worktree.ts` | Worktree creation, cleanup, and pruning helpers |
| `mcp/delegation/src/revert.ts` | State snapshotting, session aborts, and tree revert |
| `mcp/delegation/src/spawn.ts` | `delegateParallel` multi-task orchestration |
| `mcp/delegation/src/index.ts` | Register `delegate_parallel` and `engine_halt_and_revert` (9 tools total) |
| `mcp/delegation/test/worktree.test.ts` | Unit tests for worktree creation, isolation, and removal |
| `mcp/delegation/test/revert.test.ts` | Unit tests for halt, snapshot generation, and rollback |
| `mcp/delegation/test/parallel.test.ts` | Integration tests for parallel child task execution |
| `opencode.json` | Configuration for `devobs`, `visualizer`, and new tool permissions |
| `.opencode/agent/devobs.md` | Specialist role prompt for DevOps / Infrastructure |
| `.opencode/agent/visualizer.md` | Specialist role prompt for UI / UX Prototyping |
| `.opencode/skills/branch-hygiene/SKILL.md` | Skill for worktree & branch hygiene |
| `.opencode/skills/e2e-and-browser-testing/SKILL.md` | Skill for E2E testing workflows |
| `.opencode/skills/agent-skill-author/SKILL.md` | Skill for meta-authoring OpenCode skills |
| `.opencode/skills/emergency-halt/SKILL.md` | Skill for emergency abort & rollback |
| `.opencode/skills/async-unblocker/SKILL.md` | Skill for hung session recovery |

---

### Task 1: Worktree Lifecycle Helpers (`worktree.ts`)

**Files:**
- Create: `mcp/delegation/src/worktree.ts`
- Test: `mcp/delegation/test/worktree.test.ts`

- [ ] **Step 1: Write failing test for worktree creation and removal**
- [ ] **Step 2: Run test to verify failure (`node --test mcp/delegation/test/worktree.test.ts`)**
- [ ] **Step 3: Implement `createWorktree`, `removeWorktree`, and `pruneWorktrees` in `worktree.ts`**
- [ ] **Step 4: Run test to verify pass**
- [ ] **Step 5: Commit `feat(delegation): add ephemeral worktree lifecycle helpers`**

---

### Task 2: Parallel Delegation Orchestration (`spawn.ts`)

**Files:**
- Modify: `mcp/delegation/src/spawn.ts`
- Test: `mcp/delegation/test/parallel.test.ts`

- [ ] **Step 1: Write failing test for `delegateParallel`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `delegateParallel` in `spawn.ts` leveraging worktrees and `Promise.all`**
- [ ] **Step 4: Run test to verify pass**
- [ ] **Step 5: Commit `feat(delegation): implement delegateParallel with worktree isolation`**

---

### Task 3: Emergency Halt and Revert (`revert.ts`)

**Files:**
- Create: `mcp/delegation/src/revert.ts`
- Test: `mcp/delegation/test/revert.test.ts`

- [ ] **Step 1: Write failing test for `haltAndRevert`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `haltAndRevert` with patch snapshotting and clean tree restoration**
- [ ] **Step 4: Run test to verify pass**
- [ ] **Step 5: Commit `feat(delegation): add haltAndRevert emergency recovery helper`**

---

### Task 4: Expose 9 Tools in MCP Server (`index.ts`)

**Files:**
- Modify: `mcp/delegation/src/index.ts`
- Modify: `mcp/delegation/test/tools.test.ts`

- [ ] **Step 1: Update `tools.test.ts` to assert all 9 tools and schemas**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Register `delegate_parallel` and `engine_halt_and_revert` in `index.ts`**
- [ ] **Step 4: Run full MCP test suite (`npm test`)**
- [ ] **Step 5: Commit `feat(delegation): expose delegate_parallel and engine_halt_and_revert MCP tools`**

---

### Task 5: Agent Roster (`devobs`, `visualizer`) & Config Update

**Files:**
- Modify: `opencode.json`
- Create: `.opencode/agent/devobs.md`
- Create: `.opencode/agent/visualizer.md`
- Modify: `.opencode/agent/orchestrator.md`

- [ ] **Step 1: Update `opencode.json` with `devobs` and `visualizer` permissions**
- [ ] **Step 2: Create `.opencode/agent/devobs.md` and `.opencode/agent/visualizer.md`**
- [ ] **Step 3: Update `.opencode/agent/orchestrator.md` to reference parallel delegation**
- [ ] **Step 4: Verify agent listing via `opencode agent list`**
- [ ] **Step 5: Commit `feat(agents): add devobs and visualizer specialist roles`**

---

### Task 6: Add 5 New Superskills

**Files:**
- Create: `.opencode/skills/branch-hygiene/SKILL.md`
- Create: `.opencode/skills/e2e-and-browser-testing/SKILL.md`
- Create: `.opencode/skills/agent-skill-author/SKILL.md`
- Create: `.opencode/skills/emergency-halt/SKILL.md`
- Create: `.opencode/skills/async-unblocker/SKILL.md`

- [ ] **Step 1: Author all 5 SKILL.md files matching directory names**
- [ ] **Step 2: Verify all 36 skill directories and frontmatter**
- [ ] **Step 3: Commit `feat(skills): add branch-hygiene, e2e-testing, skill-author, emergency-halt, async-unblocker`**

---

### Task 7: End-to-End Acceptance Run & Verification

- [ ] **Step 1: Run full test suite (`npm test`)**
- [ ] **Step 2: Execute parallel execution test verifying ephemeral worktree creation & cleanup**
- [ ] **Step 3: Commit all acceptance artifacts and land v1.2**
