import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadConfigDetailed,
  resolveConfigPath,
  type LoadOptions,
} from "../src/config.ts";

function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeConfig(dir: string, obj: unknown): string {
  const p = join(dir, "DELEGATE_CONFIG.json");
  writeFileSync(p, JSON.stringify(obj));
  return p;
}

/** Point the user layer at a path that does not exist so tests stay hermetic. */
const noUser: LoadOptions = { userConfigPath: join(tmpdir(), "does-not-exist-let-me-code.json") };

test("resolveConfigPath walks up to the nearest ancestor config", () => {
  const root = tmp("cfgroot-");
  writeConfig(root, { serverUrl: "http://up:1" });
  const nested = join(root, "a", "b");
  mkdirSync(nested, { recursive: true });

  const found = resolveConfigPath(nested);
  assert.ok(found, "should find an ancestor config");
  assert.equal(found!.root, root);
  assert.equal(found!.path, join(root, "DELEGATE_CONFIG.json"));
});

test("resolveConfigPath returns null when no ancestor has a config", () => {
  const empty = tmp("cfgempty-");
  assert.equal(resolveConfigPath(empty), null);
});

test("nearest ancestor config wins", () => {
  const outer = tmp("cfgouter-");
  writeConfig(outer, { serverUrl: "http://outer:1" });
  const inner = join(outer, "inner");
  mkdirSync(inner, { recursive: true });
  writeConfig(inner, { serverUrl: "http://inner:1" });

  const found = resolveConfigPath(inner);
  assert.equal(found!.root, inner);
});

test("layered merge: project overrides user; timeouts deep-merge; allowedAgents replace", () => {
  const userDir = tmp("cfguser-");
  const userPath = writeConfig(userDir, {
    serverUrl: "http://user:1",
    timeouts: { healthMs: 1111 },
    allowedAgents: ["general"],
  });
  const project = tmp("cfgproj-");
  writeConfig(project, {
    serverUrl: "http://proj:1",
    timeouts: { messageMs: 2222 },
    allowedAgents: ["architect", "senior-dev"],
  });

  const { config, sources } = loadConfigDetailed(project, { userConfigPath: userPath });
  assert.equal(config.serverUrl, "http://proj:1", "project scalar overrides user");
  assert.equal(config.timeouts.healthMs, 1111, "user timeout value survives deep-merge");
  assert.equal(config.timeouts.messageMs, 2222, "project timeout value applied");
  assert.deepEqual(config.allowedAgents, ["architect", "senior-dev"], "allowedAgents replace");
  assert.deepEqual(sources, ["defaults", "user", "project"]);
});

test("DELEGATION_SERVER_URL overrides serverUrl and appends the env source", () => {
  const project = tmp("cfgenv-");
  writeConfig(project, { serverUrl: "http://proj:1" });

  const { config, sources } = loadConfigDetailed(project, {
    userConfigPath: noUser.userConfigPath,
    env: { DELEGATION_SERVER_URL: "http://env:9" },
  });
  assert.equal(config.serverUrl, "http://env:9");
  assert.deepEqual(sources, ["defaults", "project", "env"]);
});

test("DELEGATION_ROOT forces the project root and config location", () => {
  const forced = tmp("cfgforced-");
  writeConfig(forced, { serverUrl: "http://forced:1" });
  const elsewhere = tmp("cfgcwd-");

  const { config, projectRoot, projectPath } = loadConfigDetailed(elsewhere, {
    userConfigPath: noUser.userConfigPath,
    env: { DELEGATION_ROOT: forced },
  });
  assert.equal(projectRoot, forced);
  assert.equal(projectPath, join(forced, "DELEGATE_CONFIG.json"));
  assert.equal(config.serverUrl, "http://forced:1");
});

test("missing everywhere: defaults apply, projectPath null, projectRoot = startDir", () => {
  const start = tmp("cfgmiss-");
  const { config, sources, projectPath, projectRoot } = loadConfigDetailed(start, {
    userConfigPath: noUser.userConfigPath,
  });
  assert.equal(projectPath, null);
  assert.equal(projectRoot, start);
  assert.deepEqual(sources, ["defaults"]);
  assert.equal(config.serverUrl, "http://localhost:4096");
});

test("fail loud: invalid JSON throws naming the absolute path", () => {
  const dir = tmp("cfgbad-");
  const p = join(dir, "DELEGATE_CONFIG.json");
  writeFileSync(p, "{ not json");

  assert.throws(
    () => loadConfigDetailed(dir, { userConfigPath: noUser.userConfigPath }),
    (e: Error) => e.message.includes(p) && /not valid JSON/.test(e.message),
  );
});

test("fail loud: wrong-typed fields throw naming the field", () => {
  const cases: Array<[string, unknown]> = [
    ["serverUrl", { serverUrl: 123 }],
    ["timeouts", { timeouts: "soon" }],
    ["allowedAgents", { allowedAgents: "nope" }],
  ];
  for (const [field, body] of cases) {
    const dir = tmp(`cfgbadfield-${field}-`);
    writeConfig(dir, body);
    assert.throws(
      () => loadConfigDetailed(dir, { userConfigPath: noUser.userConfigPath }),
      (e: Error) => e.message.includes(field),
      `expected an error naming "${field}"`,
    );
  }
});
