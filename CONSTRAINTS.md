# CONSTRAINTS — delegation MCP (`mcp/delegation`)

Hard invariants for the **`--json` output mode on `engine_status`** feature. Every constraint below
is **checkable**: a reviewer or CI step can decide pass/fail without reading the original chat. A
violation blocks the ticket.

Scope shorthand used below: **the change** = the `json` feature described in
`docs/specs/json-flag.md`.

## C1 — Exactly seven MCP tools remains inviolable

- `listToolNames()` MUST still return exactly, and only, these seven names:
  `delegate_task`, `engine_status`, `engine_abort`, `board_read`, `board_update`, `ticket_write`, `ticket_read`.
- **No eighth tool may be registered** for any reason — including a tool that would report status in
  compact form. `TOOL_NAMES` and `listToolNames()` MUST be **untouched**.
- **Check:** `mcp/delegation/test/tools.test.ts` test *"the server registers exactly the seven v1
  tools"* passes unmodified; `git diff` shows no edit to the `TOOL_NAMES` array or `listToolNames`;
  `registerTool` is still called exactly seven times in `src/index.ts`; and
  `(await client.listTools()).tools.length === 7` with the expected names.

## C2 — Only `engine_status` may gain the optional `json` parameter

- `engine_status`'s `inputSchema` MUST change from `{}` to exactly `{ json: z.boolean().optional() }`.
  `json` MUST be optional and MUST be the only new property. **No `.default(...)`** may be added.
- The other six tools' `inputSchema` objects MUST be **byte-identical** to before the change.
- **Check (schema guard):** `const { tools } = await client.listTools();` — this SDK API exposes each
  tool's JSON `inputSchema`. Assert there are exactly seven tools with the expected names;
  `engine_status.inputSchema.properties.json` exists (boolean) and `json` is **not** listed in that
  schema's `required` (or `required` is absent); and **no other tool's `inputSchema` has a `json`
  property**. Plus: the diff of `src/index.ts` shows `engine_status`'s `inputSchema` as the only
  schema change.
- **Out of scope — MUST NOT be "fixed":** a tool call that omits the `arguments` field entirely is
  rejected by pre-existing MCP/zod validation with `-32602 Invalid arguments` **before** the handler
  runs. "No arguments" is NOT equivalent to `{}`. No schema relaxation, no `.default`, and no
  tolerance wrapper may be added; no ticket may assert a missing `arguments` field succeeds.

## C3 — Compact mode contract (`json: true`) and key order (decidable)

- Result text MUST be **exactly one line**: `JSON.stringify(payload)` with **no indentation** and
  **no `\n` (or `\r`) anywhere in the string**.
- It MUST contain **exactly** these five keys, emitted in this order — no more, no fewer, no renames,
  no reordering: `server_up`, `version`, `agent_roster`, `serverUrl`, `allowedAgents`.
- `server_up` MUST be boolean; `version` a string; `agent_roster` a string array; `serverUrl` a
  string; `allowedAgents` a string array.
- **Mandatory order-sensitive assertion:** `JSON.parse(text)` succeeds and `Object.keys(parsed)`
  deep-equals `["server_up", "version", "agent_roster", "serverUrl", "allowedAgents"]` in that order
  for **both** compact and default modes.
- **Insufficient checks — do NOT count:** sorted-key comparisons (`Object.keys(parsed).sort()`) and
  self-referential formatting checks such as `text === JSON.stringify(JSON.parse(text), null, 2)`.
  These only prove internal formatting consistency, never key order.
- **Scoped degraded case** (`health.version` is `undefined`; `http.ts` types `version?: string`):
  `JSON.stringify` omits `version` identically in both modes, so the guaranteed order becomes exactly
  `server_up`, `agent_roster`, `serverUrl`, `allowedAgents`, and the two modes MUST still agree. This
  is pre-existing behaviour, not introduced here; covered by TICKET-2 test 9.
- **Check:** call `engine_status` with `{ json: true }`; assert `!/[\r\n]/.test(value)` and the
  ordered `Object.keys(JSON.parse(value))` deep-equal the five-key array above.

## C4 — Default mode is byte-identical to today

- The **default path** is exactly `arguments: {}`, `{ json: false }`, or `{ json: undefined }`.
  Omitting `arguments` is a platform `-32602` rejection and MUST NOT be treated as a default-path
  case.
- In the default path, result text MUST be exactly `JSON.stringify(payload, null, 2)` — the same
  2-space pretty-printed block produced before this change.
- The compact and default payloads MUST have the **same key set and order**; they MUST differ
  **only** in serialization (compact vs. 2-space indented), never in key names, key order, or values.
- **Check:** for identical stub data, `Object.keys` of the compact parse and of the default parse both
  deep-equal the normative five-key ordered array and deep-equal each other; `text` for `{}` and
  `{ json: false }` are byte-equal; `text({})` is 2-space indented and compact text has no `\n`.

## C5 — Error path unchanged

- The catch block MUST NOT be modified. On any thrown error the result text MUST remain exactly
  `JSON.stringify({ server_up: false, error, serverUrl }, null, 2)` with `error = (e as Error).message`
  and `serverUrl = cfg.serverUrl`, emitted in that order.
- The error path MUST be **flag-independent**: calling with `{ json: true }` and failing MUST return
  the same three-key pretty-printed object as a failing call with `arguments: {}`. It MUST NOT throw,
  MUST NOT emit a partial success payload, and MUST NOT set `isError`.
- **Check:** with the engine stubbed to fail, both a flagged and an empty-arguments call parse to an
  object whose `Object.keys` deep-equals `["server_up", "error", "serverUrl"]` with
  `server_up === false`; and `result.isError !== true` for both (asserting the property is absent is
  not a valid check — a normal result may omit it).

## C6 — Change footprint is exactly one handler (plus its schema)

- Only the `engine_status` handler body and its `inputSchema` in `mcp/delegation/src/index.ts` may
  change. **No new source files** may be added.
- `board.ts`, `config.ts`, `http.ts`, `spawn.ts`, `handoff.ts`, `version.ts`, `git.ts` MUST be
  untouched. `BOARD.md` and `package.json` MUST be untouched.
- The `ok` / `fail` helpers, the entrypoint guard, and all other tool registrations MUST be untouched.
- **Check:** `git diff --stat` touches only the exact file `mcp/delegation/src/index.ts` (TICKET-1)
  and the exact file `mcp/delegation/test/json-flag.test.ts` (TICKET-2) — no other path, no glob; the
  `index.ts` diff is confined to the `engine_status` registration.

## C7 — Tests green under Node's built-in runner

- All tests under `mcp/delegation/test/` MUST pass, including the pre-existing seven-tools assertion
  and the `ticket_write`/`board_read`/`board_update` round-trips.
- Test runner is the Node built-in: `node --test` run from `mcp/delegation`. **No Jest/Vitest, no new
  test dependency.**
- **Check:** `node --test` from `mcp/delegation` exits `0` with every suite green.

## C8 — Runtime & module conventions

- ESM + TypeScript executed directly by Node's native type stripping: `node src/index.ts`. **No build
  step, no bundler, no `tsc` required to run.**
- Relative imports MUST keep the `.ts` extension. The change MUST NOT add any import.
- **No new runtime dependencies** may be added; `JSON` and the already-imported `zod` (`z`) suffice.
- **Check:** `package.json` `dependencies` is unchanged; `import` lines in `src/index.ts` are
  unchanged (no new specifier); the package runs without a compile/prebuild step.

## C9 — Windows / cross-platform safety

- The change introduces **no** filesystem or path handling, so it MUST remain correct on `win32` and
  POSIX alike. Any incidental path usage must not assume `\` or `/`.
- **Check:** `node --test` passes on Windows/PowerShell; the `engine_status` diff contains no new path
  literal or `path`/`os` usage.

## C10 — No secrets, no network

- The feature MUST add **no** network I/O and require no warm `opencode serve`. Existing HTTP calls
  via `OpenCodeClient` are unchanged.
- No credentials, tokens, or environment secrets may be read or written for this feature.
- **Check:** `git diff` adds no `fetch`, `http`, `process.env`, token, or credential usage; tests stub
  the engine locally and pass with no external server running.