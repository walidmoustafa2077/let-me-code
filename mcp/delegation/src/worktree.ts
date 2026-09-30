import { run } from "./git.ts";

function assertOk(
  action: string,
  result: { code: number; stdout: string; stderr: string },
): void {
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout).trim();
    throw new Error(`${action} failed (exit ${result.code}): ${detail}`);
  }
}

export async function createWorktree(
  repoRoot: string,
  worktreePath: string,
  commitOrBranch: string = "HEAD",
): Promise<void> {
  const target = commitOrBranch || "HEAD";
  const result = await run("git", ["worktree", "add", "-f", worktreePath, target], repoRoot);
  assertOk(`git worktree add ${worktreePath}`, result);
}

export async function removeWorktree(repoRoot: string, worktreePath: string): Promise<void> {
  const result = await run("git", ["worktree", "remove", "--force", worktreePath], repoRoot);
  assertOk(`git worktree remove ${worktreePath}`, result);
  await pruneWorktrees(repoRoot);
}

export async function pruneWorktrees(repoRoot: string): Promise<void> {
  const result = await run("git", ["worktree", "prune"], repoRoot);
  assertOk("git worktree prune", result);
}

export async function listWorktrees(repoRoot: string): Promise<string[]> {
  const result = await run("git", ["worktree", "list", "--porcelain"], repoRoot);
  assertOk("git worktree list", result);
  return result.stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length).trim())
    .filter(Boolean);
}
