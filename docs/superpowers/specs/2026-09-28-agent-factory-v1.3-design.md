# Agent Factory v1.3 Design Spec: Observability, Mentorship Mode, Adaptive Security & Guardrails

**Date:** 2026-09-28  
**Status:** Approved  
**Base:** `feat/agent-factory-v1` (v1.2 delivered with 54 passing tests, 9 MCP tools, 10 agents, 36 skills)  
**Branch:** `feat/agent-factory-v1.3`

---

## 1. Problem Statement & Scope

As Agent Factory matures with multi-agent orchestration, parallel worktrees, and strict review gates, four critical capabilities are needed for v1.3:
1. **Engine Observability:** No programmatic way to inspect child execution metrics, session runtimes, failure rates, or file modification stats from `.delegation/logs/*.jsonl`.
2. **Mentorship & Tiered Implementation:** `senior-dev` needs a formalized mechanism to delegate bounded sub-tasks to a lightweight `junior-dev` agent while maintaining review and architectural guidance.
3. **Adaptive Security SAST:** `qa-engineer` needs adaptive static analysis that leverages external SAST tools (like Semgrep MCP) when available and falls back cleanly to static rule heuristics.
4. **Automated Guardrail Verification:** Security guardrails (path-traversal protection, unauthorized shell/git denials, agent allowlists) must be systematically protected by automated unit tests and audited by `challenger`.

---

## 2. Architecture & Components

### §2.1 Observability: `engine_metrics` (10th MCP Tool)

The delegation MCP server exposes `engine_metrics` as its 10th tool.

#### Implementation: `mcp/delegation/src/metrics.ts`
- Reads log entries from `<repoRoot>/.delegation/logs/*.jsonl`.
- Aggregates metrics across session runs:
  - Total session count.
  - Per-agent run breakdown (invocations, duration average/min/max in ms).
  - Outcome distribution (`done`, `blocked`, `needs-input`).
  - Total changed files across executions.
  - List of recent failures with session ID, agent, timestamp, and summary.
- Filtering options: optional `{ agent?: string, limit?: number }`.

#### Interface Types:
```ts
export interface AgentMetrics {
  total_runs: number;
  outcomes: { done: number; blocked: number; needs_input: number };
  avg_duration_ms: number;
  min_duration_ms: number;
  max_duration_ms: number;
  total_files_changed: number;
}

export interface MetricsSummary {
  total_sessions: number;
  agents: Record<string, AgentMetrics>;
  recent_failures: Array<{
    session_id: string;
    agent: string;
    summary: string;
    timestamp: string;
  }>;
}
```

---

### §2.2 Mentorship Mode & `junior-dev` Role

#### Agent: `.opencode/agent/junior-dev.md`
- **Role:** Implements scoped, clear, and well-scaffolded implementation tasks (boilerplate, helpers, narrow unit test additions) delegated by `senior-dev`.
- **Permissions in `opencode.json`:**
  - `edit`: `src/**`, `tests/**` (strictly limited to workspace source and test directories).
  - `bash`: Safe read-only commands allowed (`git status*`, `git diff*`, `npm test*`, `node --test*`); denials on `git add*`, `git commit*`, `git push*`, `git reset*--hard*`, `rm -rf*`, with catch-all denial `*`: "deny".
  - `ctx_*`: Denied.
  - `delegation_*`: Denied (leaf worker, cannot spawn child sessions).
  - `task`: Denied.

#### Skill: `.opencode/skills/mentorship/SKILL.md`
- **Assigned Agent:** `senior-dev`.
- **Workflow:**
  1. **Scaffold & Interface Definition:** `senior-dev` prepares types, module interfaces, and clear acceptance criteria.
  2. **Delegation:** Dispatches `junior-dev` via `delegation_delegate_task(agent: "junior-dev", prompt: "...", contextFiles: [...])`.
  3. **Review & Coaching:** `senior-dev` inspects uncommitted diff from `junior-dev`, refines implementation, and leaves tree dirty for the QA review gate.

---

### §2.3 Adaptive Security Hardening

#### Skill: `.opencode/skills/security-hardening/SKILL.md`
- **Assigned Agent:** `qa-engineer`.
- **Updated Workflow:**
  1. **Tool Discovery:** Inspect available environment tools (e.g. `semgrep_*` MCP tools or local scanner).
  2. **Multi-tier SAST:**
     - **Tier 1 (Semgrep MCP available):** Run security scans on modified files and diffs.
     - **Tier 2 (Fallback):** Execute static pattern rules checking for secrets, unsanitized subprocess invocation, path traversal, and unsafe SQL/eval.
  3. **Gate Decision:** Any high/critical finding blocks the quality gate with an actionable remediation item.

---

### §2.4 Guardrail Auditing & Regression Test Suite

#### Skill: `.opencode/skills/guardrail-audit/SKILL.md`
- **Assigned Agent:** `challenger`.
- **Workflow:** Audits permissions, path boundary enforcement, and MCP input schemas during design and blueprint challenge phases.

#### Test Suite: `mcp/delegation/test/guardrails.test.ts`
- Verifies path traversal prevention in `assertInside` across `ticket_write`, `ticket_read`, and `delegate_task`.
- Verifies rejection of unlisted agents in `delegateTask` against `allowedAgents`.
- Verifies snapshot isolation and error handling in `haltAndRevert`.
- Verifies log sanitization and graceful handling of malformed `.jsonl` files in `engine_metrics`.

---

## 3. Configuration & Roster Deltas

### 3.1 `DELEGATE_CONFIG.json`
Update `allowedAgents` to include `junior-dev`:
```json
{
  "allowedAgents": [
    "architect",
    "senior-dev",
    "qa-engineer",
    "general",
    "challenger",
    "git-agent",
    "minimalism-enforcer",
    "tech-writer",
    "devobs",
    "visualizer",
    "junior-dev"
  ]
}
```

### 3.2 `opencode.json`
- Add `junior-dev` subagent configuration with strict permissions.
- Add `mentorship` skill to `senior-dev`.
- Add `guardrail-audit` skill to `challenger`.

---

## 4. Acceptance Criteria & Verification

1. **MCP Tool Suite:** Total 10 registered tools in `mcp/delegation/src/index.ts` in exact order:
   `delegate_task`, `delegate_parallel`, `engine_status`, `engine_abort`, `engine_halt_and_revert`, `engine_metrics`, `board_read`, `board_update`, `ticket_write`, `ticket_read`.
2. **Metrics Aggregation:** `engine_metrics` accurately parses `.delegation/logs/*.jsonl` files and returns aggregated stats for runs, durations, and outcomes.
3. **Guardrail Tests:** `mcp/delegation/test/guardrails.test.ts` passes all path-traversal and boundary tests.
4. **Full Test Suite:** All unit and integration test suites pass with 0 failures (`node --test`).
5. **Skill & Agent Validation:** 38 total superskills and 11 custom agents properly registered and discoverable.
