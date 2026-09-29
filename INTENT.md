# INTENT — `--json` output mode for the delegation MCP `engine_status` tool

- **Date:** 2026-09-29
- **Status:** Autonomous build (no human available)
- **Target:** `mcp/delegation/src/index.ts` — the `engine_status` tool handler ONLY
- **Tickets:** `tickets/TICKET-1.md` (implementation), `tickets/TICKET-2.md` (verification)

## Goal

Add a `--json` output-mode flag to the delegation MCP's `engine_status` tool.

- **Without the flag** (`engine_status` called with `arguments: {}`, or `{ json: false }`): behaviour
  is byte-for-byte unchanged from today — the pretty-printed multi-line JSON object. Omitting the
  `arguments` field entirely is rejected by MCP tool-input validation *before* the handler runs; that
  is pre-existing platform behaviour, NOT part of this contract, and MUST NOT be "fixed".
- **With the flag** (`{ json: true }`): the handler returns a **single-line** JSON object containing
  exactly the fields `{server_up, version, agent_roster, serverUrl, allowedAgents}` and nothing else.

**Scope is strictly limited to the `engine_status` tool handler in `mcp/delegation/src/index.ts`.**

## Contract (normative)

### Input schema

```ts
inputSchema: { json: z.boolean().optional() }
```

- The flag is exposed as an **MCP tool input parameter** named `json` (booleans are how MCP tool
  inputs carry flags). Calling the tool with `{}` (i.e. `arguments: {}`) keeps today's behaviour.
- The `--json` spelling in the feature request is the human-facing flag name; over the MCP protocol
  the equivalent is the boolean input `json: true`.

### Output — compact mode (`json: true`)

- **Exactly one line** of stdout-equivalent content: `JSON.stringify(payload)` with **no indentation**
  and **no trailing newline inside the string**.
- **Exactly these five keys**, in this order: `server_up`, `version`, `agent_roster`, `serverUrl`,
  `allowedAgents`. "…and nothing else" means no `error` key in the success payload, no extra
  diagnostic fields.
- `server_up` is a boolean; `version` a string; `agent_roster` a string array; `serverUrl` a string;
  `allowedAgents` a string array.
- `JSON.parse(result)` MUST succeed and yield an object whose key set is exactly the five names above.

### Output — default mode (flag absent / `json` false/undefined)

- MUST remain the existing behaviour: `JSON.stringify(payload, null, 2)` (2-space pretty print) with
  the same five keys.
- On failure it MUST remain the existing catch-path shape
  `{ server_up: false, error, serverUrl }` — unchanged.

### Regression guard

- The compact payload MUST NOT gain, lose, rename, **or reorder** keys relative to the default
  payload; the two modes differ **only** in serialization (compact vs. 2-space indented).
- Key order is normative and MUST be decidable in review: tests assert `Object.keys(...)` deep-equals
  `["server_up","version","agent_roster","serverUrl","allowedAgents"]` in that order for **both**
  modes. Sorted-key assertions, or self-referential formatting checks such as
  `text === JSON.stringify(JSON.parse(text), null, 2)`, do NOT satisfy this.
- A `json: true` call that hits the error path MUST stay on the existing catch contract
  (`{server_up:false,error,serverUrl}`); it must not throw and must not emit a partial payload.

## Constraints

- Keep the existing **"exactly seven MCP tools"** contract intact. **No eighth tool**; do not touch
  `TOOL_NAMES`, `listToolNames()`, or any other tool registration/schema.
- Only the `engine_status` handler body (plus its `inputSchema`) in `mcp/delegation/src/index.ts` may
  change. No new source files, no changes to `board.ts`, `config.ts`, `http.ts`, `spawn.ts`,
  `handoff.ts`, `version.ts`, `git.ts`.
- ESM + TypeScript run via Node native type stripping (`node src/index.ts`, no build step). Relative
  imports keep the `.ts` extension.
- No new runtime dependencies; `JSON` + `zod` (already imported) suffice.
- No network I/O added; no credentials/secrets read or written.
- Tests use the Node built-in runner: `node --test` from `mcp/delegation`.
- All pre-existing tests MUST still pass, especially:
  `test/tools.test.ts` "the server registers exactly the seven v1 tools".
- Host environment is **Windows / PowerShell**; any path handling must stay cross-platform.

## Success Criteria

1. `engine_status` with `{ json: true }` returns a **single-line** JSON object whose keys are exactly
   `server_up, version, agent_roster, serverUrl, allowedAgents` — `JSON.parse` round-trips it.
2. `engine_status` with `arguments: {}` (and with `{ json: false }`) returns the **unchanged** pretty-printed
   payload; the parsed **key order and key set** are identical to compact mode and equal to today's HEAD order `server_up, version, agent_roster, serverUrl, allowedAgents`.
3. The compact string contains **no newline** (`\n`) characters.
4. An automated test exists that exercises the handler in both modes against a stubbed client/config
   and asserts (a) compact parse succeeds with the exact five-key set, (b) compact has no newline,
   (c) default mode is still 2-space indented, (d) the key sets match.
5. `node --test` (from `mcp/delegation`) exits 0 with every suite green, including the exactly-seven-
   tools assertion.
6. `git diff --stat` touches only `mcp/delegation/src/index.ts` (TICKET-1) and the one new file
   `mcp/delegation/test/json-flag.test.ts` (TICKET-2).

## Assumptions (autonomous mode — no human available)

1. "the delegation MCP" means the server package at `mcp/delegation`.
2. The `--json` flag is surfaced as a **boolean MCP input parameter `json`** on the `engine_status`
   tool; MCP has no argv, so `--json` maps to `json: true`. No CLI argv parsing is added.
3. "prints a single JSON object" means the tool **result content** is one line of JSON; since the
   existing handler returns a text content block, compact mode is `JSON.stringify(payload)` (no
   indent) placed in that same text block. It is not written to process stdout directly.
4. "…and nothing else" means the five listed keys only — no extra fields in the success payload.
5. No `v` prefix or banner text is added around the JSON.
6. The compact payload uses the exact same field values/sources as today (`client.health()`,
   `client.agents()`, `cfg.serverUrl`, `cfg.allowedAgents`); only formatting changes.
7. Because `allowedAgents` is already present in today's output, it is part of the required key set
   and simply must survive in compact mode.
8. Backwards compatibility wins: `json` absent from `arguments` (i.e. `{}`), `json: false`, or
   `json: undefined` must leave the existing output untouched, so no existing consumer breaks.
