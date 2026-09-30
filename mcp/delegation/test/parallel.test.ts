import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultConfig } from "../src/config.ts";
import { OpenCodeClient } from "../src/http.ts";
import { delegateParallel } from "../src/spawn.ts";

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "parallel-"));
  execFileSync("git", ["init"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "t@t.t"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "t"], { cwd: dir });
  writeFileSync(join(dir, "seed.txt"), "x\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir });
  return dir;
}

function json(o: unknown): Response {
  return new Response(JSON.stringify(o), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const REPLIES: Record<string, string> = {
  alpha: "a\n### HANDOFF\nstatus: done\nsummary: alpha done\nartifacts: alpha.txt\nnext: none\n",
  beta: "b\n### HANDOFF\nstatus: done\nsummary: beta done\nartifacts: beta.txt\nnext: none\n",
};

function parallelClient(repoRoot: string): {
  client: OpenCodeClient;
  bothArrived: Promise<void>;
} {
  let arrivals = 0;
  let release: () => void = () => {};
  const bothArrived = new Promise<void>((res) => {
    release = res;
  });

  const impl = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/session")) return json({ id: "ses_parallel" });
    if (u.endsWith("/message")) {
      const marker = ((init?.body as string) ?? "").includes("ALPHA") ? "alpha" : "beta";
      const wtRoot = join(repoRoot, ".worktrees");
      const dirs = existsSync(wtRoot) ? readdirSync(wtRoot) : [];
      for (const d of dirs) {
        const m = d.match(/^par-\d+-(\d+)-/);
        if (!m) continue;
        writeFileSync(join(wtRoot, d, `${m[1] === "0" ? "alpha" : "beta"}.txt`), `${marker}\n`);
      }

      arrivals += 1;
      if (arrivals === 2) release();
      await bothArrived;

      return json({ info: { id: "m" }, parts: [{ type: "text", text: REPLIES[marker] }] });
    }
    return json({});
  }) as unknown as typeof fetch;

  return { client: new OpenCodeClient(defaultConfig(), impl), bothArrived };
}

test(
  "delegateParallel runs tasks concurrently, returns their handoffs/files, and cleans worktrees",
  { timeout: 20000 },
  async () => {
    const dir = repo();
    const { client, bothArrived } = parallelClient(dir);

    const results = await delegateParallel(dir, defaultConfig(), client, [
      { agent: "architect", prompt: "ALPHA task" },
      { agent: "general", prompt: "BETA task" },
    ]);

    await bothArrived;

    assert.equal(results.length, 2);
    assert.equal(results[0].status, "done");
    assert.equal(results[0].handoff?.summary, "alpha done");
    assert.ok(
      results[0].changed_files.some((f) => f.includes("alpha.txt")),
      `alpha changed files: ${JSON.stringify(results[0].changed_files)}`,
    );
    assert.equal(results[1].status, "done");
    assert.equal(results[1].handoff?.summary, "beta done");
    assert.ok(
      results[1].changed_files.some((f) => f.includes("beta.txt")),
      `beta changed files: ${JSON.stringify(results[1].changed_files)}`,
    );

    const wtRoot = join(dir, ".worktrees");
    const leftover = existsSync(wtRoot) ? readdirSync(wtRoot) : [];
    assert.deepEqual(leftover, [], `worktrees should be cleaned up, found: ${JSON.stringify(leftover)}`);
  },
);
