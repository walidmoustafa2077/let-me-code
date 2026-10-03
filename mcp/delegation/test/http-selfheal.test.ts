import assert from "node:assert/strict";
import { test } from "node:test";

import { defaultConfig } from "../src/config.ts";
import { isNetworkError, OpenCodeClient } from "../src/http.ts";

function json(o: unknown): Response {
  return new Response(JSON.stringify(o), { status: 200 });
}

test("isNetworkError flags transport failures but not aborts or HTTP errors", () => {
  assert.equal(isNetworkError(new TypeError("fetch failed")), true);
  assert.equal(isNetworkError(Object.assign(new Error("connect ECONNREFUSED"), { cause: { code: "ECONNREFUSED" } })), true);
  assert.equal(isNetworkError(Object.assign(new Error("x"), { name: "AbortError" })), false);
  assert.equal(isNetworkError(new Error("HTTP 500 /session boom")), false);
});

test("autoStart self-heals a network failure once and retries the request", async () => {
  let calls = 0;
  let ensured = 0;
  const impl = async (): Promise<Response> => {
    calls++;
    if (calls === 1) throw new TypeError("fetch failed");
    return json({ id: "ses_ok" });
  };
  const client = new OpenCodeClient(defaultConfig(), impl as unknown as typeof fetch, {
    autoStart: true,
    ensure: async () => {
      ensured++;
    },
  });
  const id = await client.createSession("job");
  assert.equal(id, "ses_ok");
  assert.equal(ensured, 1);
  assert.equal(calls, 2);
});

test("pure health probe never triggers auto-start on a network failure", async () => {
  let ensured = 0;
  const impl = async (): Promise<Response> => {
    throw new TypeError("fetch failed");
  };
  const client = new OpenCodeClient(defaultConfig(), impl as unknown as typeof fetch, {
    autoStart: true,
    ensure: async () => {
      ensured++;
    },
  });
  await assert.rejects(client.health());
  assert.equal(ensured, 0);
});
