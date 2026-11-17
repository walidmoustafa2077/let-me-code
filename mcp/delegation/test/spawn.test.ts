import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig, parseModel } from "../src/config.ts";
import { OpenCodeClient } from "../src/http.ts";
import { buildPrompt, delegateTask, writeLog } from "../src/spawn.ts";

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "spawn-"));
  execFileSync("git", ["init"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  writeFileSync(join(dir, "seed.txt"), "x\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

function fakeClient(reply: string, onMessage?: (body: string) => void): OpenCodeClient {
  const impl = (async (url: string, init?: RequestInit) => {
    const body = (init?.body as string) ?? "";
    if (onMessage && String(url).endsWith("/message")) onMessage(body);
    if (String(url).endsWith("/session")) return json({ id: "ses_1" });
    if (String(url).endsWith("/message"))
      return json({ info: { id: "m1" }, parts: [{ type: "text", text: reply }] });
    return json({});
  }) as unknown as typeof fetch;
  return new OpenCodeClient(defaultConfig(), impl);
}

function json(o: unknown): Response {
  return new Response(JSON.stringify(o), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("buildPrompt appends a HANDOFF instruction and context file list", () => {
  const p = buildPrompt("do a thing", ["a.md", "b.md"]);
  assert.match(p, /do a thing/);
  assert.match(p, /a\.md/);
  assert.match(p, /### HANDOFF/);
});

test("delegateTask rejects agents outside the allowlist", async () => {
  const dir = repo();
  await assert.rejects(
    delegateTask(dir, defaultConfig(), fakeClient("x"), { agent: "evil", prompt: "x" }),
    /allowlist/,
  );
});

test("delegateTask returns handoff, changed files, and writes a log", async () => {
  const dir = repo();
  const reply = "ok\n### HANDOFF\nstatus: done\nsummary: did it\nartifacts: a.ts\nnext: review\n";
  const result = await delegateTask(
    dir,
    defaultConfig(),
    fakeClient(reply, () => {
      writeFileSync(join(dir, "made.txt"), "new\n");
    }),
    { agent: "architect", prompt: "spec it" },
  );
  assert.equal(result.status, "done");
  assert.equal(result.handoff?.summary, "did it");
  assert.deepEqual(result.changed_files, ["made.txt"]);
  assert.equal(result.session_id, "ses_1");
  assert.ok(existsSync(result.log_path));
});

test("delegateTask reports no-handoff replies as needs-input", async () => {
  const dir = repo();
  const result = await delegateTask(dir, defaultConfig(), fakeClient("no terminator here"), {
    agent: "architect",
    prompt: "x",
  });
  assert.equal(result.status, "needs-input");
  assert.equal(result.handoff, null);
});

test("writeLog nests under .delegation/logs and returns the path", async () => {
  const dir = repo();
  const p = await writeLog(dir, "architect", "ses_1", { hello: "world" });
  assert.match(p, /\.delegation[\\/]logs[\\/]/);
  assert.ok(existsSync(p));
});

test("parseModel splits provider/model on the first slash", () => {
  assert.deepEqual(parseModel("gemini-proxy/gemini-3.8-flash"), {
    providerID: "gemini-proxy",
    modelID: "gemini-3.8-flash",
  });
  assert.deepEqual(parseModel("ollama/deepseek-v4.1-flash:cloud"), {
    providerID: "ollama",
    modelID: "deepseek-v4.1-flash:cloud",
  });
  assert.equal(parseModel(undefined), undefined);
  assert.equal(parseModel("no-slash"), undefined);
});

test("delegateTask posts the model as a providerID/modelID object, not a string", async () => {
  const dir = repo();
  const reply = "ok\n### HANDOFF\nstatus: done\nsummary: did it\nnext: review\n";
  let sent: { model?: unknown } = {};
  const result = await delegateTask(
    dir,
    defaultConfig(),
    fakeClient(reply, (body) => {
      sent = JSON.parse(body);
    }),
    { agent: "architect", prompt: "spec it", model: "gemini-proxy/gemini-3.8-flash" },
  );
  assert.deepEqual(sent.model, { providerID: "gemini-proxy", modelID: "gemini-3.8-flash" });
  assert.equal(result.session_id, "ses_1");
});
