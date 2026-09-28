import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changedSince, diffStat, headCommit, statusPorcelain } from "../src/git.ts";

function freshRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "git-"));
  execFileSync("git", ["init"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  writeFileSync(join(dir, "a.txt"), "one\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

test("changedSince returns only files changed after the baseline", async () => {
  const dir = freshRepo();
  const baseline = await statusPorcelain(dir);
  writeFileSync(join(dir, "b.txt"), "new\n");
  appendFileSync(join(dir, "a.txt"), "more\n");
  const changed = (await changedSince(dir, baseline)).sort();
  assert.deepEqual(changed, ["a.txt", "b.txt"]);
});

test("changedSince ignores files already dirty in the baseline", async () => {
  const dir = freshRepo();
  writeFileSync(join(dir, "stale.txt"), "leftover\n");
  const baseline = await statusPorcelain(dir);
  writeFileSync(join(dir, "fresh.txt"), "new\n");
  assert.deepEqual(await changedSince(dir, baseline), ["fresh.txt"]);
});

test("diffStat summarizes the working tree against HEAD", async () => {
  const dir = freshRepo();
  writeFileSync(join(dir, "b.txt"), "x\n");
  assert.match(await diffStat(dir), /b\.txt/);
});

test("headCommit returns a 40-char sha", async () => {
  const dir = freshRepo();
  assert.match(await headCommit(dir), /^[0-9a-f]{40}$/);
});
