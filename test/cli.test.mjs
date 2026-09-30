import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs, runCli, detectTargetConflicts } from "../lib/cli.mjs";

test("parseArgs defaults to init in cwd", () => {
  const o = parseArgs([]);
  assert.equal(o.command, "init");
  assert.equal(o.target, ".");
  assert.equal(o.install, true);
});

test("parseArgs reads flags and target", () => {
  const o = parseArgs(["init", "my-app", "--yes", "--no-install", "--model", "m/x"]);
  assert.equal(o.target, "my-app");
  assert.equal(o.yes, true);
  assert.equal(o.install, false);
  assert.equal(o.model, "m/x");
});

test("parseArgs rejects unknown flags", () => {
  assert.throws(() => parseArgs(["--nope"]));
});

test("runCli scaffolds a fresh project", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lmc-"));
  try {
    const code = await runCli(
      ["init", dir, "--yes", "--no-install", "--no-test", "--no-git"]
    );
    assert.equal(code, 0);
    assert.ok(fs.existsSync(path.join(dir, "opencode.json")));
    assert.ok(fs.existsSync(path.join(dir, ".opencode", "agent", "architect.md")));
    assert.ok(fs.existsSync(path.join(dir, "mcp", "delegation", "src", "index.ts")));
    assert.ok(fs.existsSync(path.join(dir, "DELEGATE_CONFIG.json")));
    assert.ok(fs.existsSync(path.join(dir, ".gitignore")));
    assert.equal(fs.existsSync(path.join(dir, "node_modules")), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("runCli merges into an existing opencode.json without clobbering user keys", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lmc-"));
  try {
    fs.writeFileSync(
      path.join(dir, "opencode.json"),
      JSON.stringify({ theme: "dark", agent: { mine: { model: "x" } } })
    );
    const code = await runCli(
      ["init", dir, "--yes", "--no-install", "--no-test", "--no-git"]
    );
    assert.equal(code, 0);
    const merged = JSON.parse(fs.readFileSync(path.join(dir, "opencode.json"), "utf8"));
    assert.equal(merged.theme, "dark");
    assert.equal(merged.agent.mine.model, "x");
    assert.ok(merged.agent.architect);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("detectTargetConflicts finds assets in a populated dir", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lmc-"));
  try {
    fs.writeFileSync(path.join(dir, "opencode.json"), "{}");
    const conflicts = detectTargetConflicts(dir);
    assert.ok(conflicts.includes("opencode.json"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
