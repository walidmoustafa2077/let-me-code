import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  clearLock,
  engineDiagnostics,
  ensureServer,
  isPidAlive,
  isPortOpen,
  lockPath,
  parseServerUrl,
  readLock,
  waitForHealth,
  writeLock,
} from "../src/engine.ts";

function tmpRepo(): string {
  return mkdtempSync(join(tmpdir(), "engine-"));
}

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

async function withHttpServer(fn: (port: number) => Promise<void>): Promise<void> {
  const srv = createServer((_req, res) => res.writeHead(200).end("ok"));
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const { port } = srv.address() as { port: number };
  try {
    await fn(port);
  } finally {
    await new Promise<void>((r) => srv.close(() => r()));
  }
}

test("parseServerUrl extracts host and port, defaulting by protocol", () => {
  assert.deepEqual(parseServerUrl("http://localhost:4096"), { host: "localhost", port: 4096 });
  assert.deepEqual(parseServerUrl("http://127.0.0.1:8080"), { host: "127.0.0.1", port: 8080 });
  assert.deepEqual(parseServerUrl("https://example.com"), { host: "example.com", port: 443 });
});

test("isPidAlive recognises the current process and rejects invalid pids", () => {
  assert.equal(isPidAlive(process.pid), true);
  assert.equal(isPidAlive(0), false);
  assert.equal(isPidAlive(-1), false);
  assert.equal(isPidAlive(Number.NaN), false);
});

test("isPortOpen reports true for a listener and false for a free port", async () => {
  await withHttpServer(async (port) => {
    assert.equal(await isPortOpen("127.0.0.1", port), true);
  });
  const closed = await freePort();
  assert.equal(await isPortOpen("127.0.0.1", closed, 250), false);
});

test("waitForHealth polls until healthy and otherwise times out", async () => {
  let n = 0;
  const flaky = async () => ++n >= 3;
  assert.equal(await waitForHealth(flaky, 1000, 5), true);
  assert.equal(await waitForHealth(async () => false, 40, 10), false);
});

test("engine lock round-trips and clears", () => {
  const root = tmpRepo();
  try {
    writeLock(root, { pid: 4242, port: 4096, url: "http://localhost:4096", startedAt: "now" });
    const lock = readLock(root, 4096);
    assert.equal(lock?.pid, 4242);
    clearLock(root, 4096);
    assert.equal(readLock(root, 4096), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ensureServer reuses a healthy engine without spawning", async () => {
  const root = tmpRepo();
  let spawns = 0;
  try {
    const result = await ensureServer(
      root,
      { serverUrl: "http://127.0.0.1:4096", timeouts: { healthMs: 200 } },
      async () => true,
      { spawnImpl: () => (spawns++, 111) },
    );
    assert.deepEqual(result, { started: false, reused: true });
    assert.equal(spawns, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ensureServer spawns once on a free port and waits for health", async () => {
  const root = tmpRepo();
  const port = await freePort();
  let up = false;
  let spawns = 0;
  try {
    const result = await ensureServer(
      root,
      { serverUrl: `http://127.0.0.1:${port}`, timeouts: { healthMs: 200 } },
      async () => up,
      { pollMs: 5, spawnTimeoutMs: 2000, spawnImpl: () => (spawns++, (up = true, 4242)) },
    );
    assert.equal(result.started, true);
    assert.equal(result.reused, false);
    assert.equal(spawns, 1);
    assert.equal(readLock(root, port)?.pid, 4242);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("ensureServer refuses to duplicate an occupied-but-unhealthy port", async () => {
  await withHttpServer(async (port) => {
    const root = tmpRepo();
    let spawns = 0;
    try {
      await assert.rejects(
        ensureServer(
          root,
          { serverUrl: `http://127.0.0.1:${port}`, timeouts: { healthMs: 50 } },
          async () => false,
          { pollMs: 5, spawnImpl: () => (spawns++, 1) },
        ),
        /occupied/,
      );
      assert.equal(spawns, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

test("engineDiagnostics snapshots reachability and lock state", async () => {
  const root = tmpRepo();
  try {
    writeLock(root, { pid: process.pid, port: 4096, url: "http://127.0.0.1:4096", startedAt: "t" });
    const diag = await engineDiagnostics(
      root,
      { serverUrl: "http://127.0.0.1:4096", timeouts: { healthMs: 50 } },
      async () => false,
    );
    assert.equal(diag.healthy, false);
    assert.equal(diag.port, 4096);
    assert.equal(diag.lockAlive, true);
    assert.equal(lockPath(root, 4096).endsWith("engine-4096.lock"), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
