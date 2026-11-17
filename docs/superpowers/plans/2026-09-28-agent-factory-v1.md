# Agent Factory v1 (Walking Skeleton) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hierarchical opencode "software factory": a delegation MCP engine that spawns true nested child agents against a warm `opencode serve` instance, plus 4 role agents and 11 superskills, proven by one end-to-end acceptance task.

**Architecture:** Approach A — the MCP (`mcp/delegation/`) owns mechanics only (spawn a child, run the board, report status) and makes no workflow decisions. The `orchestrator` is a native opencode `primary` agent (the LLM brain). Cross-tier hops go through the MCP; same-tier hops may use opencode's native Task tool. Agents are `.opencode/agent/*.md`; superskills are `.opencode/skills/*/SKILL.md`. Children stream full transcripts to gitignored `.delegation/logs/`; only the `### HANDOFF` block + `diff_stat` + changed files return to the parent.

**Tech Stack:** opencode 1.18.30 (harness) · Node v24.17.0 native TypeScript (`node file.ts`, no build) · `node --test` · `@modelcontextprotocol/sdk` 1.30.1 · `zod` · `opencode serve` HTTP API · Git 2.54 · win32.

**Spec:** `docs/superpowers/specs/2026-09-28-agent-factory-design.md`

## Global Constraints

- **Runtime:** Node v24.17.0. Run TypeScript directly with `node file.ts` — **no compile step**. Every **relative import MUST include the `.ts` extension** (`import { x } from "./git.ts"`).
- **Tests:** `node --test` (auto-discovers `*.test.ts`). Use `node:test` + `node:assert/strict`. A test run exits nonzero on failure.
- **No CLI-per-task spawning.** The engine is an **HTTP client of a warm `opencode serve`**. Prompts travel in the JSON request body (Windows `CreateProcessW` 32,767-char / `cmd.exe` 8,191-char limits must never apply).
- **`opencode serve` message POST is long-blocking** (~32 s observed for a trivial reply). Default `timeouts.messageMs` ≥ `600000`. `timeouts.healthMs` = `5000`.
- **Abort** endpoint is `POST /session/{sessionID}/abort`.
- **Message response** is `{info, parts}`; the HANDOFF text lives in a `parts[]` entry with `type === "text"`. Session id field is `id`.
- **MCP tools are namespaced** `delegation_<tool>` (server name `delegation`). Per-agent gating is done in `opencode.json` `agent.<name>.permission` with keys like `"delegation_*": "deny"`.
- **Path safety:** `dir` must resolve inside the repo root — reject `..` escapes.
- **Agent allowlist:** children may only be one of `architect`, `senior-dev`, `qa-engineer`, `general`. No arbitrary agent injection.
- **Destructive git is denied for everyone:** no `push`, no `reset --hard`, no `rm -rf`. The human lands remote work.
- **`.gitignore` must ignore:** `node_modules/`, `vendor/`, `.delegation/logs/`, `.delegation/runs/`, `dist/`, `*.tsbuildinfo`, `.env*`, OS files.
- **BOARD.md single-writer rule:** the orchestrator is the ONLY writer of `BOARD.md`.
- **No placeholder content.** Every code block is the real thing.

---

## File Structure

| Path | Responsibility |
|---|---|
| `package.json` (root) | Root scripts: `test`, `serve`, `smoke` |
| `opencode.json` (root) | Registers MCP `delegation`; agent roster + permissions |
| `DELEGATE_CONFIG.json` (root) | Engine config consumed by the MCP |
| `mcp/delegation/package.json` | MCP package manifest (deps: SDK, zod) |
| `mcp/delegation/src/config.ts` | Load/merge `DELEGATE_CONFIG.json`; resolve repo root |
| `mcp/delegation/src/git.ts` | `statusPorcelain`, `changedSince`, `diffStat`, `headCommit` |
| `mcp/delegation/src/handoff.ts` | Parse the `### HANDOFF` block; extract text from `parts[]` |
| `mcp/delegation/src/board.ts` | Read/init/move tickets in `BOARD.md` |
| `mcp/delegation/src/http.ts` | `OpenCodeClient` (health, agents, session, message, abort) |
| `mcp/delegation/src/spawn.ts` | `delegateTask` orchestration + baseline snapshot + log write |
| `mcp/delegation/src/index.ts` | MCP server; registers the 7 tools |
| `mcp/delegation/test/*.test.ts` | Unit + integration tests for each module |
| `.opencode/agent/*.md` | orchestrator (primary), architect, senior-dev, qa-engineer |
| `.opencode/skills/*/SKILL.md` | 11 superskills |
| `scripts/smoke.mjs` | Warm server + one real delegation smoke check |

Runtime artifacts produced later by the agents (NOT hand-written here): `INTENT.md`, `CONSTRAINTS.md`, `docs/specs/*.md`, `tickets/TICKET-N.md`, `BOARD.md`.

---

### Task 1: Scaffold the MCP package + config loader

**Files:**
- Create: `mcp/delegation/package.json`
- Create: `mcp/delegation/src/config.ts`
- Create: `mcp/delegation/test/config.test.ts`
- Create: `DELEGATE_CONFIG.json`
- Modify: `package.json` (root — create if absent)
- Modify: `.gitignore`

**Interfaces:**
- Produces: `Timeouts { healthMs: number; messageMs: number }`, `DelegateConfig { engine: string; serverUrl: string; defaultModel?: string; timeouts: Timeouts; allowedAgents: string[] }`, `defaultConfig(): DelegateConfig`, `loadConfig(root: string): DelegateConfig`, `repoRoot(): string`.

- [ ] **Step 1: Write the failing test**

`mcp/delegation/test/config.test.ts`
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig, loadConfig } from "../src/config.ts";

test("defaultConfig has safe timeouts and the v1 allowlist", () => {
  const c = defaultConfig();
  assert.equal(c.engine, "opencode");
  assert.equal(c.timeouts.healthMs, 5000);
  assert.ok(c.timeouts.messageMs >= 600000);
  assert.deepEqual(c.allowedAgents.sort(), ["architect", "general", "qa-engineer", "senior-dev"]);
});

test("loadConfig merges a partial DELEGATE_CONFIG.json over defaults", () => {
  const dir = mkdtempSync(join(tmpdir(), "cfg-"));
  writeFileSync(join(dir, "DELEGATE_CONFIG.json"), JSON.stringify({ serverUrl: "http://localhost:4096" }));
  const c = loadConfig(dir);
  assert.equal(c.serverUrl, "http://localhost:4096");
  assert.equal(c.engine, "opencode");
  assert.ok(c.timeouts.messageMs >= 600000);
});

test("loadConfig falls back to defaults when the file is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "cfg-"));
  assert.equal(loadConfig(dir).serverUrl, "http://localhost:4096");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test mcp/delegation/test/config.test.ts`
Expected: FAIL — cannot find module `../src/config.ts`.

- [ ] **Step 3: Write minimal implementation**

`mcp/delegation/src/config.ts`
```ts
import { readFileSync } from "node:fs";

export interface Timeouts {
  healthMs: number;
  messageMs: number;
}

export interface DelegateConfig {
  engine: string;
  serverUrl: string;
  defaultModel?: string;
  timeouts: Timeouts;
  allowedAgents: string[];
}

export function defaultConfig(): DelegateConfig {
  return {
    engine: "opencode",
    serverUrl: "http://localhost:4096",
    timeouts: { healthMs: 5000, messageMs: 900000 },
    allowedAgents: ["architect", "senior-dev", "qa-engineer", "general"],
  };
}

export function repoRoot(): string {
  return process.env.DELEGATION_ROOT ?? process.cwd();
}

export function loadConfig(root: string): DelegateConfig {
  const base = defaultConfig();
  const path = `${root}/DELEGATE_CONFIG.json`;
  let raw: Partial<DelegateConfig> = {};
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return base;
  }
  return {
    ...base,
    ...raw,
    timeouts: { ...base.timeouts, ...(raw.timeouts ?? {}) },
    allowedAgents: raw.allowedAgents ?? base.allowedAgents,
  };
}
```

`mcp/delegation/package.json`
```json
{
  "name": "@let-me-code/delegation",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/index.ts",
    "test": "node --test"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.30.1",
    "zod": "^3.23.8"
  }
}
```

`DELEGATE_CONFIG.json`
```json
{
  "engine": "opencode",
  "serverUrl": "http://localhost:4096",
  "timeouts": { "healthMs": 5000, "messageMs": 900000 }
}
```

Root `package.json`
```json
{
  "name": "let-me-code",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "npm --prefix mcp/delegation test",
    "serve": "opencode serve --port 4096",
    "smoke": "node scripts/smoke.mjs"
  }
}
```

`.gitignore` — ensure these lines exist (append if missing):
```
node_modules/
vendor/
.delegation/logs/
.delegation/runs/
dist/
*.tsbuildinfo
.env*
.DS_Store
Thumbs.db
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test mcp/delegation/test/config.test.ts`
Expected: PASS (3 tests, `ℹ pass 3`).

- [ ] **Step 5: Commit**

```bash
git add mcp/delegation/package.json mcp/delegation/src/config.ts mcp/delegation/test/config.test.ts DELEGATE_CONFIG.json package.json .gitignore
git commit -m "feat(delegation): scaffold MCP package and config loader"
```

---

### Task 2: Git helpers (baseline snapshotting)

**Files:**
- Create: `mcp/delegation/src/git.ts`
- Create: `mcp/delegation/test/git.test.ts`

**Interfaces:**
- Produces: `run(cmd: string, args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }>`, `statusPorcelain(root: string): Promise<string>`, `changedSince(root: string, baseline: string): Promise<string[]>`, `diffStat(root: string): Promise<string>`, `headCommit(root: string): Promise<string>`.

- [ ] **Step 1: Write the failing test**

`mcp/delegation/test/git.test.ts`
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changedSince, diffStat, headCommit, statusPorcelain } from "../src/git.ts";

function freshRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "git-"));
  execFileSync("git", ["init"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  writeFileSync(join(dir, "a.txt"), "one\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

test("changedSince returns only files changed after the baseline", async () => {
  const dir = freshRepo();
  const baseline = await statusPorcelain(dir);
  writeFileSync(join(dir, "b.txt"), "new\n");
  appendFileSync(join(dir, "a.txt"), "more\n");
  const changed = (await changedSince(dir, baseline)).sort();
  assert.deepEqual(changed, ["a.txt", "b.txt"]);
});

test("changedSince ignores files already dirty in the baseline", async () => {
  const dir = freshRepo();
  writeFileSync(join(dir, "stale.txt"), "leftover\n");
  const baseline = await statusPorcelain(dir);
  writeFileSync(join(dir, "fresh.txt"), "new\n");
  assert.deepEqual(await changedSince(dir, baseline), ["fresh.txt"]);
});

test("diffStat summarizes the working tree against HEAD", async () => {
  const dir = freshRepo();
  writeFileSync(join(dir, "b.txt"), "x\n");
  assert.match(await diffStat(dir), /b\.txt/);
});

test("headCommit returns a 40-char sha", async () => {
  const dir = freshRepo();
  assert.match(await headCommit(dir), /^[0-9a-f]{40}$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test mcp/delegation/test/git.test.ts`
Expected: FAIL — cannot find module `../src/git.ts`.

- [ ] **Step 3: Write minimal implementation**

`mcp/delegation/src/git.ts`
```ts
import { execFile } from "node:child_process";

export function run(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err && typeof (err as { code?: number }).code === "number" ? (err as { code: number }).code : err ? 1 : 0;
      resolve({ code, stdout: stdout.toString(), stderr: stderr.toString() });
    });
  });
}

export async function statusPorcelain(root: string): Promise<string> {
  const { stdout } = await run("git", ["status", "--porcelain"], root);
  return stdout;
}

function fileOf(line: string): string | null {
  const m = line.match(/^(?:.{2})\s+(.*)$/);
  if (!m) return null;
  let p = m[1].trim();
  if (p.includes(" -> ")) p = p.split(" -> ").pop() as string;
  return p.replace(/^"|"$/g, "");
}

export async function changedSince(root: string, baseline: string): Promise<string[]> {
  const before = new Set(baseline.split(/\r?\n/).filter(Boolean));
  const after = (await statusPorcelain(root)).split(/\r?\n/).filter(Boolean);
  const out: string[] = [];
  for (const line of after) {
    if (before.has(line)) continue;
    const f = fileOf(line);
    if (f) out.push(f);
  }
  return out;
}

export async function diffStat(root: string): Promise<string> {
  const tracked = await run("git", ["diff", "--stat", "HEAD"], root);
  const untracked = await run("git", ["ls-files", "--others", "--exclude-standard"], root);
  const extra = untracked.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((f) => ` ${f} (new)`)
    .join("\n");
  return [tracked.stdout.trim(), extra].filter(Boolean).join("\n");
}

export async function headCommit(root: string): Promise<string> {
  const { stdout } = await run("git", ["rev-parse", "HEAD"], root);
  return stdout.trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test mcp/delegation/test/git.test.ts`
Expected: PASS (`ℹ pass 4`).

- [ ] **Step 5: Commit**

```bash
git add mcp/delegation/src/git.ts mcp/delegation/test/git.test.ts
git commit -m "feat(delegation): add git baseline and diff helpers"
```

---

### Task 3: HANDOFF parser + message text extraction

**Files:**
- Create: `mcp/delegation/src/handoff.ts`
- Create: `mcp/delegation/test/handoff.test.ts`

**Interfaces:**
- Produces: `Handoff { status: "done" | "blocked" | "needs-input"; summary: string; artifacts: string; next: string }`, `parseHandoff(text: string): Handoff | null`, `extractText(parts: Array<{ type: string; text?: string }>): string`.

- [ ] **Step 1: Write the failing test**

`mcp/delegation/test/handoff.test.ts`
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHandoff, extractText } from "../src/handoff.ts";

const GOOD = `Did the work.

### HANDOFF
status: done
summary: Added the --version flag and a passing test.
artifacts: mcp/delegation/src/index.ts, mcp/delegation/test/version.test.ts
next: Hand off to qa-engineer for review.
`;

test("parseHandoff extracts all four fields", () => {
  const h = parseHandoff(GOOD);
  assert.equal(h?.status, "done");
  assert.match(h!.summary, /--version/);
  assert.match(h!.artifacts, /version\.test\.ts/);
  assert.match(h!.next, /qa-engineer/);
});

test("parseHandoff accepts blocked and needs-input statuses", () => {
  const b = GOOD.replace("status: done", "status: blocked");
  assert.equal(parseHandoff(b)?.status, "blocked");
  const n = GOOD.replace("status: done", "status: needs-input");
  assert.equal(parseHandoff(n)?.status, "needs-input");
});

test("parseHandoff returns null when the block is absent", () => {
  assert.equal(parseHandoff("just some chat with no terminator"), null);
});

test("parseHandoff rejects an unknown status", () => {
  assert.equal(parseHandoff(GOOD.replace("status: done", "status: maybe")), null);
});

test("extractText concatenates only text parts", () => {
  const parts = [
    { type: "step-start" },
    { type: "reasoning", text: "ignore me" },
    { type: "text", text: "hello " },
    { type: "text", text: "world" },
  ];
  assert.equal(extractText(parts), "hello world");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test mcp/delegation/test/handoff.test.ts`
Expected: FAIL — cannot find module `../src/handoff.ts`.

- [ ] **Step 3: Write minimal implementation**

`mcp/delegation/src/handoff.ts`
```ts
export type HandoffStatus = "done" | "blocked" | "needs-input";

export interface Handoff {
  status: HandoffStatus;
  summary: string;
  artifacts: string;
  next: string;
}

const STATUSES: HandoffStatus[] = ["done", "blocked", "needs-input"];

export function parseHandoff(text: string): Handoff | null {
  const idx = text.indexOf("### HANDOFF");
  if (idx === -1) return null;
  const block = text.slice(idx + "### HANDOFF".length);
  const field = (name: string): string => {
    const re = new RegExp(`^\\s*${name}\\s*:\\s*(.*)$`, "im");
    const m = block.match(re);
    return m ? m[1].trim() : "";
  };
  const status = field("status").toLowerCase() as HandoffStatus;
  if (!STATUSES.includes(status)) return null;
  return {
    status,
    summary: field("summary"),
    artifacts: field("artifacts"),
    next: field("next"),
  };
}

export function extractText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test mcp/delegation/test/handoff.test.ts`
Expected: PASS (`ℹ pass 5`).

- [ ] **Step 5: Commit**

```bash
git add mcp/delegation/src/handoff.ts mcp/delegation/test/handoff.test.ts
git commit -m "feat(delegation): parse HANDOFF blocks and child text parts"
```

---

### Task 4: BOARD.md read / init / move

**Files:**
- Create: `mcp/delegation/src/board.ts`
- Create: `mcp/delegation/test/board.test.ts`

**Interfaces:**
- Produces: `Column = "Todo" | "In Progress" | "In Review" | "Blocked" | "Done"`, `BoardRow { ticket: string; title: string; extra: string[] }`, `BoardState { todo: BoardRow[]; inProgress: BoardRow[]; inReview: BoardRow[]; blocked: BoardRow[]; done: BoardRow[] }`, `readBoard(root: string): Promise<BoardState>`, `initBoard(root: string, feature: string): Promise<void>`, `moveTicket(root: string, ticket: string, column: Column, note?: string): Promise<BoardState>`.

- [ ] **Step 1: Write the failing test**

`mcp/delegation/test/board.test.ts`
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initBoard, moveTicket, readBoard } from "../src/board.ts";

const HEADERS: Record<string, string> = {
  "## Todo": "| Ticket | Title | Depends on |",
  "## In Progress": "| Ticket | Title | Owner | Started |",
  "## In Review": "| Ticket | Title | Reviewer |",
  "## Blocked": "| Ticket | Title | Reason | Since |",
  "## Done": "| Ticket | Title | Commit |",
};

function board(runs: string): string {
  return `# BOARD — demo\n\n${runs}\n`;
}

function seed(dir: string, body: string) {
  const out = ["# BOARD — demo", ""];
  for (const [header, cols] of Object.entries(HEADERS)) {
    out.push(header, cols, "| --- | --- | --- |", body.includes(`@${header}`) ? "" : "");
  }
  writeFileSync(join(dir, "BOARD.md"), out.join("\n"));
}

test("initBoard writes all five columns and is idempotent", async () => {
  const dir = mkdtempSync(join(tmpdir(), "board-"));
  await initBoard(dir, "demo");
  await initBoard(dir, "demo");
  const text = readFileSync(join(dir, "BOARD.md"), "utf8");
  for (const header of Object.keys(HEADERS)) assert.ok(text.includes(header), header);
});

test("moveTicket places a ticket in the target column and removes it from others", async () => {
  const dir = mkdtempSync(join(tmpdir(), "board-"));
  await initBoard(dir, "demo");
  writeFileSync(join(dir, "BOARD.md"), readFileSync(join(dir, "BOARD.md"), "utf8")
    .replace("| --- | --- | --- |\n## In Progress", "| TICKET-1 | version flag |  |\n| --- | --- | --- |\n## In Progress"));
  const after = await moveTicket(dir, "TICKET-1", "In Review", "qa-engineer");
  assert.equal(after.todo.length, 0);
  assert.equal(after.inReview.length, 1);
  assert.equal(after.inReview[0].ticket, "TICKET-1");
});

test("readBoard returns empty arrays for an all-empty board", async () => {
  const dir = mkdtempSync(join(tmpdir(), "board-"));
  await initBoard(dir, "demo");
  const b = await readBoard(dir);
  assert.deepEqual([b.todo, b.inProgress, b.inReview, b.blocked, b.done], [[], [], [], [], []]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test mcp/delegation/test/board.test.ts`
Expected: FAIL — cannot find module `../src/board.ts`.

- [ ] **Step 3: Write minimal implementation**

`mcp/delegation/src/board.ts`
```ts
import { readFile, writeFile } from "node:fs/promises";

export type Column = "Todo" | "In Progress" | "In Review" | "Blocked" | "Done";

export interface BoardRow {
  ticket: string;
  title: string;
  extra: string[];
}

export interface BoardState {
  todo: BoardRow[];
  inProgress: BoardRow[];
  inReview: BoardRow[];
  blocked: BoardRow[];
  done: BoardRow[];
}

const ORDER: Column[] = ["Todo", "In Progress", "In Review", "Blocked", "Done"];

const HEADER: Record<Column, string> = {
  Todo: "| Ticket | Title | Depends on |",
  "In Progress": "| Ticket | Title | Owner | Started |",
  "In Review": "| Ticket | Title | Reviewer |",
  Blocked: "| Ticket | Title | Reason | Since |",
  Done: "| Ticket | Title | Commit |",
};

const SEP = "| --- | --- | --- |";

export function boardPath(root: string): string {
  return `${root}/BOARD.md`;
}

export function renderBoard(feature: string, rows: Record<Column, BoardRow[]>): string {
  const out: string[] = [`# BOARD — ${feature}`, ""];
  for (const col of ORDER) {
    out.push(`## ${col}`, HEADER[col], SEP);
    for (const r of rows[col]) out.push(`| ${r.ticket} | ${r.title} | ${r.extra.join(" | ")} |`);
    out.push("");
  }
  return out.join("\n");
}

export async function initBoard(root: string, feature: string): Promise<void> {
  const empty: Record<Column, BoardRow[]> = {
    Todo: [], "In Progress": [], "In Review": [], Blocked: [], Done: [],
  };
  try {
    await readFile(boardPath(root), "utf8");
    return;
  } catch {
    await writeFile(boardPath(root), renderBoard(feature, empty), "utf8");
  }
}

function parseCells(line: string): string[] {
  return line.split("|").slice(1, -1).map((c) => c.trim());
}

export async function readBoard(root: string): Promise<BoardState> {
  const text = await readFile(boardPath(root), "utf8");
  const lines = text.split(/\r?\n/);
  const state: BoardState = { todo: [], inProgress: [], inReview: [], blocked: [], done: [] };
  const key: Record<Column, keyof BoardState> = {
    Todo: "todo", "In Progress": "inProgress", "In Review": "inReview", Blocked: "blocked", Done: "done",
  };
  let current: Column | null = null;
  let skipSep = false;
  for (const line of lines) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      const col = h[1] as Column;
      current = ORDER.includes(col) ? col : null;
      skipSep = true;
      continue;
    }
    if (!current || !line.trim().startsWith("|")) continue;
    if (skipSep) { skipSep = false; continue; } // header row
    if (line.includes("---")) continue;          // separator row
    const cells = parseCells(line);
    if (!cells[0]) continue;
    state[key[current]].push({ ticket: cells[0], title: cells[1] ?? "", extra: cells.slice(2) });
  }
  return state;
}

export async function moveTicket(root: string, ticket: string, column: Column, note?: string): Promise<BoardState> {
  const state = await readBoard(root);
  const rows: Record<Column, BoardRow[]> = {
    Todo: state.todo, "In Progress": state.inProgress, "In Review": state.inReview,
    Blocked: state.blocked, Done: state.done,
  };
  let found: BoardRow | undefined;
  for (const col of ORDER) {
    const i = rows[col].findIndex((r) => r.ticket === ticket);
    if (i !== -1) { found = rows[col].splice(i, 1)[0]; break; }
  }
  const row: BoardRow = found ?? { ticket, title: "", extra: [] };
  if (note !== undefined) row.extra = [note];
  rows[column].push(row);
  const feature = (await readFile(boardPath(root), "utf8")).match(/^# BOARD — (.*)$/m)?.[1] ?? "feature";
  await writeFile(boardPath(root), renderBoard(feature, rows), "utf8");
  return readBoard(root);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test mcp/delegation/test/board.test.ts`
Expected: PASS (`ℹ pass 3`).

- [ ] **Step 5: Commit**

```bash
git add mcp/delegation/src/board.ts mcp/delegation/test/board.test.ts
git commit -m "feat(delegation): read, init, and move BOARD.md tickets"
```

---

### Task 5: `OpenCodeClient` HTTP client

**Files:**
- Create: `mcp/delegation/src/http.ts`
- Create: `mcp/delegation/test/http.test.ts`

**Interfaces:**
- Produces: `ChatPart { type: string; text?: string }`, `MessageResult { info: unknown; parts: ChatPart[] }`, `authHeaders(): Record<string, string>`, `class OpenCodeClient { constructor(cfg: DelegateConfig, fetchImpl?: typeof fetch); health(): Promise<{ healthy: boolean; version?: string }>; agents(): Promise<Array<{ name: string }>>; createSession(title: string): Promise<string>; postMessage(id: string, body: { agent: string; model?: string; parts: ChatPart[] }): Promise<MessageResult>; abort(id: string): Promise<{ aborted: boolean }> }`.
- Consumes: `DelegateConfig` from Task 1.

- [ ] **Step 1: Write the failing test**

`mcp/delegation/test/http.test.ts`
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { defaultConfig } from "../src/config.ts";
import { OpenCodeClient } from "../src/http.ts";

async function withServer(
  handler: (url: string, body: string) => { status?: number; json: unknown },
  fn: (url: string) => Promise<void>,
) {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const { status = 200, json } = handler(req.url ?? "", body);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try { await fn(`http://127.0.0.1:${port}`); } finally { server.close(); }
}

test("health GETs /global/health", async () => {
  await withServer((url) => {
    assert.equal(url, "/global/health");
    return { json: { healthy: true, version: "1.18.30" } };
  }, async (url) => {
    const c = new OpenCodeClient({ ...defaultConfig(), serverUrl: url });
    assert.deepEqual(await c.health(), { healthy: true, version: "1.18.30" });
  });
});

test("agents GETs /agent and returns the array", async () => {
  await withServer((url) => {
    assert.equal(url, "/agent");
    return { json: [{ name: "architect" }, { name: "general" }] };
  }, async (url) => {
    const c = new OpenCodeClient({ ...defaultConfig(), serverUrl: url });
    assert.equal((await c.agents()).length, 2);
  });
});

test("createSession POSTs /session and returns info.id", async () => {
  await withServer((url, body) => {
    assert.equal(url, "/session");
    assert.match(body, /job/);
    return { json: { id: "ses_abc" } };
  }, async (url) => {
    const c = new OpenCodeClient({ ...defaultConfig(), serverUrl: url });
    assert.equal(await c.createSession("job"), "ses_abc");
  });
});

test("postMessage POSTs to /session/:id/message and returns parts", async () => {
  await withServer((url, body) => {
    assert.equal(url, "/session/ses_abc/message");
    assert.match(body, /architect/);
    return { json: { info: { id: "m1" }, parts: [{ type: "text", text: "hi" }] } };
  }, async (url) => {
    const c = new OpenCodeClient({ ...defaultConfig(), serverUrl: url });
    const r = await c.postMessage("ses_abc", { agent: "architect", parts: [{ type: "text", text: "hi" }] });
    assert.equal(r.parts[0].text, "hi");
  });
});

test("abort POSTs to /session/:id/abort", async () => {
  await withServer((url) => {
    assert.equal(url, "/session/ses_abc/abort");
    return { json: { aborted: true } };
  }, async (url) => {
    const c = new OpenCodeClient({ ...defaultConfig(), serverUrl: url });
    assert.equal((await c.abort("ses_abc")).aborted, true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test mcp/delegation/test/http.test.ts`
Expected: FAIL — cannot find module `../src/http.ts`.

- [ ] **Step 3: Write minimal implementation**

`mcp/delegation/src/http.ts`
```ts
import type { DelegateConfig } from "./config.ts";

export interface ChatPart {
  type: string;
  text?: string;
}

export interface MessageResult {
  info: unknown;
  parts: ChatPart[];
}

export function authHeaders(): Record<string, string> {
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  if (!password) return {};
  const user = process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
  const token = Buffer.from(`${user}:${password}`).toString("base64");
  return { authorization: `Basic ${token}` };
}

export class OpenCodeClient {
  private base: string;
  private fetchImpl: typeof fetch;
  private cfg: DelegateConfig;

  constructor(cfg: DelegateConfig, fetchImpl?: typeof fetch) {
    this.cfg = cfg;
    this.base = cfg.serverUrl.replace(/\/$/, "");
    this.fetchImpl = fetchImpl ?? fetch;
  }

  private async request<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T> {
    const controller = new AbortController();
    const ms = timeoutMs ?? this.cfg.timeouts.messageMs;
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const res = await this.fetchImpl(`${this.base}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { "content-type": "application/json", ...authHeaders(), ...(init?.headers ?? {}) },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  health(): Promise<{ healthy: boolean; version?: string }> {
    return this.request("/global/health", { method: "GET" }, this.cfg.timeouts.healthMs);
  }

  agents(): Promise<Array<{ name: string }>> {
    return this.request("/agent", { method: "GET" }, this.cfg.timeouts.healthMs);
  }

  async createSession(title: string): Promise<string> {
    const r = await this.request<{ id: string }>("/session", {
      method: "POST",
      body: JSON.stringify({ title }),
    });
    return r.id;
  }

  postMessage(
    id: string,
    body: { agent: string; model?: string; parts: ChatPart[] },
  ): Promise<MessageResult> {
    return this.request<MessageResult>(`/session/${id}/message`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  abort(id: string): Promise<{ aborted: boolean }> {
    return this.request(`/session/${id}/abort`, { method: "POST" });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test mcp/delegation/test/http.test.ts`
Expected: PASS (`ℹ pass 5`).

- [ ] **Step 5: Commit**

```bash
git add mcp/delegation/src/http.ts mcp/delegation/test/http.test.ts
git commit -m "feat(delegation): add OpenCodeClient for the warm server API"
```

---

### Task 6: `delegateTask` orchestration + transcript logging

**Files:**
- Create: `mcp/delegation/src/spawn.ts`
- Create: `mcp/delegation/test/spawn.test.ts`

**Interfaces:**
- Produces: `DelegateArgs { agent: string; prompt: string; contextFiles?: string[]; model?: string; timeoutMs?: number }`, `DelegateResult { status: string; summary: string; handoff: Handoff | null; changed_files: string[]; diff_stat: string; session_id: string; log_path: string }`, `buildPrompt(prompt: string, contextFiles: string[]): string`, `writeLog(root: string, agent: string, sessionId: string, payload: unknown): Promise<string>`, `delegateTask(root: string, cfg: DelegateConfig, client: OpenCodeClient, args: DelegateArgs): Promise<DelegateResult>`.
- Consumes: Tasks 1–5.

- [ ] **Step 1: Write the failing test**

`mcp/delegation/test/spawn.test.ts`
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig } from "../src/config.ts";
import { OpenCodeClient } from "../src/http.ts";
import { buildPrompt, delegateTask, writeLog } from "../src/spawn.ts";

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "spawn-"));
  execFileSync("git", ["init"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  writeFileSync(join(dir, "seed.txt"), "x\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

function fakeClient(reply: string, onMessage?: (body: string) => void): OpenCodeClient {
  const impl = (async (url: string, init?: RequestInit) => {
    const body = (init?.body as string) ?? "";
    if (onMessage && String(url).endsWith("/message")) onMessage(body);
    if (String(url).endsWith("/session")) return json({ id: "ses_1" });
    if (String(url).endsWith("/message"))
      return json({ info: { id: "m1" }, parts: [{ type: "text", text: reply }] });
    return json({});
  }) as unknown as typeof fetch;
  return new OpenCodeClient(defaultConfig(), impl);
}

function json(o: unknown): Response {
  return new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
}

test("buildPrompt appends a HANDOFF instruction and context file list", () => {
  const p = buildPrompt("do a thing", ["a.md", "b.md"]);
  assert.match(p, /do a thing/);
  assert.match(p, /a\.md/);
  assert.match(p, /### HANDOFF/);
});

test("delegateTask rejects agents outside the allowlist", async () => {
  const dir = repo();
  await assert.rejects(
    delegateTask(dir, defaultConfig(), fakeClient("x"), { agent: "evil", prompt: "x" }),
    /allowlist/,
  );
});

test("delegateTask returns handoff, changed files, and writes a log", async () => {
  const dir = repo();
  const reply = "ok\n### HANDOFF\nstatus: done\nsummary: did it\nartifacts: a.ts\nnext: review\n";
  const result = await delegateTask(dir, defaultConfig(), fakeClient(reply, () => {
    writeFileSync(join(dir, "made.txt"), "new\n");
  }), { agent: "architect", prompt: "spec it" });
  assert.equal(result.status, "done");
  assert.equal(result.handoff?.summary, "did it");
  assert.deepEqual(result.changed_files, ["made.txt"]);
  assert.equal(result.session_id, "ses_1");
  assert.ok(existsSync(result.log_path));
});

test("delegateTask reports no-handoff replies as needs-input", async () => {
  const dir = repo();
  const result = await delegateTask(dir, defaultConfig(), fakeClient("no terminator here"), {
    agent: "architect", prompt: "x",
  });
  assert.equal(result.status, "needs-input");
  assert.equal(result.handoff, null);
});

test("writeLog nests under .delegation/logs and returns the path", async () => {
  const dir = repo();
  const p = await writeLog(dir, "architect", "ses_1", { hello: "world" });
  assert.match(p, /\.delegation[\\/]logs[\\/]/);
  assert.ok(existsSync(p));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test mcp/delegation/test/spawn.test.ts`
Expected: FAIL — cannot find module `../src/spawn.ts`.

- [ ] **Step 3: Write minimal implementation**

`mcp/delegation/src/spawn.ts`
```ts
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DelegateConfig } from "./config.ts";
import { changedSince, diffStat, statusPorcelain } from "./git.ts";
import { extractText, parseHandoff, type Handoff } from "./handoff.ts";
import type { OpenCodeClient } from "./http.ts";

export interface DelegateArgs {
  agent: string;
  prompt: string;
  contextFiles?: string[];
  model?: string;
  timeoutMs?: number;
}

export interface DelegateResult {
  status: string;
  summary: string;
  handoff: Handoff | null;
  changed_files: string[];
  diff_stat: string;
  session_id: string;
  log_path: string;
}

const HANDOFF_INSTRUCTION = [
  "",
  "When you have finished, you MUST end your reply with exactly this block:",
  "### HANDOFF",
  "status: done | blocked | needs-input",
  "summary: <one paragraph>",
  "artifacts: <paths created/modified>",
  "next: <what the orchestrator should do>",
].join("\n");

export function buildPrompt(prompt: string, contextFiles: string[]): string {
  const ctx = contextFiles.length
    ? `\n\nRead these context files first: ${contextFiles.join(", ")}`
    : "";
  return `${prompt}${ctx}${HANDOFF_INSTRUCTION}`;
}

function assertInside(root: string, target: string): string {
  const absRoot = resolve(root);
  const abs = resolve(absRoot, target);
  if (abs !== absRoot && !abs.startsWith(absRoot + "\\") && !abs.startsWith(absRoot + "/")) {
    throw new Error(`path escapes repo root: ${target}`);
  }
  return abs;
}

export async function writeLog(
  root: string,
  agent: string,
  sessionId: string,
  payload: unknown,
): Promise<string> {
  const dir = assertInside(root, ".delegation/logs");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${dir}/${stamp}-${agent}-${sessionId}.jsonl`;
  await writeFile(path, JSON.stringify(payload) + "\n", "utf8");
  return path;
}

export async function delegateTask(
  root: string,
  cfg: DelegateConfig,
  client: OpenCodeClient,
  args: DelegateArgs,
): Promise<DelegateResult> {
  if (!cfg.allowedAgents.includes(args.agent)) {
    throw new Error(`agent "${args.agent}" is not on the allowlist (${cfg.allowedAgents.join(", ")})`);
  }

  const baseline = await statusPorcelain(root);
  const sessionId = await client.createSession(`job:${args.agent}`);
  const prompt = buildPrompt(args.prompt, args.contextFiles ?? []);
  const model = args.model ?? cfg.defaultModel;

  const result = await client.postMessage(sessionId, {
    agent: args.agent,
    model,
    parts: [{ type: "text", text: prompt }],
  });

  const text = extractText(result.parts);
  const handoff = parseHandoff(text);
  const changed = await changedSince(root, baseline);
  const stat = await diffStat(root);
  const logPath = await writeLog(root, args.agent, sessionId, { args, baseline, result });

  return {
    status: handoff?.status ?? "needs-input",
    summary: handoff?.summary ?? text.slice(-2000),
    handoff,
    changed_files: changed,
    diff_stat: stat,
    session_id: sessionId,
    log_path: logPath,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test mcp/delegation/test/spawn.test.ts`
Expected: PASS (`ℹ pass 5`).

- [ ] **Step 5: Commit**

```bash
git add mcp/delegation/src/spawn.ts mcp/delegation/test/spawn.test.ts
git commit -m "feat(delegation): orchestrate child runs with baseline and logging"
```

---

### Task 7: MCP server + 7 tools

**Files:**
- Create: `mcp/delegation/src/index.ts`
- Create: `mcp/delegation/test/tools.test.ts`

**Interfaces:**
- Produces: `TOOLS` registration on an `McpServer`; exported `createServer(root?: string): McpServer` and `listToolNames(): string[]`. Tools: `delegate_task`, `engine_status`, `engine_abort`, `board_read`, `board_update`, `ticket_write`, `ticket_read`.
- Consumes: Tasks 1–6.

- [ ] **Step 1: Write the failing test**

`mcp/delegation/test/tools.test.ts`
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, listToolNames } from "../src/index.ts";

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "tools-"));
  execFileSync("git", ["init"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  writeFileSync(join(dir, "seed.txt"), "x\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

test("the server registers exactly the seven v1 tools", () => {
  assert.deepEqual(listToolNames().sort(), [
    "board_read", "board_update", "delegate_task", "engine_abort", "engine_status",
    "ticket_read", "ticket_write",
  ]);
});

test("ticket_write then ticket_read round-trips through the MCP client", async () => {
  const dir = repo();
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = createServer(dir);
  await server.connect(serverT);
  const client = new Client({ name: "t", version: "0" });
  await client.connect(clientT);

  await client.callTool({ name: "ticket_write", arguments: { id: "TICKET-1", title: "version flag", body: "add it" } });
  const read = await client.callTool({ name: "ticket_read", arguments: { id: "TICKET-1" } });
  const text = (read.content as Array<{ type: string; text: string }>)[0].text;
  assert.match(text, /version flag/);

  const board = await client.callTool({ name: "board_read", arguments: {} });
  assert.ok((board.content as Array<{ text: string }>)[0].text.includes("todo"));
});

test("board_update moves a ticket's column", async () => {
  const dir = repo();
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await createServer(dir).connect(serverT);
  const client = new Client({ name: "t", version: "0" });
  await client.connect(clientT);
  await client.callTool({ name: "ticket_write", arguments: { id: "TICKET-1", title: "x", body: "y" } });
  const r = await client.callTool({ name: "board_update", arguments: { ticket: "TICKET-1", column: "In Progress" } });
  assert.match((r.content as Array<{ text: string }>)[0].text, /inProgress/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test mcp/delegation/test/tools.test.ts`
Expected: FAIL — cannot find module `../src/index.ts`.

- [ ] **Step 3: Write minimal implementation**

`mcp/delegation/src/index.ts`
```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { initBoard, moveTicket, readBoard, type Column } from "./board.ts";
import { loadConfig, repoRoot } from "./config.ts";
import { OpenCodeClient } from "./http.ts";
import { delegateTask } from "./spawn.ts";

const TOOL_NAMES = [
  "delegate_task", "engine_status", "engine_abort",
  "board_read", "board_update", "ticket_write", "ticket_read",
] as const;

export function listToolNames(): string[] {
  return [...TOOL_NAMES];
}

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function fail(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

const ticketsDir = (root: string) => `${root}/tickets`;

export function createServer(root: string = repoRoot()): McpServer {
  const server = new McpServer({ name: "delegation", version: "0.1.0" });
  const cfg = loadConfig(root);
  const client = new OpenCodeClient(cfg);

  server.registerTool(
    "delegate_task",
    {
      description: "Spawn a child agent on the warm opencode server and return only its HANDOFF, diff stat, and changed files.",
      inputSchema: {
        agent: z.string(),
        prompt: z.string(),
        contextFiles: z.array(z.string()).optional(),
        model: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const r = await delegateTask(root, cfg, client, {
          agent: args.agent, prompt: args.prompt, contextFiles: args.contextFiles, model: args.model,
        });
        return ok(JSON.stringify(r, null, 2));
      } catch (e) {
        return fail(`delegate_task failed: ${(e as Error).message}`);
      }
    },
  );

  server.registerTool(
    "engine_status",
    { description: "Report engine liveness, version, agent roster, and config.", inputSchema: {} },
    async () => {
      try {
        const health = await client.health();
        const agents = await client.agents();
        return ok(JSON.stringify({
          server_up: health.healthy, version: health.version,
          agent_roster: agents.map((a) => a.name), serverUrl: cfg.serverUrl,
          allowedAgents: cfg.allowedAgents,
        }, null, 2));
      } catch (e) {
        return ok(JSON.stringify({ server_up: false, error: (e as Error).message, serverUrl: cfg.serverUrl }, null, 2));
      }
    },
  );

  server.registerTool(
    "engine_abort",
    { description: "Abort an in-flight child session.", inputSchema: { session_id: z.string() } },
    async (args) => {
      try {
        const r = await client.abort(args.session_id);
        return ok(JSON.stringify(r));
      } catch (e) {
        return fail(`engine_abort failed: ${(e as Error).message}`);
      }
    },
  );

  server.registerTool(
    "board_read",
    { description: "Read BOARD.md as parsed JSON columns.", inputSchema: {} },
    async () => {
      try {
        await initBoard(root, "feature");
        return ok(JSON.stringify(await readBoard(root), null, 2));
      } catch (e) {
        return fail(`board_read failed: ${(e as Error).message}`);
      }
    },
  );

  server.registerTool(
    "board_update",
    {
      description: "Move a ticket to a column in BOARD.md (orchestrator only).",
      inputSchema: {
        ticket: z.string(),
        column: z.enum(["Todo", "In Progress", "In Review", "Blocked", "Done"]),
        note: z.string().optional(),
      },
    },
    async (args) => {
      try {
        await initBoard(root, "feature");
        const state = await moveTicket(root, args.ticket, args.column as Column, args.note);
        return ok(JSON.stringify(state, null, 2));
      } catch (e) {
        return fail(`board_update failed: ${(e as Error).message}`);
      }
    },
  );

  server.registerTool(
    "ticket_write",
    {
      description: "Write tickets/TICKET-N.md with optional depends_on. Does NOT touch BOARD.md (orchestrator reconciles the board via board_update).",
      inputSchema: {
        id: z.string(),
        title: z.string(),
        body: z.string(),
        depends_on: z.array(z.string()).optional(),
      },
    },
    async (args) => {
      try {
        await mkdir(ticketsDir(root), { recursive: true });
        const path = `${ticketsDir(root)}/${args.id}.md`;
        const deps = (args.depends_on ?? []).join(", ");
        const text = `# ${args.id}: ${args.title}\n\n- depends_on: ${deps || "none"}\n\n${args.body}\n`;
        await writeFile(path, text, "utf8");
        return ok(path);
      } catch (e) {
        return fail(`ticket_write failed: ${(e as Error).message}`);
      }
    },
  );

  server.registerTool(
    "ticket_read",
    { description: "Read a ticket's metadata and body.", inputSchema: { id: z.string() } },
    async (args) => {
      try {
        const path = `${ticketsDir(root)}/${args.id}.md`;
        const text = await readFile(path, "utf8");
        const deps = text.match(/depends_on:\s*(.*)/)?.[1] ?? "none";
        return ok(JSON.stringify({ id: args.id, depends_on: deps, body: text }, null, 2));
      } catch (e) {
        return fail(`ticket_read failed: ${(e as Error).message}`);
      }
    },
  );

  return server;
}

async function main() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("mcp/delegation/src/index.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Install deps and run test to verify it passes**

```bash
npm --prefix mcp/delegation install
node --test mcp/delegation/test/tools.test.ts
```
Expected: PASS (`ℹ pass 3`).

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all suites pass, no failures.

- [ ] **Step 6: Commit**

```bash
git add mcp/delegation/src/index.ts mcp/delegation/test/tools.test.ts mcp/delegation/package-lock.json
git commit -m "feat(delegation): expose the seven MCP tools"
```

---

### Task 8: Register the MCP and agent permissions in `opencode.json`

**Files:**
- Create: `opencode.json`

**Interfaces:**
- Consumes: the MCP server name `delegation` (Task 7) → tools become `delegation_*`.
- Produces: the `agent` roster + `permission` matrix referenced by Tasks 9–10.

- [ ] **Step 1: Write the config**

`opencode.json`
```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "delegation": {
      "type": "local",
      "command": ["node", "mcp/delegation/src/index.ts"],
      "cwd": ".",
      "enabled": true,
      "timeout": 15000
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
        "bash": { "git status*": "allow", "git diff*": "allow", "git log*": "allow", "git checkout*": "allow", "git push*": "deny", "git reset*--hard*": "deny", "*": "ask" },
        "task": { "*": "deny" },
        "delegation_*": "allow",
        "skill": { "core-router": "allow", "intent-extractor": "allow", "state-manager": "allow", "configure-delegation": "allow", "*": "deny" }
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
        "skill": { "spec-creator": "allow", "task-breakdown": "allow", "*": "deny" }
      }
    },
    "senior-dev": {
      "mode": "subagent",
      "description": "Implements tickets in thin verifiable slices; delegates boilerplate to general; commits atomically.",
      "permission": {
        "edit": { "src/**": "allow", "tests/**": "allow", "*": "deny" },
        "bash": { "git add*": "allow", "git commit*": "allow", "git status*": "allow", "git diff*": "allow", "npm test*": "allow", "npm run*": "allow", "git push*": "deny", "git reset*--hard*": "deny", "rm -rf*": "deny", "*": "ask" },
        "task": { "*": "deny" },
        "webfetch": "allow",
        "delegation_*": "allow",
        "skill": { "core-implementer": "allow", "delegate-task": "allow", "*": "deny" }
      }
    },
    "qa-engineer": {
      "mode": "subagent",
      "description": "Combined quality gate: reviews the diff against the spec, writes and runs tests, scans for security issues.",
      "permission": {
        "edit": { "tests/**": "allow", "*": "deny" },
        "bash": { "npm test*": "allow", "node --test*": "allow", "git add*": "allow", "git commit*": "allow", "git status*": "allow", "git diff*": "allow", "git push*": "deny", "git reset*--hard*": "deny", "*": "deny" },
        "task": { "*": "deny" },
        "webfetch": "deny",
        "delegation_*": "deny",
        "skill": { "test-driven-development": "allow", "security-hardening": "allow", "code-review-and-quality": "allow", "*": "deny" }
      }
    }
  }
}
```

- [ ] **Step 2: Verify opencode accepts the config**

Run: `opencode agent list`
Expected: lists `orchestrator` (primary), `architect`, `senior-dev`, `qa-engineer`, and `general` with no schema errors. If the command is unavailable, run `opencode run --agent orchestrator "reply with the single word OK"` and confirm no config-parse error appears.

- [ ] **Step 3: Verify the MCP registers and its tool names are namespaced**

Run: `opencode run --agent orchestrator "call engine_status and print the raw result"`
Expected: output contains `delegation_engine_status` (or a `server_up` JSON payload). Confirms the MCP launched and the tool is visible.

- [ ] **Step 4: Commit**

```bash
git add opencode.json
git commit -m "feat: register delegation MCP and per-agent permission matrix"
```

---

### Task 9: Agent role prompts

**Files:**
- Create: `.opencode/agent/orchestrator.md`
- Create: `.opencode/agent/architect.md`
- Create: `.opencode/agent/senior-dev.md`
- Create: `.opencode/agent/qa-engineer.md`

**Interfaces:**
- Consumes: the tool names from Tasks 7–8.

- [ ] **Step 1: Write `orchestrator.md`**

`.opencode/agent/orchestrator.md`
```markdown
---
description: The factory manager. Sole entry point; sole writer of BOARD.md; dispatches all other agents.
mode: primary
---

You are the **Orchestrator** of an AI software factory. You talk to the human, keep state, and
dispatch work. You write no production code.

## Loop
1. **INTAKE** — Use the `intent-extractor` skill to ask 1–2 sharp questions. Write `INTENT.md`
   (goal, constraints, success criteria).
2. **BLUEPRINT** — Call `delegation_delegate_task` with `agent: "architect"` and
   `contextFiles: ["INTENT.md"]`. The architect returns a spec, `CONSTRAINTS.md`, and tickets.
3. **POPULATE** — Reflect the tickets into `BOARD.md` using `delegation_board_read` /
   `delegation_board_update`. A ticket is eligible only when every ticket in its `depends_on` is Done.
4. **EXECUTE** — Pick the next eligible ticket. Call `delegation_delegate_task` with
   `agent: "senior-dev"` and `contextFiles: ["tickets/TICKET-N.md", "CONSTRAINTS.md", <spec>]`.
   On success move it to **In Review**.
5. **QUALITY** — Call `delegation_delegate_task` with `agent: "qa-engineer"` and the same context.
   - HANDOFF `status: done` → move ticket to **Done**.
   - HANDOFF `status: blocked` → re-dispatch senior-dev with the findings (fix loop, **MAX 2**).
   - After 2 failed cycles → move the ticket to **Blocked**, report the specific findings to the human,
     and stop. Never loop forever. Never claim a pass that was not reported.
6. **CLOSE** — When all tickets are Done, summarize and STOP. You may not use the native Task tool.

## Rules
- You are the **only** writer of `BOARD.md`.
- Dispatch children only through `delegation_delegate_task`.
- If a child reports `needs-input` (it wrote `QUESTIONS_FOR_CLIENT.md`), surface those questions to the
  human and pause.
- Emergency: on "wait what" / "stop", stop dispatching, call `delegation_engine_abort` with the current
  `session_id`, show `git status` + last good commit, and ask the human before reverting anything.
- Never `git push`, never `git reset --hard`.
```

- [ ] **Step 2: Write `architect.md`**

`.opencode/agent/architect.md`
```markdown
---
description: Turns INTENT into a spec, CONSTRAINTS.md, and gated tickets. Writes no production code.
mode: subagent
---

You are the **Architect**. You translate intent into a blueprint. You write **no production code** —
only specification and ticket artifacts.

## Steps
1. Read the context files you were given (`INTENT.md`).
2. Use the `spec-creator` skill to write `docs/specs/YYYY-MM-DD-<topic>.md`: problem, goal, approach,
   interfaces, data flow, edge cases, test strategy.
3. Write `CONSTRAINTS.md`: the quality and security bar the implementation must satisfy (version
   floors, dependency limits, naming, security rules). Every constraint must be checkable.
4. Use the `task-breakdown` skill to write `tickets/TICKET-N.md` files. Each ticket has a
   `depends_on` line (or `none`) and a crisp, independently testable deliverable. When you need to
   record them, call `delegation_ticket_write` for each.
5. Stop and emit your `### HANDOFF`.

## Rules
- No `src/**` edits. Spec, constraints, and tickets only.
- Prefer small, independently reviewable tickets. YAGNI ruthlessly.
- If a decision truly cannot be made without the human (e.g. database choice), write
  `QUESTIONS_FOR_CLIENT.md` and report `status: needs-input`.
- End every reply with the `### HANDOFF` block.
```

- [ ] **Step 3: Write `senior-dev.md`**

`.opencode/agent/senior-dev.md`
```markdown
---
description: Implements tickets in thin verifiable slices; delegates boilerplate to general; commits atomically.
mode: subagent
---

You are the **Senior Dev**. You implement one ticket at a time in thin, verifiable slices.

## Steps
1. Read your context files (`tickets/TICKET-N.md`, `CONSTRAINTS.md`, the spec).
2. Use the `core-implementer` skill: work in small slices, test as you go, keep `CONSTRAINTS.md` in view.
3. For **boilerplate, scaffolding, and mechanical refactors only**, use the `delegate-task` skill:
   call `delegation_delegate_task` with `agent: "general"` and a precise prompt, then review the diff
   it returns and integrate it yourself. Do the complex thinking yourself.
4. Commit atomically: `git add` the files, then `git commit -m "feat(TICKET-N): <summary>"`.
5. Stop and emit your `### HANDOFF`.

## Rules
- Never `git push`, never `git reset --hard`, never `rm -rf`.
- Do not delegate judgment calls — only well-specified mechanical work goes to `general`.
- End every reply with the `### HANDOFF` block, including `diff_stat` in `artifacts`.
```

- [ ] **Step 4: Write `qa-engineer.md`**

`.opencode/agent/qa-engineer.md`
```markdown
---
description: Combined quality gate: reviews the diff against the spec, writes and runs tests, scans for security issues.
mode: subagent
---

You are the **QA Engineer** — the combined quality gate. You run **review → tests → security**, in
that order, against the ticket's diff.

## Steps
1. Use the `code-review-and-quality` skill to review the implementation diff against the spec and
   `CONSTRAINTS.md`. Report every violation precisely (file, line, why).
2. Use the `test-driven-development` skill to write a verification suite under `tests/**` and run it
   (`node --test` or `npm test`). A suite you add and that passes gets its own commit:
   `test(TICKET-N): add verification suite`.
3. Use the `security-hardening` skill to scan the diff (secrets in logs, injection, unsafe input).
4. Stop and emit your `### HANDOFF` with `status: done` only if everything passed; otherwise
   `status: blocked` with the concrete findings.

## Rules
- You may only edit `tests/**`. Never touch `src/**`.
- Never `git push`, never `git reset --hard`.
- If tests fail, report `blocked` with the exact failing output. Never report a false pass.
- End every reply with the `### HANDOFF` block.
```

- [ ] **Step 5: Verify each agent loads**

Run: `opencode agent list`
Expected: all four agents listed without errors.

- [ ] **Step 6: Commit**

```bash
git add .opencode/agent/
git commit -m "feat(agents): add orchestrator, architect, senior-dev, qa-engineer prompts"
```

---

### Task 10: Superskill files

**Files:**
- Create: `.opencode/skills/core-router/SKILL.md`
- Create: `.opencode/skills/intent-extractor/SKILL.md`
- Create: `.opencode/skills/spec-creator/SKILL.md`
- Create: `.opencode/skills/task-breakdown/SKILL.md`
- Create: `.opencode/skills/core-implementer/SKILL.md`
- Create: `.opencode/skills/delegate-task/SKILL.md`
- Create: `.opencode/skills/configure-delegation/SKILL.md`
- Create: `.opencode/skills/state-manager/SKILL.md`
- Create: `.opencode/skills/test-driven-development/SKILL.md`
- Create: `.opencode/skills/security-hardening/SKILL.md`
- Create: `.opencode/skills/code-review-and-quality/SKILL.md`

**Interfaces:**
- Consumes: skill names must match their directories (frontmatter `name` regex `^[a-z0-9]+(-[a-z0-9]+)*$`).
- Note: the `description` field is the discovery text — keep it to one specific sentence.

- [ ] **Step 1: Write the orchestrator skills (core-router, intent-extractor, state-manager, configure-delegation)**

`.opencode/skills/core-router/SKILL.md`
```markdown
---
name: core-router
description: Classify an incoming human request as spike, bounded, or architectural and route it to the correct factory workflow.
---

# Core Router

Decide the shape of the work before dispatching anything:

- **Spike** — a feasibility question. Answer it directly; no spec, no tickets.
- **Bounded** — a small change to code already in this repo. One ticket, straight to senior-dev then qa-engineer.
- **Architectural** — a new subsystem or something that changes interfaces others depend on. Full loop:
  architect → tickets → senior-dev → qa-engineer.

Say the classification out loud. When in doubt, take the heavier path. Never skip the INTENT step for
architectural work.
```

`.opencode/skills/intent-extractor/SKILL.md`
```markdown
---
name: intent-extractor
description: Ask the minimum sharp questions needed to reach high confidence on goal, constraints, and success criteria, then write INTENT.md.
---

# Intent Extractor

Ask **one question at a time**, only the ones that change the build. Stop as soon as you can state:

- the goal in one sentence,
- the hard constraints,
- the success criteria (what "done" means),

then write `INTENT.md` with those three sections and hand off. Do not interrogate; 1–2 questions is
usually enough. Prefer multiple-choice questions.
```

`.opencode/skills/state-manager/SKILL.md`
```markdown
---
name: state-manager
description: Maintain BOARD.md as the single source of truth, moving tickets between Todo, In Progress, In Review, Blocked, and Done.
---

# State Manager

You (the orchestrator) are the **only** writer of `BOARD.md`.

- Read with `delegation_board_read`.
- Move with `delegation_board_update` (`ticket`, `column`, optional `note`).
- A Todo ticket is **eligible** only when every ticket in its `depends_on` is **Done**.
- `Blocked` is reachable from any column; always attach the concrete reason in `note`.
- After a fix-loop failure ceiling (2 cycles), move the ticket to `Blocked` with `needs-input` and
  escalate to the human.
```

`.opencode/skills/configure-delegation/SKILL.md`
```markdown
---
name: configure-delegation
description: Read or update DELEGATE_CONFIG.json (engine, serverUrl, defaultModel, timeouts, allowedAgents) for the delegation engine.
---

# Configure Delegation

The engine reads `DELEGATE_CONFIG.json` at the repo root:

```json
{
  "engine": "opencode",
  "serverUrl": "http://localhost:4096",
  "defaultModel": "ollama/deepseek-v4.1-flash:cloud",
  "timeouts": { "healthMs": 5000, "messageMs": 900000 },
  "allowedAgents": ["architect", "senior-dev", "qa-engineer", "general"]
}
```

To change behavior: edit this file, then confirm with `delegation_engine_status` (it reports
`server_up`, `version`, and `agent_roster`). Only `architect`, `senior-dev`, `qa-engineer`, and
`general` are permitted children.
```

- [ ] **Step 2: Write the architect skills (spec-creator, task-breakdown)**

`.opencode/skills/spec-creator/SKILL.md`
```markdown
---
name: spec-creator
description: Turn INTENT.md into a rigorous design spec at docs/specs/ covering approach, interfaces, data flow, edge cases, and test strategy.
---

# Spec Creator

Write `docs/specs/YYYY-MM-DD-<topic>.md` with:

1. **Problem & goal** — why this exists, what success looks like.
2. **Approach** — the chosen design and the alternatives rejected, with one-line reasons.
3. **Interfaces** — exact function/endpoint signatures and data shapes.
4. **Data flow** — the happy path, step by step.
5. **Edge cases & errors** — what can go wrong and the chosen handling.
6. **Test strategy** — how correctness is proven.

No placeholders. No TBD. Every requirement must be checkable by someone who never read the original chat.
```

`.opencode/skills/task-breakdown/SKILL.md`
```markdown
---
name: task-breakdown
description: Slice a spec into small, independently testable tickets with explicit depends_on ordering, written to tickets/TICKET-N.md.
---

# Task Breakdown

For each ticket write `tickets/TICKET-N.md`:

```
# TICKET-N: <title>

- depends_on: <TICKET-M | none>

## Deliverable
<the one testable thing this ticket produces>

## Test
<how it is verified>
```

Rules:
- A ticket is the smallest unit that carries its own test cycle and is worth a fresh reviewer's gate.
- Make ordering explicit with `depends_on`; a ticket is eligible only when its dependencies are Done.
- YAGNI ruthlessly. If two tickets could be merged without losing a review gate, merge them.
```

- [ ] **Step 3: Write the senior-dev skills (core-implementer, delegate-task)**

`.opencode/skills/core-implementer/SKILL.md`
```markdown
---
name: core-implementer
description: Implement a ticket in thin verifiable slices, checking CONSTRAINTS.md at each step and committing atomically.
---

# Core Implementer

1. Read the ticket, `CONSTRAINTS.md`, and the spec.
2. Work in **thin slices** — the smallest change that moves the ticket forward and can be checked.
3. After each slice, run the relevant check (`node --test`, build, lint).
4. Keep the diff small and aligned with the spec's interfaces.
5. Commit when the slice is green: `feat(TICKET-N): <summary>`.

Delegate only mechanical work (scaffolding, boilerplate, bulk renames) to `general` via the
`delegate-task` skill. Keep the judgment calls.
```

`.opencode/skills/delegate-task/SKILL.md`
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
3. **Integrate and commit** as part of your ticket.

Only delegate work you could fully specify yourself. Never delegate design decisions.
```

- [ ] **Step 4: Write the qa-engineer skills (test-driven-development, security-hardening, code-review-and-quality)**

`.opencode/skills/test-driven-development/SKILL.md`
```markdown
---
name: test-driven-development
description: Write a failing verification test first, make it pass, and commit the passing suite for the ticket under review.
---

# Test-Driven Development

1. Write a test that expresses the ticket's acceptance criterion. Run it and watch it **fail**.
2. If it already passes, the test is wrong or the work is already done — investigate.
3. Make the test pass with the smallest change (coordinate with the implementation, do not weaken the test).
4. Run the full suite (`npm test` / `node --test`) and confirm green.
5. Commit the suite on its own: `test(TICKET-N): add verification suite`.

Never edit `src/**`. Tests live under `tests/**`.
```

`.opencode/skills/security-hardening/SKILL.md`
```markdown
---
name: security-hardening
description: Scan the ticket diff for secrets, injection, unsafe input handling, and destructive operations, and block on any finding.
---

# Security Hardening

Review the diff for:

- **Secrets** — API keys, tokens, passwords in code, logs, or error messages.
- **Injection** — unvalidated input reaching shell, SQL, or file paths.
- **Unsafe paths** — `..` traversal, writing outside the repo.
- **Destructive ops** — `push`, `reset --hard`, `rm -rf`.

Any finding → report `status: blocked` with file, line, and the concrete fix. No finding → say so
explicitly in the HANDOFF. Never pass a diff you did not read.
```

`.opencode/skills/code-review-and-quality/SKILL.md`
```markdown
---
name: code-review-and-quality
description: Review the implementation diff against the spec and CONSTRAINTS.md, reporting every violation with file, line, and reason.
---

# Code Review and Quality

Review the ticket's diff **against the spec and `CONSTRAINTS.md`** (not against taste):

1. Does every requirement in the ticket have a corresponding change?
2. Does any change violate a `CONSTRAINTS.md` rule? Cite it.
3. Interfaces: do the signatures match the spec exactly?
4. Edge cases: are the spec's listed cases handled?
5. YAGNI: is there unneeded abstraction or dead code?

Report findings as a precise list (file, line, why). This step runs **before** tests. A diff with an
unresolved finding does not proceed.
```

- [ ] **Step 5: Verify all skills load and names match directories**

Run: `opencode run --agent orchestrator "list every skill you can see, one per line"`
Expected: the 11 skill names appear, with no "duplicate/mismatch" warnings. (Each skill's frontmatter
`name` must equal its directory name.)

- [ ] **Step 6: Commit**

```bash
git add .opencode/skills/
git commit -m "feat(skills): add the 11 v1 superskills"
```

---

### Task 11: Smoke script (warm server + one real delegation)

**Files:**
- Create: `scripts/smoke.mjs`

**Interfaces:**
- Consumes: `DELEGATE_CONFIG.json`, the MCP modules (Tasks 1–6).
- Produces: `npm run smoke` — starts (or reuses) the server and performs one real `delegateTask` round-trip.

- [ ] **Step 1: Write the smoke script**

`scripts/smoke.mjs`
```js
import { spawn } from "node:child_process";
import { loadConfig, repoRoot } from "../mcp/delegation/src/config.ts";
import { OpenCodeClient } from "../mcp/delegation/src/http.ts";
import { delegateTask } from "../mcp/delegation/src/spawn.ts";

const root = repoRoot();
const cfg = loadConfig(root);
const client = new OpenCodeClient(cfg);

async function ensureServer() {
  try {
    const h = await client.health();
    if (h.healthy) return null;
  } catch {
    /* not up */
  }
  const proc = spawn("opencode", ["serve", "--port", String(new URL(cfg.serverUrl).port)], {
    cwd: root,
    stdio: "ignore",
    shell: true,
  });
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const h = await client.health();
      if (h.healthy) return proc;
    } catch {
      /* keep waiting */
    }
  }
  throw new Error("server did not become healthy within 30s");
}

const started = await ensureServer();
try {
  const result = await delegateTask(root, cfg, client, {
    agent: "general",
    prompt: "Create a file named SMOKE_OK.txt at the repo root containing exactly the text: hello factory. Then stop.",
  });
  console.log(JSON.stringify({
    status: result.status,
    changed_files: result.changed_files,
    session_id: result.session_id,
    log_path: result.log_path,
  }, null, 2));
} finally {
  if (started) started.kill();
}
```

- [ ] **Step 2: Verify the smoke run executes a real child**

Run: `npm run smoke`
Expected: prints `status` (`done` or `needs-input`), a `changed_files` array containing
`SMOKE_OK.txt`, a `session_id`, and a `log_path` under `.delegation/logs/`. The server starts
automatically if it was not already running.

- [ ] **Step 3: Confirm the transcript was captured and gitignored**

Run: `git status --short`
Expected: `.delegation/` does **not** appear (it is ignored); `SMOKE_OK.txt` may appear.

- [ ] **Step 4: Clean up the smoke artifact and commit**

```bash
rm -f SMOKE_OK.txt
git add scripts/smoke.mjs package.json
git commit -m "feat: add warm-server delegation smoke script"
```

---

### Task 12: Run the acceptance test end-to-end

**Files:**
- Modify: runtime artifacts created by the agents (`INTENT.md`, `CONSTRAINTS.md`, `docs/specs/*`, `tickets/*`, `BOARD.md`, `mcp/delegation/src/**`, `mcp/delegation/test/**`).
- Modify: `.gitignore` / delete `vendor/` (post-acceptance cleanup).

**Interfaces:**
- Consumes: everything above.
- Acceptance feature: *"add a `--version` flag to the delegation MCP that prints the version from `package.json`, with a passing test."*

- [ ] **Step 1: Ensure clean baseline and server up**

```bash
git status --short          # expect clean (run smoke cleanup first if not)
npm run serve               # leave running in its own terminal, port 4096
```

- [ ] **Step 2: Drive the factory from the orchestrator only**

Open opencode and run as the **orchestrator**:

> "Add a `--version` flag to the delegation MCP that prints the version from `package.json`, with a passing test. Drive the full factory loop and do not write code yourself."

Do **not** hand-edit any code. The orchestrator must:
- write `INTENT.md` and delegate to the architect;
- have the architect produce a spec, `CONSTRAINTS.md`, and **≥2 tickets** where TICKET-2 `depends_on` TICKET-1;
- dispatch senior-dev, which **must** call `delegation_delegate_task` with `agent: "general"` for boilerplate;
- dispatch qa-engineer, which reviews, writes tests, and commits them;
- drive the board Todo → … → Done, proving the dependency gate.

- [ ] **Step 3: Verify the acceptance criteria**

Run: `git log --oneline -20`
Expected: at least one `feat(TICKET-N):` implementation commit AND one `test(TICKET-N):` test commit.

Run: `node mcp/delegation/src/index.ts --version` is **not** an input flag (this is an MCP server); verify
the flag via the test suite instead:
```bash
npm test
```
Expected: the new `--version` test passes.

Inspect `BOARD.md` and `.delegation/logs/`:
- `BOARD.md` shows all tickets in **Done**.
- `ls .delegation/logs/` shows **≥3** `*.jsonl` transcripts across **≥3 distinct agents**
  (`architect`, `senior-dev`, `general`, `qa-engineer`).

Confirm TICKET-1 was `Done` before TICKET-2 left `Todo` (the dependency gate) by reading the board
history and the orchestrator log.

- [ ] **Step 4: Record the result in the spec**

Append to `docs/superpowers/specs/2026-09-28-agent-factory-design.md` a short "Acceptance — PASS" note
with the commit shas, the number of child sessions per agent, and the test command output.

- [ ] **Step 5: Post-acceptance cleanup**

```bash
rm -rf vendor
git add -A
git commit -m "chore: remove vendor scrap yard after acceptance pass"
```
(If you prefer to keep the inventory, move `skills-inventory/` to `docs/archive/` in the same commit
instead of leaving it at the root.)

---

## Self-Review

**Spec coverage:**
- §3 repo layout → Tasks 1, 7, 8, 9, 10. ✔
- §4 runtime mapping → Tasks 8 (agents/permissions), 10 (skills), 7 (MCP). ✔
- §5.1 spawn contract (HTTP warm server, liveness, roster, session, message, abort) → Tasks 5, 6. ✔
- §5.2 the 7 tools → Task 7. ✔
- §5.3 result extraction / logs → Task 6. ✔
- §5.4 baseline snapshotting → Task 2 + Task 6. ✔
- §5.5 guardrails (allowlist, path safety, timeouts) → config allowlist Task 1, path assert Task 6,
  allowlist check Task 6, timeouts Task 5. ✔ (Process-tree kill only applies to the CLI fallback,
  which is not built in v1 — documented, not implemented.)
- §6 HANDOFF contract → Task 3 (parser) + prompt instruction in Task 6, plus agent prompts Task 9. ✔
- §7 roster & mapping → Tasks 9, 10. ✔
- §8 permission matrix → Task 8. ✔
- §9 SOP & BOARD.md → Task 4 (board), Task 9 (loop), Task 12 (execution). ✔
- §10 acceptance test → Task 12. ✔
- §11 open items → resolved; encoded in Global Constraints + Tasks 5/6/8. ✔

**Placeholder scan:** No "TBD"/"TODO"/"implement later"; every code step contains the full file/command.

**Type consistency:** `DelegateConfig`, `OpenCodeClient`, `Handoff`, `BoardState`, `DelegateResult`,
`Column` names and shapes are identical across Tasks 1–7. Tool names are exactly `delegate_task`,
`engine_status`, `engine_abort`, `board_read`, `board_update`, `ticket_write`, `ticket_read` in both
Task 7 (registration) and Task 8 (permission keys `delegation_*`). Skill names in Task 10 match the
`permission.skill` keys in Task 8.

**Known gap (intentional):** per-caller scoping inside the MCP (e.g. "only senior-dev may delegate to
general") is **not enforceable** — opencode does not pass caller identity to MCP tools. It is enforced
by the agent allowlist (`architect|senior-dev|qa-engineer|general`) plus prompt discipline in the agent
files. Documented in the spec's §11 note.

**Review-response patches (2026-09-28):**
1. Task 1 — replaced `require("node:fs")` with a top-level `import { readFileSync } from "node:fs"`
   (ESM has no `require`).
2. Task 8 — architect permission now `"delegation_*": "deny"` **then**
   `"delegation_ticket_write": "allow"` (last-match-wins ordering; the allow must come second).
3. Task 7 — `ticket_write` no longer touches `BOARD.md` (removed its `initBoard`/`moveTicket` calls),
   restoring the spec's single-writer rule (orchestrator only). `board_read` now lazily `initBoard`s an
   empty board so reads never fail on a fresh repo.
