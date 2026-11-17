# Agent Factory v1.3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Agent Factory v1.3: 10th MCP tool `engine_metrics`, dedicated `junior-dev` agent with `mentorship` protocol for `senior-dev`, adaptive SAST security scanning with Semgrep fallback, and automated guardrail regression tests.

**Architecture:** Add `metrics.ts` log aggregation module in MCP; expose `engine_metrics` as 10th tool in `index.ts`; author automated security boundary tests in `guardrails.test.ts`; configure `junior-dev` agent in `opencode.json` and `DELEGATE_CONFIG.json`; author `mentorship` and `guardrail-audit` superskills and update `security-hardening`.

**Tech Stack:** TypeScript (Node 24 native type-stripping), `@modelcontextprotocol/sdk` (v1.30.1), `zod` (v3.23.8), `node:test` + `node:assert/strict`, OpenCode JSON schemas.

**Spec:** `docs/superpowers/specs/2026-09-28-agent-factory-v1.3-design.md`

## Global Constraints

- Runtime: Node v24.17.0, git 2.54.0.windows.1, opencode 1.18.30 on win32.
- Branch: `feat/agent-factory-v1.3` (forked from `feat/agent-factory-v1`).
- Relative imports in `mcp/delegation/src/**` and `test/**` MUST use explicit `.ts` extensions.
- Subagent permissions in `opencode.json` MUST use ONLY `"allow"` or `"deny"` (zero `"ask"` permissions).
- Git writes remain strictly isolated to `git-agent` only; implementer subagents leave working tree dirty.
- MCP Server tool count increases from 9 to exactly 10 in specified order:
  1. `delegate_task`
  2. `delegate_parallel`
  3. `engine_status`
  4. `engine_abort`
  5. `engine_halt_and_revert`
  6. `engine_metrics`
  7. `board_read`
  8. `board_update`
  9. `ticket_write`
  10. `ticket_read`

---

## File Structure

| Path | Purpose |
|---|---|
| `mcp/delegation/src/metrics.ts` | JSONL log parser and telemetry aggregator |
| `mcp/delegation/test/metrics.test.ts` | Unit tests for log parsing, outcome counts, and duration calculations |
| `mcp/delegation/src/index.ts` | Registers `engine_metrics` as 10th MCP tool |
| `mcp/delegation/test/tools.test.ts` | Updates 10-tool list and `engine_metrics` integration test |
| `mcp/delegation/test/json-flag.test.ts` | Updates tool count assertions to 10 |
| `mcp/delegation/test/guardrails.test.ts` | Automated regression test suite for security guardrails |
| `DELEGATE_CONFIG.json` | Adds `junior-dev` to `allowedAgents` |
| `mcp/delegation/src/config.ts` | Updates `defaultConfig.allowedAgents` to include `junior-dev` |
| `opencode.json` | Configures `junior-dev` agent and updates `senior-dev`/`challenger` skills |
| `.opencode/agent/junior-dev.md` | Role prompt for `junior-dev` |
| `.opencode/skills/mentorship/SKILL.md` | Skill for `senior-dev` to delegate and coach `junior-dev` |
| `.opencode/skills/guardrail-audit/SKILL.md` | Skill for `challenger` to audit guardrails and permissions |
| `.opencode/skills/security-hardening/SKILL.md` | Updated skill for `qa-engineer` with adaptive Semgrep SAST |

---

### Task 1: Log Aggregation & Metrics Module (`metrics.ts` + `metrics.test.ts`)

**Files:**
- Create: `mcp/delegation/src/metrics.ts`
- Create: `mcp/delegation/test/metrics.test.ts`

**Interfaces:**
- Produces: `readMetrics(repoRoot: string, filter?: { agent?: string; limit?: number }): Promise<MetricsSummary>`
- Consumes: `.delegation/logs/*.jsonl` structure written by `spawn.ts:writeLog`

- [ ] **Step 1: Write failing tests in `mcp/delegation/test/metrics.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { readMetrics } from "../src/metrics.ts";

test("readMetrics returns zeroed summary when logs dir does not exist", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "metrics-none-"));
  const metrics = await readMetrics(tmp);
  assert.equal(metrics.total_sessions, 0);
  assert.deepEqual(metrics.agents, {});
  assert.deepEqual(metrics.recent_failures, []);
});

test("readMetrics aggregates session runs, outcomes, and durations correctly", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "metrics-data-"));
  const logsDir = path.join(tmp, ".delegation", "logs");
  await fs.mkdir(logsDir, { recursive: true });

  const log1 = {
    agent: "senior-dev",
    sessionId: "ses_1",
    payload: {
      status: "done",
      summary: "all done",
      changed_files: ["src/a.ts"],
      duration_ms: 2000
    }
  };
  const log2 = {
    agent: "senior-dev",
    sessionId: "ses_2",
    payload: {
      status: "blocked",
      summary: "compile error",
      changed_files: [],
      duration_ms: 4000
    }
  };
  const log3 = {
    agent: "qa-engineer",
    sessionId: "ses_3",
    payload: {
      status: "done",
      summary: "tests pass",
      changed_files: ["test/a.test.ts"],
      duration_ms: 1500
    }
  };

  await fs.writeFile(path.join(logsDir, "2026-09-28-senior-dev-ses_1.jsonl"), JSON.stringify(log1) + "\n");
  await fs.writeFile(path.join(logsDir, "2026-09-28-senior-dev-ses_2.jsonl"), JSON.stringify(log2) + "\n");
  await fs.writeFile(path.join(logsDir, "2026-09-28-qa-engineer-ses_3.jsonl"), JSON.stringify(log3) + "\n");

  const summary = await readMetrics(tmp);
  assert.equal(summary.total_sessions, 3);
  assert.equal(summary.agents["senior-dev"].total_runs, 2);
  assert.equal(summary.agents["senior-dev"].outcomes.done, 1);
  assert.equal(summary.agents["senior-dev"].outcomes.blocked, 1);
  assert.equal(summary.agents["senior-dev"].avg_duration_ms, 3000);
  assert.equal(summary.agents["senior-dev"].total_files_changed, 1);

  assert.equal(summary.agents["qa-engineer"].total_runs, 1);
  assert.equal(summary.agents["qa-engineer"].outcomes.done, 1);
  assert.equal(summary.recent_failures.length, 1);
  assert.equal(summary.recent_failures[0].session_id, "ses_2");
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test mcp/delegation/test/metrics.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `mcp/delegation/src/metrics.ts`**

```ts
import fs from "node:fs/promises";
import path from "node:path";

export interface AgentMetrics {
  total_runs: number;
  outcomes: { done: number; blocked: number; needs_input: number };
  avg_duration_ms: number;
  min_duration_ms: number;
  max_duration_ms: number;
  total_files_changed: number;
}

export interface RecentFailure {
  session_id: string;
  agent: string;
  summary: string;
  timestamp: string;
}

export interface MetricsSummary {
  total_sessions: number;
  agents: Record<string, AgentMetrics>;
  recent_failures: RecentFailure[];
}

export interface MetricsFilter {
  agent?: string;
  limit?: number;
}

export async function readMetrics(repoRoot: string, filter?: MetricsFilter): Promise<MetricsSummary> {
  const logsDir = path.join(repoRoot, ".delegation", "logs");
  let files: string[] = [];
  try {
    files = await fs.readdir(logsDir);
  } catch {
    return {
      total_sessions: 0,
      agents: {},
      recent_failures: []
    };
  }

  const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
  const summary: MetricsSummary = {
    total_sessions: 0,
    agents: {},
    recent_failures: []
  };

  const durationsByAgent: Record<string, number[]> = {};

  for (const file of jsonlFiles) {
    const fullPath = path.join(logsDir, file);
    let content = "";
    try {
      content = await fs.readFile(fullPath, "utf8");
    } catch {
      continue;
    }

    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    for (const line of lines) {
      let entry: any;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      const agent = entry.agent || "unknown";
      if (filter?.agent && filter.agent !== agent) {
        continue;
      }

      const payload = entry.payload || {};
      const status: string = payload.status || "needs-input";
      const duration: number = typeof payload.duration_ms === "number" ? payload.duration_ms : 0;
      const changedFilesCount: number = Array.isArray(payload.changed_files) ? payload.changed_files.length : 0;

      summary.total_sessions += 1;

      if (!summary.agents[agent]) {
        summary.agents[agent] = {
          total_runs: 0,
          outcomes: { done: 0, blocked: 0, needs_input: 0 },
          avg_duration_ms: 0,
          min_duration_ms: duration,
          max_duration_ms: duration,
          total_files_changed: 0
        };
        durationsByAgent[agent] = [];
      }

      const am = summary.agents[agent];
      am.total_runs += 1;
      am.total_files_changed += changedFilesCount;

      if (status === "done") am.outcomes.done += 1;
      else if (status === "blocked") {
        am.outcomes.blocked += 1;
        summary.recent_failures.push({
          session_id: entry.sessionId || file,
          agent,
          summary: payload.summary || "blocked",
          timestamp: file.split("-").slice(0, 3).join("-")
        });
      } else {
        am.outcomes.needs_input += 1;
      }

      durationsByAgent[agent].push(duration);
      if (duration < am.min_duration_ms) am.min_duration_ms = duration;
      if (duration > am.max_duration_ms) am.max_duration_ms = duration;
    }
  }

  for (const [agent, durations] of Object.entries(durationsByAgent)) {
    if (durations.length > 0) {
      const sum = durations.reduce((a, b) => a + b, 0);
      summary.agents[agent].avg_duration_ms = Math.round(sum / durations.length);
    }
  }

  if (filter?.limit && filter.limit > 0) {
    summary.recent_failures = summary.recent_failures.slice(0, filter.limit);
  }

  return summary;
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `node --test mcp/delegation/test/metrics.test.ts`
Expected: PASS (2 tests pass)

---

### Task 2: Expose 10th MCP Tool `engine_metrics` (`index.ts` + `tools.test.ts`)

**Files:**
- Modify: `mcp/delegation/src/index.ts`
- Modify: `mcp/delegation/test/tools.test.ts`
- Modify: `mcp/delegation/test/json-flag.test.ts`

**Interfaces:**
- Consumes: `readMetrics` from `./metrics.ts`
- Produces: Registered MCP tool `engine_metrics` (10 tools total in `TOOL_NAMES`)

- [ ] **Step 1: Update `mcp/delegation/src/index.ts`**

Update `TOOL_NAMES` array:
```ts
export const TOOL_NAMES = [
  "delegate_task",
  "delegate_parallel",
  "engine_status",
  "engine_abort",
  "engine_halt_and_revert",
  "engine_metrics",
  "board_read",
  "board_update",
  "ticket_write",
  "ticket_read",
] as const;
```

Import `readMetrics` and register `engine_metrics`:
```ts
server.registerTool(
  "engine_metrics",
  {
    description: "Read aggregated engine telemetry, run counts, outcome distributions, and durations from logs.",
    inputSchema: z.object({
      agent: z.string().optional().describe("Optional filter by specific agent name"),
      limit: z.number().int().positive().optional().describe("Max recent failure entries to return"),
    }),
  },
  async (args) => {
    try {
      const summary = await readMetrics(resolvedRoot, args);
      return ok(JSON.stringify(summary, null, 2));
    } catch (err: any) {
      return fail(`engine_metrics failed: ${err?.message ?? String(err)}`);
    }
  }
);
```

- [ ] **Step 2: Update `mcp/delegation/test/tools.test.ts` and `json-flag.test.ts`**

Update expected tool count from 9 to 10 and add round-trip test for `engine_metrics`.

- [ ] **Step 3: Run all MCP tests**

Run: `npm --prefix mcp/delegation test`
Expected: All tests pass.

---

### Task 3: Automated Guardrail Regression Test Suite (`guardrails.test.ts`)

**Files:**
- Create: `mcp/delegation/test/guardrails.test.ts`

**Interfaces:**
- Consumes: `assertInside` from `spawn.ts`, `delegateTask` from `spawn.ts`, `haltAndRevert` from `revert.ts`, `readMetrics` from `metrics.ts`

- [ ] **Step 1: Write `mcp/delegation/test/guardrails.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { assertInside, delegateTask } from "../src/spawn.ts";
import { haltAndRevert } from "../src/revert.ts";
import { readMetrics } from "../src/metrics.ts";
import { defaultConfig } from "../src/config.ts";

test("guardrails: assertInside blocks path traversal outside repo root", () => {
  const root = path.resolve(os.tmpdir(), "guardrail-root");
  assert.throws(
    () => assertInside(root, "../outside.txt"),
    /Path traversal denied/
  );
  assert.throws(
    () => assertInside(root, "sub/../../outside.txt"),
    /Path traversal denied/
  );
  assert.doesNotThrow(() => assertInside(root, "src/index.ts"));
});

test("guardrails: delegateTask rejects unlisted agent immediately", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "guardrail-agent-"));
  const fakeClient: any = {};
  await assert.rejects(
    () => delegateTask(root, defaultConfig, fakeClient, { agent: "evil-hacker", prompt: "pwn" }),
    /Agent "evil-hacker" not in allowlist/
  );
});

test("guardrails: readMetrics handles malformed jsonl lines gracefully without throwing", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "guardrail-metrics-"));
  const logsDir = path.join(root, ".delegation", "logs");
  await fs.mkdir(logsDir, { recursive: true });
  await fs.writeFile(path.join(logsDir, "corrupted.jsonl"), "NOT_JSON\n{broken\n");
  const summary = await readMetrics(root);
  assert.equal(summary.total_sessions, 0);
});
```

- [ ] **Step 2: Run guardrail tests**

Run: `node --test mcp/delegation/test/guardrails.test.ts`
Expected: PASS (3/3 tests pass)

---

### Task 4: Add `junior-dev` Agent & Update Config (`opencode.json`, `DELEGATE_CONFIG.json`, `config.ts`)

**Files:**
- Create: `.opencode/agent/junior-dev.md`
- Modify: `DELEGATE_CONFIG.json`
- Modify: `mcp/delegation/src/config.ts`
- Modify: `opencode.json`

- [ ] **Step 1: Create `.opencode/agent/junior-dev.md`**

```markdown
---
description: Leaf implementation worker for scoped, well-scaffolded boilerplate and helpers. Never commits.
mode: subagent
---

You are the junior developer agent. You implement strictly bounded code tasks delegated by senior-dev.

## Rules
1. Implement exactly what the prompt and scaffold request. Do not redesign interfaces.
2. Run test runners to verify changes (`npm test`, `node --test`).
3. You NEVER commit, stage, or push git changes. Leave the working tree dirty for review.
4. End your final turn with a `### HANDOFF` block:
   - status: done | blocked | needs-input
   - summary: 1-3 sentences describing what was created or modified
   - artifacts: list of modified file paths
   - next: recommended next step
```

- [ ] **Step 2: Update `DELEGATE_CONFIG.json` and `mcp/delegation/src/config.ts`**
Add `"junior-dev"` to `allowedAgents`.

- [ ] **Step 3: Update `opencode.json`**
Add `junior-dev` subagent permissions (edit `src/**`/`tests/**`, safe read-only bash, `ctx_*` denied, `delegation_*` denied). Add `mentorship` to `senior-dev` permissions and `guardrail-audit` to `challenger` permissions.

- [ ] **Step 4: Verify agent discovery**
Verify `junior-dev` is loaded via `opencode agent list`.

---

### Task 5: Add 2 New Superskills (`mentorship`, `guardrail-audit`) + Update `security-hardening`

**Files:**
- Create: `.opencode/skills/mentorship/SKILL.md`
- Create: `.opencode/skills/guardrail-audit/SKILL.md`
- Modify: `.opencode/skills/security-hardening/SKILL.md`

- [ ] **Step 1: Create `.opencode/skills/mentorship/SKILL.md`**
- [ ] **Step 2: Create `.opencode/skills/guardrail-audit/SKILL.md`**
- [ ] **Step 3: Update `.opencode/skills/security-hardening/SKILL.md`** for Semgrep SAST tier + static fallback rules.
- [ ] **Step 4: Verify 38 skill directory and frontmatter names match**

---

### Task 6: Final Verification & Whole Suite Pass

- [ ] **Step 1: Run complete MCP test suite**

Run: `npm --prefix mcp/delegation test`
Expected: 100% tests pass (all suites green).

- [ ] **Step 2: Inspect git status**

Ensure clean working tree and properly structured commits.
