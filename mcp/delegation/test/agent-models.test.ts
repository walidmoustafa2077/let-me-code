import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultConfig,
  validateConfig,
  resolveModels,
  type DelegateConfig,
} from "../src/config.ts";
import { OpenCodeClient } from "../src/http.ts";
import { delegateTask } from "../src/spawn.ts";

function cfg(over: Partial<DelegateConfig> = {}): DelegateConfig {
  return { ...defaultConfig(), ...over };
}

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "agent-models-"));
  execFileSync("git", ["init"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  writeFileSync(join(dir, "seed.txt"), "x\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

function json(o: unknown): Response {
  return new Response(JSON.stringify(o), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("resolveModels orders agent.model > defaultModel > agent.fallback > fallbackModel", () => {
  const c = cfg({
    defaultModel: "gemini-proxy/default",
    fallbackModel: "ollama/global-fallback",
    agents: {
      "senior-dev": { model: "gemini-proxy/agent", fallback: "ollama/agent-fallback" },
    },
  });
  const { candidates, usedCustom } = resolveModels(c, "senior-dev");
  assert.equal(usedCustom, false);
  assert.deepEqual(candidates, [
    { providerID: "gemini-proxy", modelID: "agent" },
    { providerID: "gemini-proxy", modelID: "default" },
    { providerID: "ollama", modelID: "agent-fallback" },
    { providerID: "ollama", modelID: "global-fallback" },
  ]);
});

test("resolveModels de-duplicates identical candidates and skips malformed specs", () => {
  const c = cfg({
    defaultModel: "gemini-proxy/same",
    fallbackModel: "gemini-proxy/same",
    agents: { "qa-engineer": { model: "no-slash", fallback: "gemini-proxy/same" } },
  });
  const { candidates } = resolveModels(c, "qa-engineer");
  assert.deepEqual(candidates, [{ providerID: "gemini-proxy", modelID: "same" }]);
});

test("resolveModels returns no candidates when nothing is configured", () => {
  const { candidates } = resolveModels(cfg(), "architect");
  assert.deepEqual(candidates, []);
});

test("resolveModels honors a per-call model when the agent allows custom", () => {
  const c = cfg({ agents: { "senior-dev": { allowCustom: true } } });
  const { candidates, usedCustom } = resolveModels(c, "senior-dev", "gemini-proxy/lite");
  assert.equal(usedCustom, true);
  assert.deepEqual(candidates, [{ providerID: "gemini-proxy", modelID: "lite" }]);
});

test("resolveModels rejects a per-call model when the agent denies custom", () => {
  const c = cfg({ agents: { "junior-dev": { allowCustom: false } } });
  assert.throws(
    () => resolveModels(c, "junior-dev", "gemini-proxy/lite"),
    /does not allow a custom/,
  );
});

test("resolveModels rejects a per-call model when the global policy denies custom", () => {
  const c = cfg({ allowCustomModel: false });
  assert.throws(() => resolveModels(c, "architect", "gemini-proxy/lite"), /does not allow a custom/);
});

test("validateConfig accepts the new model fields and rejects wrong types", () => {
  const ok = validateConfig(
    {
      fallbackModel: "ollama/x",
      allowCustomModel: true,
      agents: { "senior-dev": { model: "gemini-proxy/y", fallback: "ollama/z", allowCustom: false } },
    },
    "t.json",
  );
  assert.equal(ok.fallbackModel, "ollama/x");

  assert.throws(() => validateConfig({ fallbackModel: 1 }, "t.json"), /"fallbackModel" must be a string/);
  assert.throws(() => validateConfig({ allowCustomModel: "yes" }, "t.json"), /"allowCustomModel" must be a boolean/);
  assert.throws(() => validateConfig({ agents: [] }, "t.json"), /"agents" must be an object/);
  assert.throws(
    () => validateConfig({ agents: { "senior-dev": { model: 1 } } }, "t.json"),
    /"agents.senior-dev.model" must be a string/,
  );
  assert.throws(
    () => validateConfig({ agents: { "senior-dev": { allowCustom: "x" } } }, "t.json"),
    /"agents.senior-dev.allowCustom" must be a boolean/,
  );
});

test("delegateTask uses the agents map as the allowlist when present", async () => {
  const dir = repo();
  const c = cfg({ agents: { "senior-dev": {} } });
  await assert.rejects(
    delegateTask(dir, c, new OpenCodeClient(c), { agent: "architect", prompt: "x" }),
    /allowlist/,
  );
});

test("delegateTask falls back to the next model on a model-resolution error", async () => {
  const dir = repo();
  const c = cfg({
    defaultModel: "gemini-proxy/flash",
    fallbackModel: "ollama/deepseek-v4.1-flash:cloud",
  });
  const reply = "ok\n### HANDOFF\nstatus: done\nsummary: did it\nnext: review\n";
  const seen: unknown[] = [];
  let messageCalls = 0;
  const impl = (async (url: string, init?: RequestInit) => {
    if (String(url).endsWith("/session")) return json({ id: "ses_1" });
    if (String(url).endsWith("/message")) {
      messageCalls++;
      seen.push(JSON.parse((init?.body as string) ?? "{}").model);
      if (messageCalls === 1) {
        return new Response(
          "ProviderModelNotFoundError: Model not found: gemini-proxy/flash",
          { status: 500 },
        );
      }
      return json({ info: { id: "m1" }, parts: [{ type: "text", text: reply }] });
    }
    return json({});
  }) as unknown as typeof fetch;

  const client = new OpenCodeClient(c, impl);
  const result = await delegateTask(dir, c, client, { agent: "architect", prompt: "spec it" });

  assert.equal(result.status, "done");
  assert.equal(messageCalls, 2);
  assert.deepEqual(seen, [
    { providerID: "gemini-proxy", modelID: "flash" },
    { providerID: "ollama", modelID: "deepseek-v4.1-flash:cloud" },
  ]);
});

test("delegateTask does not fall back on a non-model error", async () => {
  const dir = repo();
  const c = cfg({ defaultModel: "gemini-proxy/flash", fallbackModel: "ollama/x" });
  let messageCalls = 0;
  const impl = (async (url: string) => {
    if (String(url).endsWith("/session")) return json({ id: "ses_1" });
    if (String(url).endsWith("/message")) {
      messageCalls++;
      return new Response("boom", { status: 500 });
    }
    return json({});
  }) as unknown as typeof fetch;

  await assert.rejects(
    delegateTask(dir, c, new OpenCodeClient(c, impl), { agent: "architect", prompt: "x" }),
    /HTTP 500/,
  );
  assert.equal(messageCalls, 1);
});
