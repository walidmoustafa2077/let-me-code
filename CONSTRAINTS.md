# CONSTRAINTS — delegation MCP (`mcp/delegation`)

Hard invariants for the delegation MCP server, its configuration layering, and the `engine_status`
output modes. Every constraint below is **checkable**: a reviewer or CI step can decide pass/fail
without reading the original chat. A violation blocks the ticket.

This file supersedes the v1.3, feature-scoped bar that froze seven tools and a five-key payload. The
server now exposes **ten** tools, and `engine_status` reports **eleven** keys (ten when the engine
omits its version). Any future change to that surface requires an approved spec and a deliberate edit
to this file in the same change.

## C1 — Tool surface is exactly ten tools, in order

- `listToolNames()` and `TOOL_NAMES` MUST equal, in order:
  `delegate_task`, `delegate_parallel`, `engine_status`, `engine_abort`, `engine_halt_and_revert`,
  `engine_metrics`, `board_read`, `board_update`, `ticket_write`, `ticket_read`.
- No tool may be added, removed, renamed, or reordered without an approved spec and a matching edit
  to this section.
- **Check:** `mcp/delegation/test/tools.test.ts` asserts the ordered list and
  `(await client.listTools()).tools.length === 10`; `json-flag.test.ts` schema guard repeats the
  count.

## C2 — Only `engine_status` accepts the optional `json` flag

- `engine_status`'s `inputSchema` MUST be exactly `{ json: z.boolean().optional() }`. `json` MUST be
  optional, MUST be the only property, and MUST NOT carry a `.default(...)`.
- The other nine tools MUST NOT expose a `json` property.
- **Out of scope — MUST NOT be "fixed":** a tool call that omits the `arguments` field entirely is
  rejected by pre-existing MCP/zod validation with `-32602 Invalid arguments` **before** the handler
  runs. "No arguments" is NOT equivalent to `{}`. No schema relaxation, no `.default`, and no
  tolerance wrapper may be added.
- **Check:** `json-flag.test.ts` *"schema guard"* passes; `git diff` shows no schema change outside
  `engine_status`.

## C3 — Compact mode contract (`json: true`)

- Result text MUST be exactly one line: `JSON.stringify(payload)` with no indentation and no `\n`
  (or `\r`) anywhere in the string.
- It MUST contain exactly these eleven keys, emitted in this order — no more, no fewer, no renames,
  no reordering:
  `server_up`, `version`, `agent_roster`, `serverUrl`, `allowedAgents`, `host`, `port`, `port_open`,
  `engine_lock`, `lock_alive`, `auto_start`.
- Types: `server_up` boolean; `version` string; `agent_roster` string array; `serverUrl` string;
  `allowedAgents` string array; `host` string; `port` number; `port_open` boolean; `engine_lock`
  object (`{pid, port, url, startedAt}`) or `null`; `lock_alive` boolean; `auto_start` boolean.
- **Mandatory order-sensitive assertion:** `Object.keys(JSON.parse(text))` deep-equals the
  eleven-key array above for both compact and default modes.
- **Insufficient checks — do NOT count:** sorted-key comparisons (`Object.keys(...).sort()`) and
  self-referential formatting checks such as `text === JSON.stringify(JSON.parse(text), null, 2)`.
  These only prove internal formatting consistency, never key order.
- **Scoped degraded case** (`health.version` is `undefined`): `JSON.stringify` omits `version`
  identically in both modes, so the guaranteed order is the same eleven keys minus `version`. The two
  modes MUST still agree.
- **Check:** `json-flag.test.ts` compact-mode tests assert no CR/LF and the ordered keys.

## C4 — Default mode is the pretty-printed form of the same payload

- The default path is `arguments: {}`, `{ json: false }`, or `{ json: undefined }`. Omitting
  `arguments` is a platform `-32602` rejection and MUST NOT be treated as a default-path case.
- Default result text MUST be exactly `JSON.stringify(payload, null, 2)`.
- Compact and default payloads MUST have the same key set, key order, and values; they differ
  **only** in serialization (compact vs. 2-space indented).
- **Check:** `text({})` is 2-space indented and byte-equal to `text({ json: false })` and
  `text({ json: undefined })`; parsed compact and default objects deep-equal each other.

## C5 — Error path is flag-independent

- The `engine_status` catch block MUST return exactly
  `JSON.stringify({ server_up: false, error, serverUrl, host, port, port_open, engine_lock, lock_alive, auto_start }, null, 2)`
  where `error = (e as Error).message` and `serverUrl = cfg.serverUrl`, in that order.
- Diagnostics in the error path are best-effort: `port_open`, `engine_lock`, and `lock_alive` fall
  back to `false`, `null`, and `false` when diagnostics themselves fail.
- The error path MUST NOT depend on `json`: a flagged call and an empty-arguments call MUST return
  the same pretty-printed object. It MUST NOT throw, MUST NOT emit a partial success payload, and
  MUST NOT set `isError`.
- **Check:** `json-flag.test.ts` *"error path"* test asserts the nine-key ordered payload in both
  modes, `server_up === false`, and `isError !== true`.

## C6 — Configuration layering is defaults < user < project < env, and fails loud

- `loadConfigDetailed(startDir, options)` MUST merge layers in that order: built-in defaults,
  user config (`~/.config/let-me-code/DELEGATE_CONFIG.json` or `options.userConfigPath`), nearest
  ancestor `DELEGATE_CONFIG.json`, then environment overrides.
- `DELEGATION_ROOT` forces both the project root and the config location.
  `DELEGATION_SERVER_URL` overrides `serverUrl` and appends the `env` source.
- `timeouts` deep-merge; `agents` shallow-merge; `allowedAgents` replace wholesale. When `agents` is
  present, its keys supersede `allowedAgents` as the per-project allowlist.
- Invalid JSON MUST throw naming the absolute path; wrong-typed fields MUST throw naming the field.
  No silent fallback to defaults.
- **Check:** `mcp/delegation/test/config-resolution.test.ts` covers nesting, nearest-wins, layering,
  both env overrides, defaults-only, invalid JSON, and wrong-typed fields.

## C7 — Tests are hermetic and green under Node's built-in runner

- Tests MUST NOT inherit the developer's shell environment. Each affected test file deletes
  `DELEGATION_ROOT` and `DELEGATION_SERVER_URL` before loading config, or passes an explicit `env`.
  A globally exported `DELEGATION_ROOT` must never redirect a temp-project test.
- Test runner is the Node built-in: `node --test` from `mcp/delegation` (and the root suite via
  `npm test`). No Jest/Vitest, no new test dependency.
- **Check:** `npm test` from the repository root exits `0` with every suite green, including with
  `DELEGATION_ROOT` exported in the shell.
- CI runs the same suite on Node 22 and 24, on Linux and Windows (`.github/workflows/ci.yml`).
  A red matrix cell blocks the change.

## C8 — Runtime & module conventions

- ESM + TypeScript executed directly by Node's native type stripping: `node src/index.ts`. No build
  step, no bundler, no `tsc` required to run.
- Relative imports MUST keep the `.ts` extension.
- New runtime dependencies require a documented need; prefer `node:` built-ins and the existing
  `zod` (`z`). The MCP SDK is the only protocol dependency.
- **Check:** `npm test` passes with no prebuild step; `node src/index.ts` starts the stdio server.

## C9 — Windows / cross-platform safety

- Path handling MUST be correct on `win32` and POSIX alike; no assumption of `\` or `/`.
- Spawning the engine MUST keep the `win32` shell path (`cmd /c`) and POSIX direct-spawn path.
- **Check:** the full suite passes on Windows/PowerShell; `engine.ts` retains both spawn branches.

## C10 — No secrets, no tracked runtime artifacts

- No credentials, tokens, API keys, or `.env` contents may be committed. No test may read a real
  `OPENCODE_API_KEY`.
- Runtime artifacts under `.delegation/` (`logs/`, `runs/`, `snapshots/`) MUST NOT be tracked;
  `.gitignore` covers them and `git ls-files .delegation` MUST return nothing.
- **Check:** `git ls-files .delegation` is empty; `git grep -nE "oc_sk_|sk-[A-Za-z0-9]{16,}"` finds
  no key material.
