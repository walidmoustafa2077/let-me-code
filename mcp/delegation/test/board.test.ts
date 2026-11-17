import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initBoard, moveTicket, readBoard } from "../src/board.ts";

const HEADERS: Record<string, string> = {
  "## Todo": "| Ticket | Title | Depends on |",
  "## In Progress": "| Ticket | Title | Owner | Started |",
  "## In Review": "| Ticket | Title | Reviewer |",
  "## Blocked": "| Ticket | Title | Reason | Since |",
  "## Done": "| Ticket | Title | Commit |",
};

test("initBoard writes all five columns and is idempotent", async () => {
  const dir = mkdtempSync(join(tmpdir(), "board-"));
  await initBoard(dir, "demo");
  await initBoard(dir, "demo");
  const text = readFileSync(join(dir, "BOARD.md"), "utf8");
  for (const header of Object.keys(HEADERS)) assert.ok(text.includes(header), header);
});

test("moveTicket places a ticket in the target column and removes it from others", async () => {
  const dir = mkdtempSync(join(tmpdir(), "board-"));
  await initBoard(dir, "demo");
  writeFileSync(
    join(dir, "BOARD.md"),
    readFileSync(join(dir, "BOARD.md"), "utf8").replace(
      "| --- | --- | --- |\n## In Progress",
      "| TICKET-1 | version flag |  |\n| --- | --- | --- |\n## In Progress",
    ),
  );
  const after = await moveTicket(dir, "TICKET-1", "In Review", "qa-engineer");
  assert.equal(after.todo.length, 0);
  assert.equal(after.inReview.length, 1);
  assert.equal(after.inReview[0].ticket, "TICKET-1");
});

test("readBoard returns empty arrays for an all-empty board", async () => {
  const dir = mkdtempSync(join(tmpdir(), "board-"));
  await initBoard(dir, "demo");
  const b = await readBoard(dir);
  assert.deepEqual([b.todo, b.inProgress, b.inReview, b.blocked, b.done], [[], [], [], [], []]);
});
