import { test } from "node:test";
import assert from "node:assert/strict";

// A developer shell must not change what these tests exercise.
delete process.env.DELEGATION_ROOT;
delete process.env.DELEGATION_SERVER_URL;
delete process.env.OPENCODE_SERVER_PASSWORD;

import { defaultConfig } from "../src/config.ts";
import { OpenCodeClient, StallError } from "../src/http.ts";

type Route = (body: unknown, method: string) => { status?: number; json?: unknown; text?: string };

function stub(routes: Record<string, Route>) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const method = init?.method ?? "GET";
    calls.push(`${method} ${path}`);
    const route = routes[`${method} ${path}`] ?? routes[path];
    if (!route) return new Response("not found", { status: 404 });
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

/** A v2 server: v1 paths 404, /api/info reports a version, the prompt is accepted async. */
function v2Client(fetchImpl: typeof fetch, stallMs: number) {
  const cfg = defaultConfig();
  cfg.serverUrl = "http://stub.invalid:4096";
  cfg.timeouts.stallMs = stallMs;
  cfg.timeouts.messageMs = 30_000;
  return new OpenCodeClient(cfg, fetchImpl, { root: process.cwd(), autoStart: false });
}

const v2 = {
  "/api/info": () => ({ json: { version: "2.1.4" } }),
  "POST /api/session/ses_s/prompt": () => ({ json: {} }),
};

test("a child that stops producing messages is aborted and reported as stalled", async () => {
  const { fetchImpl, calls } = stub({
    ...v2,
    "GET /api/session/ses_s/message": () => ({
      json: { data: [{ type: "assistant", content: [{ type: "text", text: "thinking" }] }] },
    }),
    "POST /session/ses_s/abort": () => ({ json: { aborted: true } }),
    "POST /api/session/ses_s/interrupt": () => ({ json: { interrupted: true } }),
  });

  const c = v2Client(fetchImpl, 300);
  const started = Date.now();

  await assert.rejects(
    () => c.postMessage("ses_s", { agent: "architect", parts: [{ type: "text", text: "go" }] }),
    (err: unknown) => err instanceof StallError && err.sessionId === "ses_s",
  );

  // Detected in about one poll interval, not after the 30s message budget.
  assert.ok(Date.now() - started < 5_000, "stall must not wait out the message timeout");
  assert.ok(
    calls.some((call) => call.endsWith("/abort") || call.endsWith("/interrupt")),
    "a stalled child must be aborted",
  );
});

test("a child that keeps producing messages is waited for, then returns its text", async () => {
  let poll = 0;
  const history: unknown[] = [];
  const { fetchImpl, calls } = stub({
    ...v2,
    "GET /api/session/ses_s/message": () => {
      poll += 1;
      history.push({ type: "assistant", content: [{ type: "text", text: `step ${poll}` }] });
      return poll >= 3
        ? { json: { data: [...history, { type: "idle", outcome: "succeeded" }] } }
        : { json: { data: [...history] } };
    },
  });

  const r = await v2Client(fetchImpl, 300).postMessage("ses_s", {
    agent: "architect",
    parts: [{ type: "text", text: "go" }],
  });

  assert.equal(r.parts.length, 3);
  assert.equal(r.parts[2].text, "step 3");
  assert.ok(
    !calls.some((call) => call.endsWith("/abort") || call.endsWith("/interrupt")),
    "progressing children must not be aborted",
  );
});
