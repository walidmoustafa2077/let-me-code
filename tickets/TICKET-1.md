# TICKET-1: Add optional `json` input to `engine_status` for single-line output

- depends_on: none

## Deliverable

Implement the compact-output `json` flag on the `engine_status` tool, per `docs/specs/json-flag.md` and `CONSTRAINTS.md`.

**Files:** Modify `mcp/delegation/src/index.ts` **only** (the `engine_status` registration). Do **not** create any new source file.

**Schema change (exact):** `engine_status`'s `inputSchema` goes from `{}` to

```ts
inputSchema: { json: z.boolean().optional() }
```

`json` MUST be optional and MUST be the only added property. No `.default(...)` may be added — omitting the `arguments` field entirely is rejected by pre-existing MCP/zod validation (`-32602 Invalid arguments`) before the handler runs; that is out of scope and MUST NOT be "fixed". `description` is unchanged. The other six tools' `inputSchema`s MUST be untouched.

**Handler change (exact):** build the five-key payload once, then choose the serializer; leave the `catch` block byte-identical.

```ts
async (args) => {
  try {
    const health = await client.health();
    const agents = await client.agents();
    const payload = {
      server_up: health.healthy, version: health.version,
      agent_roster: agents.map((a) => a.name), serverUrl: cfg.serverUrl,
      allowedAgents: cfg.allowedAgents,
    };
    return ok(args.json ? JSON.stringify(payload) : JSON.stringify(payload, null, 2));
  } catch (e) {
    return ok(JSON.stringify({ server_up: false, error: (e as Error).message, serverUrl: cfg.serverUrl }, null, 2));
  }
},
```

- `json === true` → `JSON.stringify(payload)`: **one line**, no indentation, no `\n`; own-key order exactly `server_up, version, agent_roster, serverUrl, allowedAgents`.
- Default path = `arguments: {}`, `{ json: false }`, or `{ json: undefined }` → `JSON.stringify(payload, null, 2)`: **byte-identical** to today's output. (Omitting `arguments` entirely never reaches the handler — platform `-32602` — and is out of scope; do not "fix" it.)
- If `health.version` is `undefined`, `JSON.stringify` omits `version` in both modes; that degraded case is defined in spec §3.4 / CONSTRAINT C3 and is **not** special-cased here.
- The error path is unchanged and is **flag-independent** (a failing `{ json: true }` call returns the same three-key pretty object, no throw, no `isError`).

**Must NOT:** add or remove any MCP tool; touch `TOOL_NAMES`, `listToolNames`, other tools' schemas, the `ok`/`fail` helpers, the entrypoint guard, `package.json`, or any file other than `mcp/delegation/src/index.ts`; add any import or dependency; add a zod `.default(...)` or any tolerance for a missing `arguments` object.

## Test

- `node mcp/delegation/src/index.ts` still starts the stdio server when launched with no argv; `--version` still works.
- Manually confirm via an in-memory client that `engine_status` with `arguments: { json: true }` returns one line with exactly the five keys in the normative order and no `\n`, while `arguments: {}` and `{ json: false }` return the 2-space pretty block with the same ordered keys.
- Existing `node --test` suite (especially the exactly-seven-tools assertion) still passes.
- Verified against `CONSTRAINTS.md` C1, C2, C3, C4, C5, C6, C8. Formal automated coverage lands in TICKET-2.

