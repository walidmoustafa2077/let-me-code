import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig, loadConfig } from "../src/config.ts";

test("defaultConfig has safe timeouts and the full v1.3 agent roster", () => {
  const c = defaultConfig();
  assert.equal(c.engine, "opencode");
  assert.equal(c.timeouts.healthMs, 5000);
  assert.ok(c.timeouts.messageMs >= 600000);
  assert.deepEqual(c.allowedAgents.sort(), [
    "architect",
    "challenger",
    "devobs",
    "general",
    "git-agent",
    "junior-dev",
    "minimalism-enforcer",
    "qa-engineer",
    "senior-dev",
    "tech-writer",
    "visualizer",
  ]);
});

test("loadConfig merges a partial DELEGATE_CONFIG.json over defaults", () => {
  const dir = mkdtempSync(join(tmpdir(), "cfg-"));
  writeFileSync(join(dir, "DELEGATE_CONFIG.json"), JSON.stringify({ serverUrl: "http://localhost:4096" }));
  const c = loadConfig(dir);
  assert.equal(c.serverUrl, "http://localhost:4096");
  assert.equal(c.engine, "opencode");
  assert.ok(c.timeouts.messageMs >= 600000);
});

test("loadConfig falls back to defaults when the file is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "cfg-"));
  assert.equal(loadConfig(dir).serverUrl, "http://localhost:4096");
});
