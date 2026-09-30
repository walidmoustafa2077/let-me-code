import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createWorktree,
  listWorktrees,
  pruneWorktrees,
  removeWorktree,
} from "../src/worktree.ts";

function freshRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "wt-"));
  execFileSync("git", ["init"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  writeFileSync(join(dir, "a.txt"), "one\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

function tempWorktreePath(): string {
  const parent = mkdtempSync(join(tmpdir(), "wt-target-"));
  return join(parent, "tree");
}

function norm(p: string): string {
  return resolve(p).replace(/\\/g, "/");
}

test("createWorktree adds a checkout at the requested path", async () => {
  const repo = freshRepo();
  const wt = tempWorktreePath();
  await createWorktree(repo, wt);
  assert.ok(existsSync(join(wt, "a.txt")), "worktree should contain the committed file");
  const listed = await listWorktrees(repo);
  assert.ok(listed.includes(norm(wt)), `expected ${norm(wt)} in ${JSON.stringify(listed)}`);
});

test("listWorktrees includes the main worktree and any added worktrees", async () => {
  const repo = freshRepo();
  const wt = tempWorktreePath();
  await createWorktree(repo, wt);
  const listed = await listWorktrees(repo);
  assert.ok(listed.includes(norm(repo)), "main worktree should be listed");
  assert.ok(listed.includes(norm(wt)), "added worktree should be listed");
});

test("removeWorktree deletes the checkout and drops it from the list", async () => {
  const repo = freshRepo();
  const wt = tempWorktreePath();
  await createWorktree(repo, wt);
  await removeWorktree(repo, wt);
  assert.equal(existsSync(wt), false, "worktree directory should be gone");
  const listed = await listWorktrees(repo);
  assert.ok(!listed.includes(norm(wt)), "removed worktree should not be listed");
});

test("pruneWorktrees succeeds on a clean repository", async () => {
  const repo = freshRepo();
  await pruneWorktrees(repo);
  const listed = await listWorktrees(repo);
  assert.ok(listed.includes(norm(repo)));
});
