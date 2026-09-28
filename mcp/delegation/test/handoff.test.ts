import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHandoff, extractText } from "../src/handoff.ts";

const GOOD = `Did the work.

### HANDOFF
status: done
summary: Added the --version flag and a passing test.
artifacts: mcp/delegation/src/index.ts, mcp/delegation/test/version.test.ts
next: Hand off to qa-engineer for review.
`;

test("parseHandoff extracts all four fields", () => {
  const h = parseHandoff(GOOD);
  assert.equal(h?.status, "done");
  assert.match(h!.summary, /--version/);
  assert.match(h!.artifacts, /version\.test\.ts/);
  assert.match(h!.next, /qa-engineer/);
});

test("parseHandoff accepts blocked and needs-input statuses", () => {
  const b = GOOD.replace("status: done", "status: blocked");
  assert.equal(parseHandoff(b)?.status, "blocked");
  const n = GOOD.replace("status: done", "status: needs-input");
  assert.equal(parseHandoff(n)?.status, "needs-input");
});

test("parseHandoff returns null when the block is absent", () => {
  assert.equal(parseHandoff("just some chat with no terminator"), null);
});

test("parseHandoff rejects an unknown status", () => {
  assert.equal(parseHandoff(GOOD.replace("status: done", "status: maybe")), null);
});

test("extractText concatenates only text parts", () => {
  const parts = [
    { type: "step-start" },
    { type: "reasoning", text: "ignore me" },
    { type: "text", text: "hello " },
    { type: "text", text: "world" },
  ];
  assert.equal(extractText(parts), "hello world");
});
