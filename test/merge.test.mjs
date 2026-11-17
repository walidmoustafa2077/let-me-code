import test from "node:test";
import assert from "node:assert/strict";
import {
  deepMerge,
  mergeGitignore,
  detectConflicts,
  mergeOpencodeConfig,
  applyModel,
  applyDelegateModel
} from "../lib/merge.mjs";

test("deepMerge merges nested objects without losing siblings", () => {
  const base = { a: 1, nested: { x: 1, keep: true } };
  const overlay = { nested: { x: 2 } };
  assert.deepEqual(deepMerge(base, overlay), {
    a: 1,
    nested: { x: 2, keep: true }
  });
});

test("deepMerge does not mutate inputs", () => {
  const base = { nested: { x: 1 } };
  deepMerge(base, { nested: { y: 2 } });
  assert.deepEqual(base, { nested: { x: 1 } });
});

test("mergeOpencodeConfig preserves user keys and adds factory agents", () => {
  const user = { theme: "dark", agent: { mine: { model: "x" } } };
  const factory = { agent: { architect: { model: "f" } } };
  const merged = mergeOpencodeConfig(user, factory);
  assert.equal(merged.theme, "dark");
  assert.equal(merged.agent.mine.model, "x");
  assert.equal(merged.agent.architect.model, "f");
});

test("applyModel sets the model on every agent definition", () => {
  const config = {
    agent: {
      a: { model: "old" },
      b: { description: "no model here" },
      c: "not-an-object"
    }
  };
  const out = applyModel(config, "new/model");
  assert.equal(out.agent.a.model, "new/model");
  assert.equal(out.agent.b.model, "new/model");
  assert.equal(out.agent.c, "not-an-object");
});

test("applyModel only pins the agents it is given", () => {
  const config = {
    agent: {
      a: { description: "factory agent" },
      mine: { model: "x" }
    }
  };
  const out = applyModel(config, "new/model", ["a"]);
  assert.equal(out.agent.a.model, "new/model");
  assert.equal(out.agent.mine.model, "x");
});

test("applyModel leaves the config untouched without a model", () => {
  const config = { agent: { a: { description: "no model here" } } };
  assert.equal(applyModel(config, null), config);
  assert.equal(applyModel(config, ""), config);
  assert.equal("model" in config.agent.a, false);
});

test("applyDelegateModel pins the model on every agent without mutating input", () => {
  const config = {
    engine: "opencode",
    agents: {
      general: { allowCustom: true },
      "senior-dev": { allowCustom: false }
    }
  };
  const out = applyDelegateModel(config, "m/x");
  assert.equal(out.defaultModel, "m/x");
  assert.equal(out.agents.general.model, "m/x");
  assert.equal(out.agents["senior-dev"].model, "m/x");
  assert.equal(config.defaultModel, undefined);
  assert.equal(config.agents.general.model, undefined);
});

test("mergeGitignore appends only missing lines", () => {
  const out = mergeGitignore("node_modules/\n.env\n", ["node_modules/", "dist/", ".env"]);
  assert.match(out, /dist\//);
  assert.equal(out.match(/node_modules\//g).length, 1);
  assert.equal(out.match(/^\.env$/m) !== null, true);
});

test("mergeGitignore is a no-op when nothing is missing", () => {
  const text = "node_modules/\n";
  assert.equal(mergeGitignore(text, ["node_modules/"]), text);
});

test("detectConflicts reports only existing assets", () => {
  const existing = new Set(["opencode.json", "mcp"]);
  const conflicts = detectConflicts(
    [".opencode", "opencode.json", "mcp"],
    (p) => existing.has(p)
  );
  assert.deepEqual(conflicts, ["opencode.json", "mcp"]);
});
