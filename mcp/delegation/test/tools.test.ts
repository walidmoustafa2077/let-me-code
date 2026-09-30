import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, listToolNames } from "../src/index.ts";

const NINE_TOOLS = [
  "delegate_task",
  "delegate_parallel",
  "engine_status",
  "engine_abort",
  "engine_halt_and_revert",
  "board_read",
  "board_update",
  "ticket_write",
  "ticket_read",
];

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

function json(o: unknown): Response {
  return new Response(JSON.stringify(o), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function connect(dir: string): Promise<Client> {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await createServer(dir).connect(serverT);
  const client = new Client({ name: "t", version: "0" });
  await client.connect(clientT);
  return client;
}

test("the server registers exactly the nine v1.2 tools in order", () => {
  assert.deepEqual(listToolNames(), NINE_TOOLS);
});

test("all nine tools are registered through the MCP client", async () => {
  const { tools } = await (await connect(repo())).listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [...NINE_TOOLS].sort());
});

test("ticket_write then ticket_read round-trips through the MCP client", async () => {
  const dir = repo();
  const client = await connect(dir);

  await client.callTool({ name: "ticket_write", arguments: { id: "TICKET-1", title: "version flag", body: "add it" } });
  const read = await client.callTool({ name: "ticket_read", arguments: { id: "TICKET-1" } });
  const text = (read.content as Array<{ type: string; text: string }>)[0].text;
  assert.match(text, /version flag/);

  const board = await client.callTool({ name: "board_read", arguments: {} });
  assert.ok((board.content as Array<{ text: string }>)[0].text.includes("todo"));
});

test("board_update moves a ticket's column", async () => {
  const dir = repo();
  const client = await connect(dir);
  await client.callTool({ name: "ticket_write", arguments: { id: "TICKET-1", title: "x", body: "y" } });
  const r = await client.callTool({ name: "board_update", arguments: { ticket: "TICKET-1", column: "In Progress" } });
  assert.match((r.content as Array<{ text: string }>)[0].text, /inProgress/);
});

test("delegate_parallel round-trips through the MCP client", { timeout: 20000 }, async () => {
  const dir = repo();
  const engine = createHttpServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url === "/session") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: "ses_par" }));
      } else if (req.url?.endsWith("/message")) {
        const marker = body.includes("ALPHA") ? "alpha" : "beta";
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({
          info: { id: "m" },
          parts: [{ type: "text", text: `${marker}\n### HANDOFF\nstatus: done\nsummary: ${marker} done\nartifacts: none\nnext: none\n` }],
        }));
      } else {
        res.writeHead(404, { "content-type": "application/json" });
        res.end("{}");
      }
    });
  });
  await new Promise<void>((r) => engine.listen(0, "127.0.0.1", r));
  const addr = engine.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  writeFileSync(
    join(dir, "DELEGATE_CONFIG.json"),
    JSON.stringify({ serverUrl: `http://127.0.0.1:${port}`, allowedAgents: ["architect", "general"] }),
  );

  try {
    const client = await connect(dir);
    const r = await client.callTool({
      name: "delegate_parallel",
      arguments: {
        tasks: [
          { agent: "architect", prompt: "ALPHA task" },
          { agent: "general", prompt: "BETA task" },
        ],
      },
    });
    const text = (r.content as Array<{ text: string }>)[0].text;
    const parsed = JSON.parse(text) as Array<{ status: string; handoff: { summary: string } }>;
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].status, "done");
    assert.equal(parsed[0].handoff.summary, "alpha done");
    assert.equal(parsed[1].handoff.summary, "beta done");
  } finally {
    engine.close();
  }
});

test("engine_halt_and_revert round-trips through the MCP client", async () => {
  const dir = repo();
  writeFileSync(join(dir, "dirty.txt"), "uncommitted\n");
  const client = await connect(dir);
  const r = await client.callTool({ name: "engine_halt_and_revert", arguments: { reason: "test halt" } });
  const parsed = JSON.parse((r.content as Array<{ text: string }>)[0].text) as {
    reverted: boolean;
    snapshot_path: string | null;
  };
  assert.equal(parsed.reverted, true);
  assert.ok(parsed.snapshot_path && parsed.snapshot_path.endsWith(".patch"));
});
