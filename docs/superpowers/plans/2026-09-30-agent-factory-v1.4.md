# Agent Factory v1.4 Implementation Plan (Per-Project `DELEGATE_CONFIG` Resolution)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `mcp/delegation` discovers `DELEGATE_CONFIG.json` relative to the project (walk-up), merges it in layers (defaults → user → project → env), and throws a clear error on a malformed file instead of silently using defaults.

**Architecture:** Pure helpers in `src/config.ts`; `src/index.ts` wires them. No tool schema, tool count, or `engine_status` output changes (frozen by `json-flag.test.ts` / `version.test.ts`).

**Tech Stack:** Node 24 native TypeScript (no build), `node:test`, `node:fs`, `node:path`, `node:os`.

---

## Global Constraints

- No new MCP tools; `TOOL_NAMES`/`listToolNames()` unchanged (ten tools).
- `engine_status` output keys and order unchanged.
- No stdout/stderr writes from config resolution on the happy path.
- `loadConfig(root)` keeps its signature and project-only semantics.
- `.ts` import extensions required.
- Windows-safe path handling (`dirname` loop terminates at `path.parse(dir).root`).

---

## File Structure

| File | Change |
|---|---|
| `mcp/delegation/src/config.ts` | Add `ConfigSource`, `ResolvedConfig`, `resolveConfigPath`, `loadConfigDetailed`, `validateConfig`; make `repoRoot(startDir?)` walk-up-aware; keep `loadConfig`/`defaultConfig`. |
| `mcp/delegation/src/index.ts` | Use `loadConfigDetailed`; use `resolved.projectRoot` for artifact paths. |
| `mcp/delegation/test/config-resolution.test.ts` | New — walk-up, layering, env, fail-loud, missing. |
| `mcp/delegation/test/config.test.ts` | Extend — keep existing contract; add `loadConfigDetailed` default + user-layer cases. |

---

### Task 1: Config resolution helpers (TDD)

- [ ] **Step 1: Write failing tests** in `test/config-resolution.test.ts`:
  - walk-up finds ancestor config and returns its dir as `root`;
  - nearest ancestor wins;
  - layered merge: user < project; `timeouts` deep-merges; `allowedAgents` replaces;
  - env: `DELEGATION_SERVER_URL` overrides `serverUrl` and appends `"env"` to `sources`; `DELEGATION_ROOT` forces root;
  - fail-loud: invalid JSON throws `/not valid JSON/` including the abs path; non-string `serverUrl` throws `/serverUrl/`; non-object `timeouts` throws `/timeouts/`; non-array `allowedAgents` throws `/allowedAgents/`;
  - missing everywhere: `projectPath === null`, `projectRoot === startDir`, defaults apply.
- [ ] **Step 2: Run the tests and confirm they fail** (`node --test test/config-resolution.test.ts`).
- [ ] **Step 3: Implement** `resolveConfigPath`, `validateConfig`, `loadConfigDetailed`, and walk-up `repoRoot` in `src/config.ts`.
- [ ] **Step 4: Run the new tests to green.**
- [ ] **Step 5: Commit** `feat(delegation): resolve DELEGATE_CONFIG per project with layered merge`.

### Task 2: Wire the server + regression

- [ ] **Step 1:** In `src/index.ts`, replace `loadConfig(root)` with `loadConfigDetailed(root)`; pass `resolved.projectRoot` to board/ticket/log paths.
- [ ] **Step 2:** Keep `loadConfig` exported (wrapper) so `test/config.test.ts` is untouched.
- [ ] **Step 3: Run the full delegation suite** (`npm test` in `mcp/delegation`) — all existing tests (incl. `json-flag`, `version`, `tools`, `guardrails`) stay green.
- [ ] **Step 4: Commit** `refactor(delegation): wire per-project config resolution into the server`.

### Task 3: Root suite gate

- [ ] **Step 1:** From repo root run `npm test` (runs CLI tests + delegation tests).
- [ ] **Step 2:** Confirm 0 failures.
- [ ] **Step 3: Commit** any doc/test touch-ups.

## Self-Review

| Spec § | Task |
|---|---|
| §2 discovery | Task 1 (resolveConfigPath, repoRoot walk-up) |
| §2 layering | Task 1 (loadConfigDetailed) |
| §2 fail-loud | Task 1 (validateConfig) |
| §3 wiring | Task 2 |
| §5 edge cases | Task 1 tests |
| §7 regression (frozen contracts) | Task 2 Step 3 |
| §8 acceptance | Tasks 1–3 |
