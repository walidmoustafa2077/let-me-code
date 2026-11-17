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

test("concurrent auto-start callers share one in-flight ensure instead of failing fast", async () => {
  let calls = 0;
  let ensured = 0;
  let releaseEnsure: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    releaseEnsure = resolve;
  });
  const impl = (async (): Promise<Response> => {
    calls++;
    // Fail every request until the shared boot has completed.
    if (ensured === 0) throw new TypeError("fetch failed");
    return json({ id: `ses_${calls}` });
  }) as unknown as typeof fetch;
  const client = new OpenCodeClient(defaultConfig(), impl, {
    autoStart: true,
    ensure: async () => {
      ensured++;
      await gate;
    },
  });

  const pending = Promise.all([
    client.createSession("a"),
    client.createSession("b"),
    client.createSession("c"),
  ]);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(ensured, 1, "the three failures must join a single boot");
  releaseEnsure();
  const ids = await pending;

  assert.equal(ensured, 1);
  assert.equal(calls, 6, "three cold failures plus three retries");
  assert.ok(ids.every((id) => id.startsWith("ses_")));
});

test("a failed shared boot rejects every waiting caller with the boot error", async () => {
  let ensured = 0;
  const impl = (async (): Promise<Response> => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;
  const client = new OpenCodeClient(defaultConfig(), impl, {
    autoStart: true,
    ensure: async () => {
      ensured++;
      throw new Error("engine boot failed");
    },
  });

  const results = await Promise.allSettled([
    client.createSession("a"),
    client.createSession("b"),
  ]);
  assert.equal(ensured, 1, "one shared boot, not one per caller");
  for (const r of results) {
    assert.equal(r.status, "rejected");
    assert.match(String((r as PromiseRejectedResult).reason), /engine boot failed/);
  }
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
