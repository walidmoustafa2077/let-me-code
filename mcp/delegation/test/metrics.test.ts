import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { readMetrics } from "../src/metrics.ts";

async function tempRoot(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function logsDir(root: string): Promise<string> {
  const dir = path.join(root, ".delegation", "logs");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function writeLog(root: string, file: string, entry: unknown): Promise<void> {
  const dir = await logsDir(root);
  await fs.writeFile(path.join(dir, file), JSON.stringify(entry) + "\n", "utf8");
}

function summaryLog(agent: string, sessionId: string, overrides: Record<string, unknown> = {}) {
  return {
    agent,
    sessionId,
    payload: {
      status: "done",
      summary: "completed",
      changed_files: [],
      duration_ms: 1000,
      ...overrides,
    },
  };
}

function resultLog(agent: string, sessionId: string, handoffStatus: string, summary: string) {
  return {
    agent,
    sessionId,
    args: { agent },
    result: {
      info: {
        sessionID: sessionId,
        time: { created: 1_000_000, completed: 1_003_000 },
      },
      parts: [
        {
          type: "text",
          text: `### HANDOFF\nstatus: ${handoffStatus}\nsummary: ${summary}\nartifacts: none\nnext: none`,
        },
      ],
    },
  };
}

test("readMetrics returns a zeroed summary when the logs dir is missing", async () => {
  const root = await tempRoot("metrics-none-");
  const metrics = await readMetrics(root);
  assert.deepEqual(metrics, { total_sessions: 0, agents: {}, recent_failures: [] });
});

test("readMetrics aggregates runs, outcomes, durations, and files", async () => {
  const root = await tempRoot("metrics-data-");
  await writeLog(root, "2026-09-28-senior-dev-ses_1.jsonl", summaryLog("senior-dev", "ses_1", {
    status: "done",
    changed_files: ["src/a.ts"],
    duration_ms: 2000,
  }));
  await writeLog(root, "2026-09-28-senior-dev-ses_2.jsonl", summaryLog("senior-dev", "ses_2", {
    status: "blocked",
    summary: "compile error",
    duration_ms: 4000,
  }));
  await writeLog(root, "2026-09-28-qa-engineer-ses_3.jsonl", summaryLog("qa-engineer", "ses_3", {
    status: "done",
    summary: "tests pass",
    changed_files: ["test/a.test.ts", "test/b.test.ts"],
    duration_ms: 1500,
  }));

  const summary = await readMetrics(root);

  assert.equal(summary.total_sessions, 3);

  const senior = summary.agents["senior-dev"];
  assert.equal(senior.total_runs, 2);
  assert.equal(senior.outcomes.done, 1);
  assert.equal(senior.outcomes.blocked, 1);
  assert.equal(senior.outcomes.needs_input, 0);
  assert.equal(senior.avg_duration_ms, 3000);
  assert.equal(senior.min_duration_ms, 2000);
  assert.equal(senior.max_duration_ms, 4000);
  assert.equal(senior.total_files_changed, 1);

  const qa = summary.agents["qa-engineer"];
  assert.equal(qa.total_runs, 1);
  assert.equal(qa.outcomes.done, 1);
  assert.equal(qa.total_files_changed, 2);

  assert.equal(summary.recent_failures.length, 1);
  assert.equal(summary.recent_failures[0].session_id, "ses_2");
  assert.equal(summary.recent_failures[0].agent, "senior-dev");
  assert.equal(summary.recent_failures[0].summary, "compile error");
});

test("readMetrics counts needs-input as its own outcome bucket", async () => {
  const root = await tempRoot("metrics-needs-");
  await writeLog(root, "2026-09-28-general-ses_n.jsonl", summaryLog("general", "ses_n", {
    status: "needs-input",
  }));
  const summary = await readMetrics(root);
  assert.equal(summary.agents["general"].outcomes.needs_input, 1);
  assert.equal(summary.agents["general"].outcomes.done, 0);
  assert.equal(summary.recent_failures.length, 0, "needs-input is not a failure");
});

test("readMetrics reconstructs outcome, duration, and timestamp from a real result log", async () => {
  const root = await tempRoot("metrics-result-");
  await writeLog(
    root,
    "2026-09-28T12-10-34-469Z-senior-dev-ses_real.jsonl",
    resultLog("senior-dev", "ses_real", "blocked", "waiting on schema"),
  );

  const summary = await readMetrics(root);

  const agent = summary.agents["senior-dev"];
  assert.equal(agent.total_runs, 1);
  assert.equal(agent.outcomes.blocked, 1);
  assert.equal(agent.avg_duration_ms, 3000);
  assert.equal(summary.recent_failures[0].session_id, "ses_real");
  assert.equal(summary.recent_failures[0].summary, "waiting on schema");
  assert.equal(summary.recent_failures[0].timestamp, "2026-09-28T12:10:34.469Z");
});

test("readMetrics filters by agent", async () => {
  const root = await tempRoot("metrics-filter-");
  await writeLog(root, "2026-09-28-senior-dev-ses_1.jsonl", summaryLog("senior-dev", "ses_1"));
  await writeLog(root, "2026-09-28-qa-engineer-ses_2.jsonl", summaryLog("qa-engineer", "ses_2", {
    status: "blocked",
  }));

  const summary = await readMetrics(root, { agent: "qa-engineer" });

  assert.equal(summary.total_sessions, 1);
  assert.deepEqual(Object.keys(summary.agents), ["qa-engineer"]);
  assert.equal(summary.agents["qa-engineer"].total_runs, 1);
  assert.equal(summary.recent_failures.length, 1);
  assert.equal(summary.recent_failures[0].agent, "qa-engineer");
});

test("readMetrics limits recent failures", async () => {
  const root = await tempRoot("metrics-limit-");
  for (const id of ["a", "b", "c"]) {
    await writeLog(root, `2026-09-28-blocked-ses_${id}.jsonl`, summaryLog("blocked-agent", `ses_${id}`, {
      status: "blocked",
      summary: `failure ${id}`,
    }));
  }

  const unlimited = await readMetrics(root);
  assert.equal(unlimited.recent_failures.length, 3);

  const limited = await readMetrics(root, { limit: 2 });
  assert.equal(limited.recent_failures.length, 2);
  assert.ok(limited.recent_failures.every((f) => f.agent === "blocked-agent"));
});

test("readMetrics ignores malformed jsonl lines and non-jsonl files", async () => {
  const root = await tempRoot("metrics-malformed-");
  const dir = await logsDir(root);
  await fs.writeFile(path.join(dir, "corrupted.jsonl"), "NOT_JSON\n{broken\n", "utf8");
  await fs.writeFile(path.join(dir, "notes.txt"), "ignore me", "utf8");
  await fs.writeFile(
    path.join(dir, "mixed.jsonl"),
    "garbage\n" + JSON.stringify(summaryLog("general", "ses_ok")) + "\n",
    "utf8",
  );

  const summary = await readMetrics(root);

  assert.equal(summary.total_sessions, 1);
  assert.equal(summary.agents["general"].total_runs, 1);
});

test("readMetrics returns an empty summary for an empty logs dir", async () => {
  const root = await tempRoot("metrics-empty-");
  await logsDir(root);
  const summary = await readMetrics(root);
  assert.deepEqual(summary, { total_sessions: 0, agents: {}, recent_failures: [] });
});
