import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, appendFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertInside, delegateTask } from "../src/spawn.ts";
import { defaultConfig } from "../src/config.ts";
import { haltAndRevert } from "../src/revert.ts";
import { readMetrics } from "../src/metrics.ts";

function freshRepo(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "guardrail-repo-"));
  execFileSync("git", ["init"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  writeFileSync(path.join(dir, ".gitignore"), ".delegation/\n");
  writeFileSync(path.join(dir, "a.txt"), "one\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

test("guardrails: assertInside blocks path traversal outside repo root", () => {
  const root = path.resolve(os.tmpdir(), "guardrail-root");

  assert.throws(() => assertInside(root, "../outside.txt"), /path escapes repo root/);
  assert.throws(() => assertInside(root, "sub/../../outside.txt"), /path escapes repo root/);
  assert.doesNotThrow(() => assertInside(root, "src/index.ts"));

  const inside = assertInside(root, "src/index.ts");
  assert.ok(inside.startsWith(root), "resolved path must stay inside the repo root");
});

test("guardrails: delegateTask rejects unlisted agent immediately", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "guardrail-agent-"));
  const fakeClient = {} as never;

  await assert.rejects(
    () => delegateTask(root, defaultConfig(), fakeClient, { agent: "evil-hacker", prompt: "pwn" }),
    /allowlist/,
  );
});

test("guardrails: readMetrics handles malformed jsonl files gracefully without throwing", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "guardrail-metrics-"));
  const logsDir = path.join(root, ".delegation", "logs");
  await fs.mkdir(logsDir, { recursive: true });
  await fs.writeFile(path.join(logsDir, "corrupted.jsonl"), "NOT_JSON\n{broken\n");

  const summary = await readMetrics(root);

  assert.equal(summary.total_sessions, 0);
  assert.deepEqual(summary.agents, {});
  assert.deepEqual(summary.recent_failures, []);
});

test("guardrails: haltAndRevert snapshots inside the repo root and restores HEAD", async () => {
  const repo = freshRepo();
  appendFileSync(path.join(repo, "a.txt"), "more\n");
  writeFileSync(path.join(repo, "untracked.txt"), "new\n");

  const result = await haltAndRevert(repo, undefined, "guardrail halt");

  assert.equal(result.reverted, true);
  assert.ok(result.snapshot_path, "a snapshot path should be returned");

  const snapshotPath = result.snapshot_path as string;
  assert.ok(existsSync(snapshotPath), "snapshot patch should exist on disk");
  assert.ok(
    path.resolve(snapshotPath).startsWith(path.resolve(repo) + path.sep),
    "snapshot must be written inside the repo root",
  );
  assert.match(snapshotPath, /\.delegation[\\/]snapshots[\\/]/);
  assert.equal(existsSync(path.join(repo, "untracked.txt")), false, "untracked file should be removed");
});

test("guardrails: haltAndRevert is a no-op on a clean tree", async () => {
  const repo = freshRepo();

  const result = await haltAndRevert(repo);

  assert.deepEqual(result, { aborted_sessions: [], snapshot_path: null, reverted: false });
});
