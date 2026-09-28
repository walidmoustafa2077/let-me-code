import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { readPackageVersion } from "../src/version.ts";

// mcp/delegation (this file lives in test/, so up two levels)
const pkgDir = dirname(dirname(fileURLToPath(import.meta.url)));
const entry = join(pkgDir, "src", "index.ts");

// Read the expected version from the manifest itself - never hardcode it.
const pkgVersion = JSON.parse(
  readFileSync(join(pkgDir, "package.json"), "utf8"),
).version as string;

function runVersion(cwd: string) {
  // args-array form, absolute script path -> cwd-independent
  return spawnSync(process.execPath, [entry, "--version"], { cwd, encoding: "utf8" });
}

test("unit: readPackageVersion() equals the version in package.json", () => {
  assert.strictEqual(typeof pkgVersion, "string");
  assert.notStrictEqual(pkgVersion, "");
  assert.strictEqual(readPackageVersion(), pkgVersion);
});

test("subprocess: --version prints exactly <version>+newline to stdout, empty stderr, exit 0", () => {
  const r = runVersion(pkgDir);
  assert.strictEqual(r.status, 0, `expected exit 0, got ${r.status}; stderr=${r.stderr}`);
  assert.strictEqual(r.stdout, `${pkgVersion}\n`);
  assert.strictEqual(r.stderr, "");
});

test("cwd-independence: foreign cwd still prints the correct version and exits 0", () => {
  const r = runVersion(tmpdir());
  assert.strictEqual(r.status, 0, `expected exit 0, got ${r.status}; stderr=${r.stderr}`);
  assert.strictEqual(r.stdout, `${pkgVersion}\n`);
  assert.strictEqual(r.stderr, "");
});

test("no-arg regression: stdio server starts and does NOT short-circuit", async () => {
  // stdin MUST be an open pipe: with stdio[0]="ignore" the transport sees EOF and
  // shuts down cleanly (exit 0), which is correct server behaviour but would mask
  // the regression. An open pipe keeps the stdio server up and waiting.
  const child = spawn(process.execPath, [entry], {
    cwd: pkgDir,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let exited: number | null = null;
  let stdout = "";
  let stderr = "";
  child.on("exit", (code) => { exited = code; });
  child.stdout.on("data", (d) => { stdout += d.toString(); });
  child.stderr.on("data", (d) => { stderr += d.toString(); });

  // Give it well past the instant-exit window of a short-circuit.
  await new Promise((res) => setTimeout(res, 1500));

  // The only correct reasons to have exited are failure; a clean 0 with no output
  // is still a violation of "no args must start the transport".
  assert.strictEqual(
    exited,
    null,
    `no-arg run exited early (code ${exited}); --version must be the only short-circuit. ` +
      `stdout=${JSON.stringify(stdout)} stderr=${JSON.stringify(stderr)}`,
  );

  child.kill();
  await new Promise((res) => setTimeout(res, 300));
});
