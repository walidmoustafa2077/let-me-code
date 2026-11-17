import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { defaultConfig } from "../src/config.ts";
import { OpenCodeClient } from "../src/http.ts";
import { delegateTask, extractInfoError, isRetryableModelError } from "../src/spawn.ts";

function json(o: unknown): Response {
  return new Response(JSON.stringify(o), { status: 200 });
}

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "perr-"));
  const git = (args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  git(["init"]);
  git(["config", "user.email", "t@t.t"]);
  git(["config", "user.name", "T"]);
  writeFileSync(join(dir, "seed.txt"), "seed");
  git(["add", "."]);
  git(["commit", "-m", "seed"]);
  return dir;
}

function client(handler: () => Response, cfg = defaultConfig()) {
  const impl = async (url: string): Promise<Response> => {
    if (url.endsWith("/session")) return json({ id: "ses_1" });
    return handler();
  };
  return new OpenCodeClient(cfg, impl as unknown as typeof fetch);
}

test("isRetryableModelError matches provider/quota failures but not a bare 500", () => {
  assert.equal(isRetryableModelError(new Error("HTTP 503 /session/x No API keys are currently ready.")), true);
  assert.equal(isRetryableModelError(new Error("429 too many requests")), true);
  assert.equal(isRetryableModelError(new Error("you have reached your weekly usage limit")), true);
  assert.equal(isRetryableModelError(new Error("ProviderModelNotFoundError: Model not found")), true);
  assert.equal(isRetryableModelError(new Error("HTTP 500 /session/x boom")), false);
});

test("extractInfoError distinguishes absent, string, and structured errors", () => {
  assert.equal(extractInfoError({ id: "m1" }), null);
  assert.equal(extractInfoError({ error: "kaboom" }), "kaboom");
  assert.equal(
    extractInfoError({ error: { name: "APIError", statusCode: 503, data: { message: "No API keys" } } }),
    "APIError (503): No API keys",
  );
});

test("delegateTask falls back to the next model when info carries a retryable error", async () => {
  const root = repo();
  const cfg = { ...defaultConfig(), defaultModel: "gemini-proxy/flash", fallbackModel: "ollama/x" };
  let calls = 0;
  const c = new OpenCodeClient(cfg, (async (url: string) => {
    if (url.endsWith("/session")) return json({ id: "ses_1" });
    calls++;
    if (calls === 1) {
      return json({ info: { error: { name: "APIError", statusCode: 503, data: { message: "No API keys are currently ready." } } }, parts: [] });
    }
    return json({ info: { id: "m2" }, parts: [{ type: "text", text: "### HANDOFF\nstatus: done\nsummary: ok\nartifacts: none\nnext: none" }] });
  }) as unknown as typeof fetch);
  try {
    const result = await delegateTask(root, cfg, c, { agent: "architect", prompt: "go" });
    assert.equal(calls, 2);
    assert.equal(result.status, "done");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("delegateTask reports blocked and never crashes when every model errors", async () => {
  const root = repo();
  const cfg = { ...defaultConfig(), defaultModel: "gemini-proxy/flash" };
  const c = client(
    () => json({ info: { error: { name: "APIError", statusCode: 503, data: { message: "No API keys are currently ready." } } }, parts: [] }),
    cfg,
  );
  try {
    const result = await delegateTask(root, cfg, c, { agent: "architect", prompt: "go" });
    assert.equal(result.status, "blocked");
    assert.equal(result.handoff, null);
    assert.match(result.summary, /No API keys/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
