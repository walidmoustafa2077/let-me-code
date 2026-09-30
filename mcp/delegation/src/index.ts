import { mkdir, readFile, writeFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { initBoard, moveTicket, readBoard, type Column } from "./board.ts";
import { loadConfig, repoRoot } from "./config.ts";
import { OpenCodeClient } from "./http.ts";
import { haltAndRevert } from "./revert.ts";
import { delegateParallel, delegateTask } from "./spawn.ts";
import { maybePrintVersion, readPackageVersion } from "./version.ts";

const TOOL_NAMES = [
  "delegate_task", "delegate_parallel", "engine_status", "engine_abort",
  "engine_halt_and_revert",
  "board_read", "board_update", "ticket_write", "ticket_read",
] as const;

export function listToolNames(): string[] {
  return [...TOOL_NAMES];
}

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function fail(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

const ticketsDir = (root: string) => `${root}/tickets`;

export function createServer(root: string = repoRoot()): McpServer {
  const server = new McpServer({ name: "delegation", version: readPackageVersion() });
  const cfg = loadConfig(root);
  const client = new OpenCodeClient(cfg);

  server.registerTool(
    "delegate_task",
    {
      description: "Spawn a child agent on the warm opencode server and return only its HANDOFF, diff stat, and changed files.",
      inputSchema: {
        agent: z.string(),
        prompt: z.string(),
        contextFiles: z.array(z.string()).optional(),
        model: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const r = await delegateTask(root, cfg, client, {
          agent: args.agent, prompt: args.prompt, contextFiles: args.contextFiles, model: args.model,
        });
        return ok(JSON.stringify(r, null, 2));
      } catch (e) {
        return fail(`delegate_task failed: ${(e as Error).message}`);
      }
    },
  );

  server.registerTool(
    "delegate_parallel",
    {
      description: "Spawn multiple child agents concurrently in isolated ephemeral worktrees and return their aggregated HANDOFF and diff stats.",
      inputSchema: {
        tasks: z.array(z.object({
          agent: z.string(),
          prompt: z.string(),
          contextFiles: z.array(z.string()).optional(),
          model: z.string().optional(),
        })),
      },
    },
    async (args) => {
      try {
        const res = await delegateParallel(root, cfg, client, args.tasks);
        return ok(JSON.stringify(res, null, 2));
      } catch (e) {
        return fail(`delegate_parallel failed: ${(e as Error).message}`);
      }
    },
  );

  server.registerTool(
    "engine_status",
    { description: "Report engine liveness, version, agent roster, and config.", inputSchema: { json: z.boolean().optional() } },
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
  );

  server.registerTool(
    "engine_abort",
    { description: "Abort an in-flight child session.", inputSchema: { session_id: z.string() } },
    async (args) => {
      try {
        const r = await client.abort(args.session_id);
        return ok(JSON.stringify(r));
      } catch (e) {
        return fail(`engine_abort failed: ${(e as Error).message}`);
      }
    },
  );

  server.registerTool(
    "engine_halt_and_revert",
    {
      description: "Emergency halt: abort all active child sessions, snapshot uncommitted working tree diff to .delegation/snapshots/, and revert to clean HEAD.",
      inputSchema: { reason: z.string().optional() },
    },
    async (args) => {
      try {
        const res = await haltAndRevert(root, client, args.reason);
        return ok(JSON.stringify(res, null, 2));
      } catch (e) {
        return fail(`engine_halt_and_revert failed: ${(e as Error).message}`);
      }
    },
  );

  server.registerTool(
    "board_read",
    { description: "Read BOARD.md as parsed JSON columns.", inputSchema: {} },
    async () => {
      try {
        await initBoard(root, "feature");
        return ok(JSON.stringify(await readBoard(root), null, 2));
      } catch (e) {
        return fail(`board_read failed: ${(e as Error).message}`);
      }
    },
  );

  server.registerTool(
    "board_update",
    {
      description: "Move a ticket to a column in BOARD.md (orchestrator only).",
      inputSchema: {
        ticket: z.string(),
        column: z.enum(["Todo", "In Progress", "In Review", "Blocked", "Done"]),
        note: z.string().optional(),
      },
    },
    async (args) => {
      try {
        await initBoard(root, "feature");
        const state = await moveTicket(root, args.ticket, args.column as Column, args.note);
        return ok(JSON.stringify(state, null, 2));
      } catch (e) {
        return fail(`board_update failed: ${(e as Error).message}`);
      }
    },
  );

  server.registerTool(
    "ticket_write",
    {
      description: "Write tickets/TICKET-N.md with optional depends_on. Does NOT touch BOARD.md (orchestrator reconciles the board via board_update).",
      inputSchema: {
        id: z.string(),
        title: z.string(),
        body: z.string(),
        depends_on: z.array(z.string()).optional(),
      },
    },
    async (args) => {
      try {
        await mkdir(ticketsDir(root), { recursive: true });
        const path = `${ticketsDir(root)}/${args.id}.md`;
        const deps = (args.depends_on ?? []).join(", ");
        const text = `# ${args.id}: ${args.title}\n\n- depends_on: ${deps || "none"}\n\n${args.body}\n`;
        await writeFile(path, text, "utf8");
        return ok(path);
      } catch (e) {
        return fail(`ticket_write failed: ${(e as Error).message}`);
      }
    },
  );

  server.registerTool(
    "ticket_read",
    { description: "Read a ticket's metadata and body.", inputSchema: { id: z.string() } },
    async (args) => {
      try {
        const path = `${ticketsDir(root)}/${args.id}.md`;
        const text = await readFile(path, "utf8");
        const deps = text.match(/depends_on:\s*(.*)/)?.[1] ?? "none";
        return ok(JSON.stringify({ id: args.id, depends_on: deps, body: text }, null, 2));
      } catch (e) {
        return fail(`ticket_read failed: ${(e as Error).message}`);
      }
    },
  );

  return server;
}

async function main() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("mcp/delegation/src/index.ts")) {
  if (maybePrintVersion()) {
    process.exit(0);
  }
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
