# Spec — `--json` output mode for the delegation MCP `engine_status` tool

- **Date:** 2026-09-29
- **Status:** Approved (autonomous build)
- **Topic:** json-flag
- **Target package:** `mcp/delegation`
- **Runtime:** Node v24.x native TypeScript (`node src/index.ts`, no build) · win32 / PowerShell
- **Tickets:** `tickets/TICKET-1.md` (implementation), `tickets/TICKET-2.md` (verification)

---

## 1. Problem & Goal

The delegation MCP server (`mcp/delegation`) exposes an `engine_status` tool that reports engine
liveness, version, agent roster, config URL, and the allowlist. Today the handler always serializes
its payload with `JSON.stringify(payload, null, 2)` — a **multi-line, pretty-printed** text block.

Callers that want to feed that payload into a script (shell `jq`, another tool, a log line) must
first strip newlines. There is no machine-compact form.

**Goal:** add an optional boolean input `json` to the `engine_status` tool. When `json: true`, the
tool result content is a **single line** of JSON containing exactly `server_up`, `version`,
`agent_roster`, `serverUrl`, `allowedAgents`. When the flag is absent or `false`, output is
**byte-for-byte unchanged** from today.

**Success looks like:** `engine_status` called with `{ json: true }` returns one line that
`JSON.parse` round-trips to exactly the five-key object in the normative order below; called with
`arguments: {}` or `{ json: false }` it returns the identical pretty-printed block it returns today;
existing consumers never break. A tool call that omits the `arguments` field entirely is rejected by
the platform before the handler runs and is explicitly **out of scope** (§3.2).

> Naming note: the human-facing flag is spelled `--json`, but MCP tools have no argv. Over the MCP
> protocol the equivalent is the boolean tool input `json: true`. No CLI argv parsing is added.

## 2. Approach (chosen)

Change **only** the `engine_status` tool registration in `mcp/delegation/src/index.ts`:

1. Widen its `inputSchema` from `{}` to `{ json: z.boolean().optional() }`.
2. Read the flag in the handler (`async (args) => …`).
3. Build the success payload object **once** with the five keys in fixed order, then choose the
   serializer:

   ```ts
   const payload = {
     server_up: health.healthy, version: health.version,
     agent_roster: agents.map((a) => a.name), serverUrl: cfg.serverUrl,
     allowedAgents: cfg.allowedAgents,
   };
   return ok(args.json ? JSON.stringify(payload) : JSON.stringify(payload, null, 2));
   ```

   The **only** difference between modes is the `space` argument (`undefined` vs `2`). No key is
   added, removed, renamed, or reordered.

4. Leave the existing `catch` block byte-identical.

Chosen because:
- It is a two-line change at the single registration site; the payload shape is shared by both
  modes, so the two modes cannot drift in their key set *or key order*.
- No new module, no new dependency, no DI refactor — `JSON` and the already-imported `z` suffice.
- Behaviour for every existing caller is provably unchanged (the flag defaults to absent/false).

**Rejected alternatives:**
- *Add a new tool `engine_status_json`.* Rejected: the exactly-seven-tools contract is inviolable;
  an eighth tool is forbidden (see `CONSTRAINTS.md` C1).
- *Add `json` to the input schema of every tool / a server-wide option.* Rejected: out of scope —
  only `engine_status` is in scope, and other schemas must stay untouched (C2).
- *Pretty-print in default mode and post-process/strip newlines for compact.* Rejected: a hand-rolled
  transform can alter string values (e.g. a `version` containing whitespace); `JSON.stringify`'s
  `space` parameter is exactly the supported mechanism.
- *Always emit compact and let default-mode callers re-pretty-print.* Rejected: breaks byte-for-byte
  backward compatibility (C4).
- *Honour the flag on the error path too.* Rejected: the task requires the error path to stay
  unchanged; see §5.
- *Make the schema tolerate a missing `arguments` field (add a default / soften zod).* Rejected:
  omitting `arguments` is rejected by pre-existing MCP/zod platform validation with `-32602 Invalid
  arguments` **before** the handler runs; that is out of scope and MUST NOT be "fixed" (§3.2).

## 3. Interface / Handler Contract

**Tool registration** (`mcp/delegation/src/index.ts`, `engine_status` only):

```ts
server.registerTool(
  "engine_status",
  { description: "Report engine liveness, version, agent roster, and config.", inputSchema: { json: z.boolean().optional() } },
  async (args) => { /* body per below */ },
);
```

- Input parameter: `json?: boolean` — optional.
- `json` is the **only** new parameter. The other six tools' `inputSchema`s are untouched.
- The tool's `description` is unchanged.

### 3.1 Default path — exact definition

The **default path** is defined by any of:

- `callTool("engine_status", {})` — the `arguments` object is present and empty, so `args.json` is
  `undefined`;
- `callTool("engine_status", { json: false })`;
- `callTool("engine_status", { json: undefined })`.

In every one of these cases the handler runs with `args.json` falsy and returns the existing
pretty-printed output. These three forms are equivalent and all MUST remain byte-identical to today.

### 3.2 Omitting `arguments` is out of scope (normative)

- A tool call that **omits the `arguments` field entirely** (i.e. `callTool("engine_status")` with no
  second argument) is rejected by the MCP SDK / zod input validation with `-32602 Invalid arguments`
  **before the handler runs**. This was verified live via `InMemoryTransport`.
- Therefore "no arguments" and `{}` are **NOT** equivalent. The satisfiable, in-scope default is
  `arguments: {}`.
- This is **pre-existing platform validation behaviour**. The feature MUST NOT attempt to "fix" it:
  no schema softening, no zod `.default(...)`, no wrapper that tolerates a missing `arguments`. No
  ticket may assert that a missing `arguments` field succeeds.
- **Check:** the `engine_status` `inputSchema` remains exactly `{ json: z.boolean().optional() }`
  with no default; no diff introduces a `.default(` call; the test plan asserts the default path only
  via `arguments: {}` (never via a bare `callTool("engine_status")`).

**Success payload** — the same five-key object is built in both modes, in this insertion order:

| Key | Type | Source |
|---|---|---|
| `server_up` | boolean | `(await client.health()).healthy` |
| `version` | string | `(await client.health()).version` |
| `agent_roster` | string[] | `(await client.agents()).map(a => a.name)` |
| `serverUrl` | string | `cfg.serverUrl` |
| `allowedAgents` | string[] | `cfg.allowedAgents` |

### 3.3 Key order is normative (decidable)

- For the normal (version-present) success payload, the emitted own-key order MUST be exactly
  `server_up`, `version`, `agent_roster`, `serverUrl`, `allowedAgents` in **both** compact and
  default modes.
- The mandatory assertion is order-sensitive:
  `assert.deepEqual(Object.keys(parsed), ["server_up", "version", "agent_roster", "serverUrl", "allowedAgents"])`
  for **both** modes.
- Sorted-key assertions (e.g. comparing `Object.keys(parsed).sort()`) and self-referential
  formatting checks such as `text === JSON.stringify(JSON.parse(text), null, 2)` do **NOT** satisfy
  this requirement — they only prove internal formatting consistency, never key order.

### 3.4 `version`-less degraded case (explicit)

`health.version` is typed `version?: string` in `http.ts`. When the engine reports health **without**
a version, `health.version` is `undefined` and `JSON.stringify` **omits** the `version` key.

- The omission happens identically in **both** modes, so:
  - the **five-key guarantee (§3.3) is scoped to the normal case** where `health.version` is a
    string; and
  - in the degraded case the guaranteed own-key order is exactly
    `server_up`, `agent_roster`, `serverUrl`, `allowedAgents` (four keys), and compact and default
    modes MUST still agree exactly.
- This is pre-existing `JSON.stringify` behaviour, **not** introduced by this feature; no code is
  added to special-case it. It is stated identically in `CONSTRAINTS.md` (C3) and tested (TICKET-2
  test 9).

**Compact mode** (`args.json === true`):

- Result text is exactly `JSON.stringify(payload)` — **no indentation**, **no trailing newline
  character inside the string**.
- `JSON.parse(text)` succeeds and yields an object whose own-key order deep-equals the five-key
  normative array (§3.3).
- `server_up` is boolean; `agent_roster` and `allowedAgents` are string arrays; `serverUrl` is a
  string; `version` is a string (see §3.4 for the version-less degraded case).
- No extra keys, no banner, no `v` prefix, no surrounding text.

**Default mode** (`json` absent / `false` / `undefined`):

- Result text is exactly `JSON.stringify(payload, null, 2)` — 2-space indented, **byte-identical**
  to today's output.
- Parsed key **set and order** are identical to compact mode. The two modes differ **only** in
  serialization.

**Result envelope:** in both modes the content is returned via the existing `ok(text)` helper, i.e.
`{ content: [{ type: "text", text }] }`. A successful `ok(text)` result does **not** set `isError`;
consumers MUST assert `result.isError !== true` (a normal result may simply omit the property, so
asserting "the property is absent" is not a valid check). Nothing is written directly to
`process.stdout`.

## 4. Data Flow

**Compact path (`{ json: true }`):**

1. MCP client calls `engine_status` with `arguments: { json: true }`.
2. Handler `await client.health()` → `{ healthy, version }`; `await client.agents()` → `[{name}, …]`.
3. Handler builds the five-key `payload` (fixed order).
4. `args.json === true` → `ok(JSON.stringify(payload))` — one line.
5. Client receives a text block containing a single line of JSON; script-side `JSON.parse` succeeds.

**Default path (`arguments: {}` / `{ json: false }` / `{ json: undefined }`):**

1–3. Identical through payload construction.
4. `args.json` falsy → `ok(JSON.stringify(payload, null, 2))` — the same block as before this change.
5. No observable difference from the pre-change handler.

**Out of scope:** the step that reaches the handler always has an `arguments` object. A call that
omits `arguments` never reaches step 1 — it is rejected with `-32602` by platform validation (§3.2)
and is neither tested nor "fixed" here.

**Error path (either mode):**

1. `client.health()` or `client.agents()` throws (server down, HTTP error, timeout).
2. Handler catches, returns `ok(JSON.stringify({ server_up: false, error: (e as Error).message, serverUrl: cfg.serverUrl }, null, 2))`.
3. This is unchanged by the `json` flag — see §5.

## 5. Error-Path Contract (normative)

- The catch block is **not modified** by this feature.
- On failure the result text is exactly
  `JSON.stringify({ server_up: false, error, serverUrl }, null, 2)`, where `error` is
  `(e as Error).message` and `serverUrl` is `cfg.serverUrl`.
- Emitted key order is exactly `server_up`, `error`, `serverUrl` in both modes.
- The error path is **flag-independent**: a call with `{ json: true }` that hits the error path
  returns the same pretty-printed error object as a call with `arguments: {}`. It does **not** throw,
  does **not** emit a partial success payload, and does **not** set `isError`
  (assert `result.isError !== true`).
- The error shape has three keys (`server_up`, `error`, `serverUrl`) — it is explicitly **not** the
  five-key success shape and must not be forced into it.

## 6. Edge Cases & Errors

| Case | Handling |
|---|---|
| `engine_status` called with `arguments: {}` | `args.json` is `undefined` → default mode. Output unchanged. |
| `{ json: false }` or `{ json: undefined }` | Default mode; byte-identical to `arguments: {}`. |
| `arguments` field omitted entirely | Rejected by MCP/zod validation with `-32602 Invalid arguments` **before** the handler. Pre-existing platform behaviour, **out of scope**, MUST NOT be "fixed"; NOT equivalent to `{}` (§3.2). |
| `{ json: true }` and engine healthy with a string `version` | Single-line JSON; own-key order exactly `server_up, version, agent_roster, serverUrl, allowedAgents`. |
| `{ json: true }` but `health.version` is `undefined` | `JSON.stringify` omits `version` in **both** modes; degraded key order `server_up, agent_roster, serverUrl, allowedAgents`, identical in both modes. Five-key guarantee scoped to the normal case (§3.4). |
| Non-boolean `json` (e.g. string, number) | Rejected by the MCP/zod input validation layer before the handler runs; the handler only ever sees `boolean \| undefined`. |
| Engine down / HTTP error / timeout, with `{ json: true }` or `arguments: {}` | §5 error path; pretty-printed three-key object; no throw. |
| `agent_roster` / `allowedAgents` empty arrays | Serialized as `[]` in both modes; key still present in compact mode. |
| Values containing `"` or `\` | Handled by `JSON.stringify`; output remains valid parseable JSON in both modes. |
| Windows paths / cwd | Not applicable: no filesystem or path handling is added by this feature. |

## 7. Non-Goals

- Adding an **eighth MCP tool** (e.g. `engine_status_json`). Explicitly forbidden.
- Adding a `json` parameter to any tool other than `engine_status`.
- Adding a CLI argv `--json` parser; MCP inputs are the only surface.
- Changing field values, sources, names, or order of the payload keys.
- Changing the error-path shape, pretty-printing, or `isError` semantics.
- **Tolerating a missing `arguments` field / relaxing pre-existing input validation** (§3.2).
- Adding dependencies, network I/O, secrets, or a build step.
- Pretty-print width other than the existing 2 spaces in default mode.

## 8. Test Plan

Proven by the exact file `mcp/delegation/test/json-flag.test.ts` (added by TICKET-2), run with
`node --test` from `mcp/delegation`. No glob/pattern: the exact filename is required.

**Harness — compose two existing patterns (they live in different files):**

- `test/tools.test.ts` demonstrates **only** the `InMemoryTransport` wiring
  (`InMemoryTransport.createLinkedPair()` + `createServer(root)` + `Client`). It does **not** stub
  the engine.
- `test/http.test.ts` demonstrates the local `node:http` **engine stub**, and `test/config.test.ts`
  demonstrates writing `DELEGATE_CONFIG.json` into a temp root.
- The new test MUST **compose** these: start the `node:http` stub engine (the `http.test.ts`
  pattern), write its URL into the temp root's `DELEGATE_CONFIG.json` (the `config.test.ts`
  pattern), then drive the real `engine_status` handler through the `InMemoryTransport` client (the
  `tools.test.ts` pattern). No external network, no warm `opencode serve`.

**Tests to implement:**

1. **Compact success + key order:** `callTool("engine_status", { json: true })` → take
   `content[0].text`; assert it contains no `\r`/`\n`; `JSON.parse(text)` succeeds; and
   `assert.deepEqual(Object.keys(parsed), ["server_up", "version", "agent_roster", "serverUrl", "allowedAgents"])`
   — **order-sensitive**; a sorted-key comparison does NOT count.
2. **Compact values:** parsed `server_up === true`, `version` equals the stub's version,
   `agent_roster` equals the stub's agent names, `serverUrl` equals the configured stub URL,
   `allowedAgents` equals the configured allowlist.
3. **Empty-arguments default:** `callTool("engine_status", {})` → text is 2-space indented (contains
   `"\n  "`); and `Object.keys(parsed)` deep-equals the **same** exact five-key ordered array as
   test 1. The self-referential check `text === JSON.stringify(JSON.parse(text), null, 2)` may be
   used as an *additional* formatting check but MUST NOT be the evidence for key order.
4. **Explicit-false default:** `{ json: false }` output is byte-identical to the `arguments: {}`
   output.
5. **Cross-mode key equality (order included):** the `Object.keys(...)` arrays of `{ json: true }`,
   `{}`, and `{ json: false }` deep-equal each other and the normative five-key array (key-drift
   guard).
6. **Error path (both modes):** make the engine fail (point `serverUrl` at a closed port, or stub a
   500); call with `arguments: {}` and with `{ json: true }`; assert both parse to an object whose
   `Object.keys(...)` deep-equals `["server_up", "error", "serverUrl"]` with `server_up === false`;
   neither result throws; and assert `result.isError !== true` for both (do **not** assert the
   property is absent).
7. **Tool-contract regression:** confirm `test/tools.test.ts` *"the server registers exactly the
   seven v1 tools"* still passes unmodified and `listToolNames()` is unchanged (do not edit that
   file).
8. **Schema guard via `client.listTools()`:** call `const { tools } = await client.listTools();` —
   this API exposes each tool's JSON `inputSchema`. Assert exactly seven tools with the expected
   names; that `engine_status.inputSchema.properties.json` exists (boolean) and `json` is **not**
   listed in that schema's `required` (or `required` is absent); and that **every other tool's
   `inputSchema` has no `json` property** (i.e. only `engine_status` gained it).
9. **Version-less degraded case:** stub `/global/health` to return `{ healthy: true }` with no
   `version`; call with `{ json: true }` and with `arguments: {}`; assert `version` is absent in both
   and `Object.keys(parsed)` deep-equals `["server_up", "agent_roster", "serverUrl", "allowedAgents"]`
   in both, identical across modes (§3.4).
10. **Missing-`arguments` is NOT tested as a success:** do not add any test that calls
    `callTool("engine_status")` with no `arguments` object expecting a result — that path is
    platform validation and out of scope (§3.2). If asserted at all, it must be asserted to be
    rejected, not to succeed.

A red flag is treated as a failure: any test that hardcodes a version instead of reading the stub,
uses a sorted-key comparison as its order evidence, weakens the seven-tools assertion, omits the
newline-absence check, or expects a missing `arguments` to succeed, does not satisfy this spec.