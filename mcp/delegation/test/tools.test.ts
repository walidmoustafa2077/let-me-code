import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, listToolNames } from "../src/index.ts";

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

test("the server registers exactly the seven v1 tools", () => {
  assert.deepEqual(listToolNames().sort(), [
    "board_read", "board_update", "delegate_task", "engine_abort", "engine_status",
    "ticket_read", "ticket_write",
  ]);
});

test("ticket_write then ticket_read round-trips through the MCP client", async () => {
  const dir = repo();
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const server = createServer(dir);
  await server.connect(serverT);
  const client = new Client({ name: "t", version: "0" });
  await client.connect(clientT);

  await client.callTool({ name: "ticket_write", arguments: { id: "TICKET-1", title: "version flag", body: "add it" } });
  const read = await client.callTool({ name: "ticket_read", arguments: { id: "TICKET-1" } });
  const text = (read.content as Array<{ type: string; text: string }>)[0].text;
  assert.match(text, /version flag/);

  const board = await client.callTool({ name: "board_read", arguments: {} });
  assert.ok((board.content as Array<{ text: string }>)[0].text.includes("todo"));
});

test("board_update moves a ticket's column", async () => {
  const dir = repo();
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await createServer(dir).connect(serverT);
  const client = new Client({ name: "t", version: "0" });
  await client.connect(clientT);
  await client.callTool({ name: "ticket_write", arguments: { id: "TICKET-1", title: "x", body: "y" } });
  const r = await client.callTool({ name: "board_update", arguments: { ticket: "TICKET-1", column: "In Progress" } });
  assert.match((r.content as Array<{ text: string }>)[0].text, /inProgress/);
});
