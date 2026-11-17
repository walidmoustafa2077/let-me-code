# Agent Factory v1.4 Design Spec: Per-Project `DELEGATE_CONFIG` Resolution

**Date:** 2026-09-30
**Status:** Approved
**Base:** `main` (v1.3 delivered: 10 MCP tools, 11 agents, 38 skills, npx distribution published)
**Branch:** `feat/agent-factory-v1.4`

---

## 1. Problem Statement & Scope

The delegation MCP resolves its runtime configuration from a single, fragile location:

```ts
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
    return base; // silent: missing OR malformed both fall back to defaults
  }
  ...
}
```

Three concrete defects:

1. **cwd-dependent discovery.** `repoRoot()` uses `process.cwd()`. opencode launches the local MCP with `cwd: "."` (resolved from the workspace), so if the workspace is opened from a subdirectory of the project, the project's `DELEGATE_CONFIG.json` is never found.
2. **Silent failure.** Any `readFileSync`/`JSON.parse` error is swallowed and replaced with `defaultConfig()`. A typo in the file silently disables the whole project configuration with no diagnostic.
3. **No layering / no override.** There is no way to set a user-wide default that a project refines, and no way for a single env var to override just the server URL.

**Goal:** a project's `DELEGATE_CONFIG.json` is discovered relative to the *project*, merged in layers (defaults → user → project → env), and a malformed file fails loudly with an actionable message.

**Scope:** configuration resolution only. No schema change, no new MCP tool, no new config keys beyond documented env overrides.

**Frozen contracts respected (do not break):**
- `engine_status`'s output shape is frozen by `test/json-flag.test.ts` (exact ordered keys: 5 success / 3 error / 4 degraded). This change therefore adds **no new fields** to any tool output; the effective config is already observable via the existing `serverUrl`/`allowedAgents` fields.
- `test/version.test.ts` asserts **empty stderr** on startup, so resolution must not print to stderr on the happy path; a malformed file throws instead (surfacing on stderr only when the error is actually fatal).

---

## 2. Approach (chosen: A — walk-up discovery + layered merge + fail-loud)

Extend `mcp/delegation/src/config.ts` with three responsibilities kept as pure, testable helpers:

1. **Discovery** — `resolveConfigPath(startDir)` walks up from `startDir` to the filesystem root and returns the nearest `DELEGATE_CONFIG.json` (plus the directory that contains it = the project root), or `null` when none exists.
2. **Layered merge** — `loadConfigDetailed(startDir, options)` builds the effective config by merging, in increasing precedence:
   `defaultConfig()` → **user** (`<home>/.config/let-me-code/DELEGATE_CONFIG.json`) → **project** (nearest walk-up hit) → **env overrides** (`DELEGATION_ROOT`, `DELEGATION_SERVER_URL`). `timeouts` deep-merges; `allowedAgents` replaces wholesale; other scalars override.
3. **Fail loud** — a file that exists but is unreadable, is not valid JSON, or has a wrongly-typed field **throws** an `Error` naming the absolute path and the offending field. Missing files remain non-fatal (defaults still apply).

**Rejected alternatives:**

- *Keep cwd-only, just document "run from the project root".* Rejected: the launcher controls cwd (`.`, resolved from the workspace), so the user cannot reliably control it.
- *Require `DELEGATION_ROOT` to always be set.* Rejected: forces every project to hand-maintain an env var; walk-up makes it unnecessary while still honoring the var when set.
- *Support a config array (`DELEGATE_CONFIG.d/*.json`).* Rejected as YAGNI — the user+project layers cover the real need.
- *Silently merge malformed files as `{}`.* Rejected: this is the exact defect being fixed.

---

## 3. Interfaces

All new symbols live in `mcp/delegation/src/config.ts` (ESM, TypeScript, `.ts` import extensions required).

```ts
export interface Timeouts { healthMs: number; messageMs: number; }

export interface DelegateConfig {
  engine: string;
  serverUrl: string;
  defaultModel?: string;
  timeouts: Timeouts;
  allowedAgents: string[];
}

/** Where each layer of the effective config came from, in precedence order. */
export type ConfigSource = "defaults" | "user" | "project" | "env";

export interface ResolvedConfig {
  config: DelegateConfig;
  sources: ConfigSource[];      // subset of ConfigSource, ordered low→high
  projectPath: string | null;   // absolute path of the winning project config, or null
  projectRoot: string;          // dir used for boards/tickets/logs (walk-up result or startDir)
}

export function defaultConfig(): DelegateConfig;

/** Nearest DELEGATE_CONFIG.json walking up from startDir, or null. */
export function resolveConfigPath(startDir: string): { path: string; root: string } | null;

/** Layered, validated resolution. Throws on a malformed/ill-typed file. */
export function loadConfigDetailed(
  startDir: string,
  options?: { userConfigPath?: string; env?: NodeJS.ProcessEnv },
): ResolvedConfig;

/** Backward-compatible wrapper returning only the effective config. */
export function loadConfig(root: string): DelegateConfig;

/** Project root for artifacts: DELEGATION_ROOT ?? walk-up root ?? cwd. */
export function repoRoot(startDir?: string): string;
```

**Env overrides recognized:**

| Var | Effect |
|---|---|
| `DELEGATION_ROOT` | Forces the project root (and where `DELEGATE_CONFIG.json` is looked up) — highest precedence. |
| `DELEGATION_SERVER_URL` | Overrides `serverUrl` only. |

**Wiring in `mcp/delegation/src/index.ts`:**

1. Import `loadConfigDetailed` instead of `loadConfig`.
2. `createServer(root = repoRoot())` computes `const resolved = loadConfigDetailed(root)`; `cfg = resolved.config`. Boards/tickets/logs continue to use `resolved.projectRoot` (which equals `root` in every existing test, since those tests pass an explicit dir).

`engine_status`, `TOOL_NAMES`, and every tool schema are **untouched** — still exactly ten tools, unchanged output shapes.

---

## 4. Data Flow

**Startup (happy path):**

1. opencode launches `node mcp/delegation/src/index.ts` with `cwd` = workspace; workspace is `<project>/sub`.
2. `createServer()` → `repoRoot()`: `DELEGATION_ROOT` unset → `resolveConfigPath(cwd)` walks `sub` → `<project>`, finds `<project>/DELEGATE_CONFIG.json`, returns its dir as `projectRoot`.
3. `loadConfigDetailed(projectRoot)` merges: defaults → user (`<home>/.config/let-me-code/DELEGATE_CONFIG.json` if present) → `<project>/DELEGATE_CONFIG.json` → env overrides. `sources = ["defaults","user","project"]`.
4. Tools use `cfg`; boards/tickets/logs are written under `projectRoot` (the directory owning the config), not the workspace subdir.

**No-config path (unchanged):**

1. No `DELEGATE_CONFIG.json` in any ancestor and `DELEGATION_ROOT` unset.
2. `resolveConfigPath` → `null`; `projectRoot = startDir` (current behavior); effective config = defaults + user layer.

---

## 5. Edge Cases & Errors

| Case | Handling |
|---|---|
| File missing everywhere | Non-fatal. `projectPath = null`; defaults (+user) apply; `projectRoot = startDir`. |
| File present but invalid JSON | **Throw** `DELEGATE_CONFIG.json at <abs path> is not valid JSON: <reason>`. |
| File present, `serverUrl` not a string | **Throw** naming the field and path. |
| File present, `timeouts` not an object | **Throw** naming `timeouts` and path. |
| File present, `allowedAgents` not a string array | **Throw** naming `allowedAgents` and path. |
| Unknown extra keys | Ignored (forward-compatible; not an error). |
| Partial project file (e.g. only `serverUrl`) | Merges over user/defaults; other fields keep lower-layer values. |
| `DELEGATION_ROOT` set | Wins for root lookup; config read from `<DELEGATION_ROOT>/DELEGATE_CONFIG.json`. |
| `DELEGATION_SERVER_URL` set | `serverUrl` overridden last; `"env"` appended to `sources`. |
| Walk-up reaches a filesystem root with no config | Returns `null`; no infinite loop. |
| Windows separators / drive roots | `dirname` loop terminates at the drive root (`parent === dir`). |

---

## 6. Non-Goals

- **Per-caller scoping inside the MCP** — still blocked upstream (opencode does not pass caller identity to MCP tools). Deferred.
- Adding/removing MCP tools or changing any tool's input schema.
- Changing the *shape* of `DelegateConfig` or adding new config keys.
- Reading config from network/git/remote sources, or a `DELEGATE_CONFIG.d/` directory.
- Auto-migrating or rewriting a user's config file.

---

## 7. Test Strategy

Proven by `mcp/delegation/test/config-resolution.test.ts` (new) plus extensions to `mcp/delegation/test/config.test.ts`, run with `node --test` from `mcp/delegation`:

1. **Walk-up:** a config in an ancestor directory is found from a nested `startDir`; the returned `root` is the ancestor.
2. **Nearest wins:** with configs at two ancestor levels, the nearest one wins.
3. **Layering:** user layer merged under project layer; project scalar overrides user scalar; `timeouts` deep-merges; `allowedAgents` replaces.
4. **Env override:** `DELEGATION_SERVER_URL` overrides `serverUrl` and appends `"env"` to `sources`; `DELEGATION_ROOT` forces the root.
5. **Fail loud:** malformed JSON throws with the absolute path in the message; wrong-typed `serverUrl`/`timeouts`/`allowedAgents` each throw naming the field.
6. **Missing everywhere:** returns defaults, `projectPath === null`, `projectRoot === startDir`.
7. **Effective-config observability:** with a partial project config, `loadConfigDetailed(...).config` exposes the merged `serverUrl`/`allowedAgents` (the same values already surfaced by `engine_status`).
8. **Regression:** the existing `test/config.test.ts` contract (`loadConfig` merges a partial file over defaults; missing file yields defaults) still passes — `loadConfig` stays a thin wrapper. The full suite, including `json-flag.test.ts` and `version.test.ts`, stays green (no output-shape or stderr changes).

A red flag is treated as a failure: any test that relies on the process's real `cwd` or real `$HOME`, or that asserts a hardcoded config literal instead of building it in a temp dir, does not satisfy this spec.

---

## 8. Acceptance Criteria

1. Running the MCP from a subdirectory of a project with a `DELEGATE_CONFIG.json` at the project root resolves that file.
2. A malformed `DELEGATE_CONFIG.json` causes a thrown error naming the file path — never a silent default.
3. `loadConfig`'s existing contract is unchanged (regression tests pass).
4. `engine_status`'s frozen output shape is unchanged; exactly ten tools remain.
5. The full suite (`node --test` in `mcp/delegation`) passes with 0 failures.
