import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { statusPorcelain } from "../src/git.ts";
import { haltAndRevert } from "../src/revert.ts";

function freshRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "revert-"));
  execFileSync("git", ["init"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  writeFileSync(join(dir, ".gitignore"), ".delegation/\n");
  writeFileSync(join(dir, "a.txt"), "one\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

function head(dir: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
}

test("haltAndRevert snapshots a dirty tree and restores HEAD", async () => {
  const repo = freshRepo();
  const before = head(repo);
  appendFileSync(join(repo, "a.txt"), "more\n");
  writeFileSync(join(repo, "untracked.txt"), "new\n");

  const result = await haltAndRevert(repo, undefined, "test halt");

  assert.equal(result.reverted, true);
  assert.ok(result.snapshot_path, "a snapshot path should be returned");
  assert.ok(existsSync(result.snapshot_path as string), "snapshot patch should exist on disk");

  const patch = await readFile(result.snapshot_path as string, "utf8");
  assert.match(patch, /a\.txt/, "patch should capture the modified tracked file");
  assert.match(patch, /untracked\.txt/, "patch should capture the untracked file");

  assert.equal((await statusPorcelain(repo)).trim(), "", "working tree should be clean");
  assert.equal(existsSync(join(repo, "untracked.txt")), false, "untracked file should be removed");
  assert.equal(head(repo), before, "HEAD should be unchanged");
});

test("haltAndRevert is a no-op on a clean tree", async () => {
  const repo = freshRepo();
  const result = await haltAndRevert(repo);
  assert.deepEqual(result, { aborted_sessions: [], snapshot_path: null, reverted: false });
});

test("haltAndRevert aborts tracked sessions via client.abort", async () => {
  const repo = freshRepo();
  const aborted: string[] = [];
  const client = {
    activeSessionIds: ["s1", "s2"],
    async abort(id: string) {
      aborted.push(id);
      return { aborted: true };
    },
  };

  const result = await haltAndRevert(repo, client);

  assert.deepEqual(aborted.sort(), ["s1", "s2"]);
  assert.deepEqual(result.aborted_sessions.sort(), ["s1", "s2"]);
  assert.equal(result.reverted, false);
});

test("haltAndRevert discovers sessions via listSessions", async () => {
  const repo = freshRepo();
  const aborted: string[] = [];
  const client = {
    async listSessions() {
      return [{ id: "x1" }, { id: "x2" }];
    },
    async abort(id: string) {
      aborted.push(id);
      return { aborted: true };
    },
  };

  const result = await haltAndRevert(repo, client);

  assert.deepEqual(aborted.sort(), ["x1", "x2"]);
  assert.deepEqual(result.aborted_sessions.sort(), ["x1", "x2"]);
});

test("haltAndRevert tolerates clients without an abort method", async () => {
  const repo = freshRepo();
  appendFileSync(join(repo, "a.txt"), "more\n");
  const result = await haltAndRevert(repo, { activeSessionIds: ["s1"] });
  assert.deepEqual(result.aborted_sessions, []);
  assert.equal(result.reverted, true);
});
