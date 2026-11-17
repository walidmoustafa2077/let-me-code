import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, realpathSync } from "node:fs";
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
  // git reports canonical long paths, but os.tmpdir() can hand back an 8.3
  // short name (e.g. C:/Users/RUNNER~1/... on Windows runners). Expand it so
  // both sides of the comparison are the same string.
  let full = resolve(p);
  try {
    full = realpathSync.native(full);
  } catch {
    // The path may not exist yet; the resolved form is the best we can do.
  }
  return full.replace(/\\/g, "/");
}

function hasWorktree(listed: string[], target: string): boolean {
  const wanted = norm(target);
  return listed.some((entry) => norm(entry) === wanted);
}

test("createWorktree adds a checkout at the requested path", async () => {
  const repo = freshRepo();
  const wt = tempWorktreePath();
  await createWorktree(repo, wt);
  assert.ok(existsSync(join(wt, "a.txt")), "worktree should contain the committed file");
  const listed = await listWorktrees(repo);
  assert.ok(hasWorktree(listed, wt), `expected ${norm(wt)} in ${JSON.stringify(listed)}`);
});

test("listWorktrees includes the main worktree and any added worktrees", async () => {
  const repo = freshRepo();
  const wt = tempWorktreePath();
  await createWorktree(repo, wt);
  const listed = await listWorktrees(repo);
  assert.ok(hasWorktree(listed, repo), "main worktree should be listed");
  assert.ok(hasWorktree(listed, wt), "added worktree should be listed");
});

test("removeWorktree deletes the checkout and drops it from the list", async () => {
  const repo = freshRepo();
  const wt = tempWorktreePath();
  await createWorktree(repo, wt);
  await removeWorktree(repo, wt);
  assert.equal(existsSync(wt), false, "worktree directory should be gone");
  const listed = await listWorktrees(repo);
  assert.ok(!hasWorktree(listed, wt), "removed worktree should not be listed");
});

test("pruneWorktrees succeeds on a clean repository", async () => {
  const repo = freshRepo();
  await pruneWorktrees(repo);
  const listed = await listWorktrees(repo);
  assert.ok(hasWorktree(listed, repo));
});
