import { test } from "node:test";
import assert from "node:assert/strict";

// The client decides v1 vs v2 at runtime; a developer shell that points at a
// real project must not change what these tests exercise.
delete process.env.DELEGATION_ROOT;
delete process.env.DELEGATION_SERVER_URL;
delete process.env.OPENCODE_SERVER_PASSWORD;

import { defaultConfig } from "../src/config.ts";
import { OpenCodeClient } from "../src/http.ts";

type Route = (body: unknown, method: string) => { status?: number; json?: unknown; text?: string };

function stub(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const method = init?.method ?? "GET";
    calls.push(`${method} ${path}`);
    const route = routes[`${method} ${path}`] ?? routes[path];
    if (!route) {
      return new Response("not found", { status: 404 });
    }
    const out = route(init?.body ? JSON.parse(String(init.body)) : undefined, method);
    if (out.json !== undefined) {
      return new Response(JSON.stringify(out.json), {
        status: out.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(out.text ?? "", { status: out.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function client(fetchImpl: typeof fetch, autoStart = false) {
  const cfg = defaultConfig();
  cfg.serverUrl = "http://stub.invalid:4096";
  return new OpenCodeClient(cfg, fetchImpl, { root: process.cwd(), autoStart });
}

test("v2: a v1-shaped health call falls back to /api/info once", async () => {
  const { fetchImpl, calls } = stub({
    "/global/health": () => ({ status: 405, text: "method not allowed" }),
    "/api/info": () => ({ json: { version: "2.1.4" } })
  });

  const health = await client(fetchImpl).health();

  assert.deepEqual(health, { healthy: true, version: "2.1.4" });
  assert.deepEqual(calls, ["GET /global/health", "GET /api/info", "GET /api/info"]);
});

test("v2: the mode is cached after the first detection", async () => {
  const { fetchImpl, calls } = stub({
    "/global/health": () => ({ status: 405, text: "method not allowed" }),
    "/api/info": () => ({ json: { version: "2.1.4" } })
  });
  const c = client(fetchImpl);

  await c.health();
  await c.health();

  assert.equal(calls.filter((call) => call === "GET /global/health").length, 1);
  assert.equal(calls.filter((call) => call === "GET /api/info").length, 3);
});

test("v1: a healthy v1 server is never probed for /api/info", async () => {
  const { fetchImpl, calls } = stub({
    "/global/health": () => ({ json: { healthy: true, version: "1.4.0" } })
  });

  const health = await client(fetchImpl).health();

  assert.deepEqual(health, { healthy: true, version: "1.4.0" });
  assert.deepEqual(calls, ["GET /global/health"]);
});

test("v2: agents are read from data[].id", async () => {
  const { fetchImpl } = stub({
    "/global/health": () => ({ status: 405, text: "method not allowed" }),
    "/api/info": () => ({ json: { version: "2.1.4" } }),
    "/api/agent": () => ({ json: { location: {}, data: [{ id: "build" }, { name: "solo" }] } })
  });
  const c = client(fetchImpl);
  await c.health();

  assert.deepEqual(await c.agents(), [{ name: "build" }, { name: "solo" }]);
});

test("v2: createSession sends agent and a Model.Ref and returns data.id", async () => {
  const bodies: unknown[] = [];
  const { fetchImpl } = stub({
    "/global/health": () => ({ status: 405, text: "method not allowed" }),
    "/api/info": () => ({ json: { version: "2.1.4" } }),
    "POST /api/session": (body) => {
      bodies.push(body);
      return { json: { data: { id: "ses_1", title: "job:general" } } };
    }
  });
  const c = client(fetchImpl);
  await c.health();

  const id = await c.createSession("job:general", {
    agent: "general",
    model: { providerID: "opencode", modelID: "deepseek-v4.1-flash-free" }
  });

  assert.equal(id, "ses_1");
  assert.deepEqual(bodies, [
    {
      title: "job:general",
      agent: "general",
      model: { providerID: "opencode", id: "deepseek-v4.1-flash-free" }
    }
  ]);
});

test("v2: a prompt is queued, then polled until idle, collecting text parts", async () => {
  const bodies: unknown[] = [];
  const { fetchImpl, calls } = stub({
    "/global/health": () => ({ status: 405, text: "method not allowed" }),
    "/api/info": () => ({ json: { version: "2.1.4" } }),
    "/api/session/ses_1/prompt": (body) => {
      bodies.push(body);
      return { json: { data: { id: "msg_1" } } };
    },
    "/api/session/ses_1/message": () => ({
      json: {
        data: [
          { id: "msg_1", type: "user", text: "build it" },
          {
            id: "msg_2",
            type: "assistant",
            content: [
              { type: "reasoning", text: "thinking" },
              { type: "text", text: "Done. GATE: PASS" }
            ],
            time: { created: 1, completed: 2 }
          },
          { id: "msg_3", type: "idle", outcome: "succeeded", time: { created: 3 } }
        ],
        cursor: { previous: null, next: null }
      }
    })
  });
  const c = client(fetchImpl);
  await c.health();

  const result = await c.postMessage("ses_1", {
    agent: "general",
    parts: [{ type: "text", text: "build it" }]
  });

  assert.deepEqual(bodies, [{ text: "build it", delivery: "queue" }]);
  assert.deepEqual(result.parts, [{ type: "text", text: "Done. GATE: PASS" }]);
  assert.equal((result.info as { error?: string }).error, undefined);
  assert.equal(calls.filter((call) => call === "GET /api/session/ses_1/message").length, 1);
});

test("v2: a failed idle outcome surfaces as info.error", async () => {
  const { fetchImpl } = stub({
    "/global/health": () => ({ status: 405, text: "method not allowed" }),
    "/api/info": () => ({ json: { version: "2.1.4" } }),
    "/api/session/ses_1/prompt": () => ({ json: { data: {} } }),
    "/api/session/ses_1/message": () => ({
      json: {
        data: [{ id: "msg_9", type: "idle", outcome: "failed", error: "provider exploded" }],
        cursor: { previous: null, next: null }
      }
    })
  });
  const c = client(fetchImpl);
  await c.health();

  const result = await c.postMessage("ses_1", {
    agent: "general",
    parts: [{ type: "text", text: "go" }]
  });

  assert.equal((result.info as { error?: string }).error, "provider exploded");
  assert.deepEqual(result.parts, []);
});

test("v2: abort calls interrupt and maps the flag", async () => {
  const { fetchImpl } = stub({
    "/global/health": () => ({ status: 405, text: "method not allowed" }),
    "/api/info": () => ({ json: { version: "2.1.4" } }),
    "POST /api/session/ses_1/interrupt": () => ({ json: { interrupted: true } })
  });
  const c = client(fetchImpl);
  await c.health();

  assert.deepEqual(await c.abort("ses_1"), { aborted: true });
});
