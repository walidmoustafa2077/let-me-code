# TICKET-2: Verify `json` mode: compact, default, error paths, schema guard, and seven-tools regression

- depends_on: TICKET-1

## Deliverable

Add the verification suite `mcp/delegation/test/json-flag.test.ts` (Node `node:test` + `node:assert/strict`) proving TICKET-1's implementation, per `docs/specs/json-flag.md` §8 and `CONSTRAINTS.md`. **This ticket MUST NOT start before TICKET-1 is Done** (it asserts against the implemented handler). The file path is exact — `mcp/delegation/test/json-flag.test.ts` (no glob/pattern).

**Files:** Create `mcp/delegation/test/json-flag.test.ts` only. Do not modify `tools.test.ts` or any other test.

**Test harness — compose two patterns that live in different files:**

- `test/tools.test.ts` demonstrates **only** the `InMemoryTransport` wiring (`InMemoryTransport.createLinkedPair()` + `createServer(root)` + `Client`); it does **not** stub the engine.
- `test/http.test.ts` demonstrates the local `node:http` engine stub, and `test/config.test.ts` demonstrates writing `DELEGATE_CONFIG.json` into a temp root.
- The new test MUST **compose** them: start the `node:http` stub (the `http.test.ts` pattern), write its URL into the temp root's `DELEGATE_CONFIG.json` (the `config.test.ts` pattern), then drive the real handler through the `InMemoryTransport` client (the `tools.test.ts` pattern). No external network, no warm `opencode serve`.

**Tests to implement:**

1. **Compact success + key order:** `callTool("engine_status", { json: true })` → `content[0].text`; assert it contains no `\r`/`\n`; `JSON.parse(text)` succeeds; `assert.deepEqual(Object.keys(parsed), ["server_up","version","agent_roster","serverUrl","allowedAgents"])` — **order-sensitive**; a sorted-key comparison does NOT count.
2. **Compact values:** parsed `server_up === true`; `version` equals the stub version; `agent_roster` equals the stub agent names; `serverUrl` equals the configured stub URL; `allowedAgents` equals the configured allowlist.
3. **Empty-arguments default:** `callTool("engine_status", {})` → text is 2-space indented (contains `"\n  "`); `Object.keys(parsed)` deep-equals the **same** exact five-key ordered array as test 1. (`text === JSON.stringify(JSON.parse(text), null, 2)` may be an extra formatting check but MUST NOT be the key-order evidence.)
4. **Explicit-false default:** `{ json: false }` output is byte-identical to the `arguments: {}` output.
5. **Cross-mode key equality (order included):** the `Object.keys(...)` arrays of `{json:true}`, `{}`, and `{json:false}` deep-equal each other and the normative five-key array.
6. **Error path (both modes):** make the engine fail (closed port or stubbed 500); call with `arguments: {}` and `{ json: true }`; assert both parse to an object with `Object.keys(...)` deep-equal to `["server_up","error","serverUrl"]` and `server_up === false`; no throw; and `result.isError !== true` for both (do **not** assert the property is absent).
7. **Tool-contract regression:** confirm the pre-existing `tools.test.ts` *"exactly the seven v1 tools"* still passes and `listToolNames()` is unchanged (do not edit that file).
8. **Schema guard via `client.listTools()`:** `const { tools } = await client.listTools();` exposes each tool's JSON `inputSchema`. Assert exactly seven tools with the expected names; `engine_status.inputSchema.properties.json` exists (boolean) and `json` is **not** in the schema's `required` (or `required` is absent); every other tool's `inputSchema` has **no** `json` property (only `engine_status` gained it).
9. **Version-less degraded case:** stub `/global/health` → `{ healthy: true }` (no `version`); call with `{ json: true }` and with `arguments: {}`; assert `version` absent in both and `Object.keys(parsed)` deep-equals `["server_up","agent_roster","serverUrl","allowedAgents"]` in both, identical across modes (spec §3.4 / C3).
10. **Do NOT assert a missing `arguments` succeeds:** no test may call `callTool("engine_status")` without an `arguments` object and expect a result — that is platform `-32602` validation, out of scope. (If asserted, assert rejection, not success.)

## Test

- Run `node --test` from `mcp/delegation`; **all** suites green, including `tools.test.ts` and the new `json-flag.test.ts`.
- Report the raw summary. If any test fails, report `blocked` with exact output — never a false pass.
- Confirm `git diff --stat` touches only `mcp/delegation/src/index.ts` (TICKET-1) and `mcp/delegation/test/json-flag.test.ts`.
- Verified against `CONSTRAINTS.md` C1, C2, C3, C4, C5, C7.

