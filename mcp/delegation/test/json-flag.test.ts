import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer as createMcpServer } from "../src/index.ts";

const ORDER = ["server_up", "version", "agent_roster", "serverUrl", "allowedAgents"];
const ORDER_NO_VERSION = ["server_up", "agent_roster", "serverUrl", "allowedAgents"];

type ToolText = { content: Array<{ type: string; text: string }>; isError?: boolean };

interface StubOptions {
  health?: unknown;
  healthStatus?: number;
  agents?: unknown;
  agentsStatus?: number;
}

async function withEngine(
  opts: StubOptions,
  fn: (ctx: { url: string; root: string; client: Client; close: () => void }) => Promise<void>,
) {
  const hits = { health: 0, agents: 0 };
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url === "/global/health") {
        hits.health++;
        res.writeHead(opts.healthStatus ?? 200, { "content-type": "application/json" });
        res.end(JSON.stringify(opts.health ?? { healthy: true, version: "1.18.30" }));
      } else if (req.url === "/agent") {
        hits.agents++;
        res.writeHead(opts.agentsStatus ?? 200, { "content-type": "application/json" });
        res.end(JSON.stringify(opts.agents ?? [{ name: "architect" }, { name: "general" }]));
      } else {
        res.writeHead(404, { "content-type": "application/json" });
        res.end("{}");
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const url = `http://127.0.0.1:${port}`;

  const root = mkdtempSync(join(tmpdir(), "jsonflag-"));
  writeFileSync(
    join(root, "DELEGATE_CONFIG.json"),
    JSON.stringify({ serverUrl: url, allowedAgents: ["architect", "general"] }),
  );

  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const mcp = createMcpServer(root);
  await mcp.connect(serverT);
  const client = new Client({ name: "qa", version: "0" });
  await client.connect(clientT);

  try {
    await fn({ url, root, client, close: () => server.close() });
  } finally {
    server.close();
  }
}

async function status(client: Client, args: Record<string, unknown>): Promise<ToolText> {
  return (await client.callTool({ name: "engine_status", arguments: args })) as unknown as ToolText;
}

function textOf(r: ToolText): string {
  assert.equal(r.content.length, 1, "expected exactly one content block");
  assert.equal(r.content[0].type, "text");
  return r.content[0].text;
}

// 1. Compact success: one line, no newline, order-sensitive exact keys.
test("compact success: single line, no CR/LF, exact ordered five keys", async () => {
  await withEngine({}, async ({ client }) => {
    const text = textOf(await status(client, { json: true }));
    assert.equal(/[\r\n]/.test(text), false, `compact text must not contain CR/LF: ${JSON.stringify(text)}`);
    const parsed = JSON.parse(text);
    assert.deepEqual(Object.keys(parsed), ORDER, "own-key order must be the normative five-key order");
  });
});

// 2. Compact values match the stub/config.
test("compact values reflect stub health + agents and configured url/allowlist", async () => {
  await withEngine({}, async ({ client, url }) => {
    const parsed = JSON.parse(textOf(await status(client, { json: true })));
    assert.equal(parsed.server_up, true);
    assert.equal(parsed.version, "1.18.30");
    assert.deepEqual(parsed.agent_roster, ["architect", "general"]);
    assert.equal(parsed.serverUrl, url);
    assert.deepEqual(parsed.allowedAgents, ["architect", "general"]);
    assert.equal(parsed.agent_roster.length, 2);
  });
});

// 3. Empty-arguments default = pretty two-space, same ordered keys.
test("empty-arguments default: 2-space indented with same ordered five keys", async () => {
  await withEngine({}, async ({ client }) => {
    const text = textOf(await status(client, {}));
    assert.ok(text.includes("\n  "), "default output must be 2-space indented");
    assert.deepEqual(Object.keys(JSON.parse(text)), ORDER);
    assert.equal(text, JSON.stringify(JSON.parse(text), null, 2));
  });
});

// 4. {json:false} and {json:undefined} byte-identical to {}.
test("{json:false} and {json:undefined} are byte-identical to {}", async () => {
  await withEngine({}, async ({ client }) => {
    const empty = textOf(await status(client, {}));
    const flag = textOf(await status(client, { json: false }));
    const undef = textOf(await status(client, { json: undefined }));
    assert.equal(flag, empty, "{json:false} must be byte-identical to {}", {});
    assert.equal(undef, empty, "{json:undefined} must be byte-identical to {}", {});
  });
});

// 5. Cross-mode key equality (order included) + compact values preserved.
test("cross-mode keys deep-equal (no key drift) and values identical", async () => {
  await withEngine({}, async ({ client }) => {
    const compact = JSON.parse(textOf(await status(client, { json: true })));
    const empty = JSON.parse(textOf(await status(client, {})));
    const flag = JSON.parse(textOf(await status(client, { json: false })));
    assert.deepEqual(Object.keys(compact), ORDER);
    assert.deepEqual(Object.keys(empty), ORDER);
    assert.deepEqual(Object.keys(flag), ORDER);
    assert.deepEqual(compact, empty);
    assert.deepEqual(empty, flag);
  });
});

// 6. Schema guard via listTools().
test("schema guard: only engine_status has optional boolean json; nine tools", async () => {
  await withEngine({}, async ({ client }) => {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 9, "exactly nine tools must be registered");
    assert.deepEqual(
      tools.map((t) => t.name).sort(),
      [
        "board_read", "board_update", "delegate_parallel", "delegate_task", "engine_abort",
        "engine_halt_and_revert", "engine_status", "ticket_read", "ticket_write",
      ],
    );
    const es = tools.find((t) => t.name === "engine_status");
    assert.ok(es, "engine_status tool must exist");
    const schema = es.inputSchema as { properties?: Record<string, { type?: string }>; required?: string[] };
    const jsonProp = schema.properties?.json;
    assert.ok(jsonProp, "engine_status.inputSchema.properties.json must exist");
    assert.equal(jsonProp.type, "boolean", "json property must be boolean");
    const required = schema.required ?? [];
    assert.equal(required.includes("json"), false, "json must not be required");
    for (const t of tools) {
      if (t.name === "engine_status") continue;
      const props = (t.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
      assert.equal("json" in props, false, `tool ${t.name} must not expose a json property`);
    }
  });
});

// 7. Error path in both modes.
test("error path: both modes, three ordered keys, no throw, isError !== true", async () => {
  await withEngine({ healthStatus: 500 }, async ({ client }) => {
    const empty = await status(client, {});
    const compact = await status(client, { json: true });
    for (const [label, r] of [["{}", empty], ["{json:true}", compact]] as const) {
      const text = textOf(r);
      const parsed = JSON.parse(text);
      assert.deepEqual(Object.keys(parsed), ["server_up", "error", "serverUrl"], `${label} error key order`);
      assert.equal(parsed.server_up, false, `${label} server_up false`);
      assert.equal(typeof parsed.error, "string");
      assert.equal(r.isError !== true, true, `${label} isError must not be true`);
      assert.ok(text.includes("\n  "), `${label} error output must stay pretty-printed`);
    }
    assert.deepEqual(JSON.parse(textOf(compact)), JSON.parse(textOf(empty)), "error path must be flag-independent");
  });
});

// 8. Version-less degraded case.
test("version-less degraded: version omitted identically in both modes", async () => {
  await withEngine({ health: { healthy: true } }, async ({ client }) => {
    const compact = textOf(await status(client, { json: true }));
    const empty = textOf(await status(client, {}));
    const c = JSON.parse(compact);
    const e = JSON.parse(empty);
    assert.equal("version" in c, false, "compact degraded output must omit version");
    assert.equal("version" in e, false, "default degraded output must omit version");
    assert.deepEqual(Object.keys(c), ORDER_NO_VERSION);
    assert.deepEqual(Object.keys(e), ORDER_NO_VERSION);
    assert.deepEqual(c, e);
    assert.equal(/[\r\n]/.test(compact), false);
  });
});

// 9. TOOL_NAMES contract intact (regression).
test("listToolNames() still returns exactly the nine v1.2 tools in order", async () => {
  const { listToolNames } = await import("../src/index.ts");
  assert.deepEqual(listToolNames(), [
    "delegate_task", "delegate_parallel", "engine_status", "engine_abort",
    "engine_halt_and_revert",
    "board_read", "board_update", "ticket_write", "ticket_read",
  ]);
});
