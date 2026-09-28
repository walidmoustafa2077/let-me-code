import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { defaultConfig } from "../src/config.ts";
import { OpenCodeClient } from "../src/http.ts";

async function withServer(
  handler: (url: string, body: string) => { status?: number; json: unknown },
  fn: (url: string) => Promise<void>,
) {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const { status = 200, json } = handler(req.url ?? "", body);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

test("health GETs /global/health", async () => {
  await withServer(
    (url) => {
      assert.equal(url, "/global/health");
      return { json: { healthy: true, version: "1.18.30" } };
    },
    async (url) => {
      const c = new OpenCodeClient({ ...defaultConfig(), serverUrl: url });
      assert.deepEqual(await c.health(), { healthy: true, version: "1.18.30" });
    },
  );
});

test("agents GETs /agent and returns the array", async () => {
  await withServer(
    (url) => {
      assert.equal(url, "/agent");
      return { json: [{ name: "architect" }, { name: "general" }] };
    },
    async (url) => {
      const c = new OpenCodeClient({ ...defaultConfig(), serverUrl: url });
      assert.equal((await c.agents()).length, 2);
    },
  );
});

test("createSession POSTs /session and returns info.id", async () => {
  await withServer(
    (url, body) => {
      assert.equal(url, "/session");
      assert.match(body, /job/);
      return { json: { id: "ses_abc" } };
    },
    async (url) => {
      const c = new OpenCodeClient({ ...defaultConfig(), serverUrl: url });
      assert.equal(await c.createSession("job"), "ses_abc");
    },
  );
});

test("postMessage POSTs to /session/:id/message and returns parts", async () => {
  await withServer(
    (url, body) => {
      assert.equal(url, "/session/ses_abc/message");
      assert.match(body, /architect/);
      return { json: { info: { id: "m1" }, parts: [{ type: "text", text: "hi" }] } };
    },
    async (url) => {
      const c = new OpenCodeClient({ ...defaultConfig(), serverUrl: url });
      const r = await c.postMessage("ses_abc", { agent: "architect", parts: [{ type: "text", text: "hi" }] });
      assert.equal(r.parts[0].text, "hi");
    },
  );
});

test("abort POSTs to /session/:id/abort", async () => {
  await withServer(
    (url) => {
      assert.equal(url, "/session/ses_abc/abort");
      return { json: { aborted: true } };
    },
    async (url) => {
      const c = new OpenCodeClient({ ...defaultConfig(), serverUrl: url });
      assert.equal((await c.abort("ses_abc")).aborted, true);
    },
  );
});
