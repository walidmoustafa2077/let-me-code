import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { copyFile, copyTree } from "../lib/scaffold.mjs";

function mkdirLink(target, link) {
  if (process.platform === "win32") {
    execFileSync("cmd", ["/c", "mklink", "/J", link, target], { stdio: "ignore" });
  } else {
    fs.symlinkSync(target, link, "dir");
  }
}

test("copyTree copies real files and skips machine-local links", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lmc-copytree-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const src = path.join(root, "src");
  const dst = path.join(root, "dst");
  const kit = path.join(root, "kit");
  fs.mkdirSync(path.join(src, "nested"), { recursive: true });
  fs.mkdirSync(kit);
  fs.writeFileSync(path.join(src, "nested", "keep.txt"), "kept\n");
  fs.writeFileSync(path.join(kit, "huge.bin"), "not copied\n");

  try {
    mkdirLink(kit, path.join(src, "assets"));
  } catch {
    t.skip("this filesystem cannot create a directory link");
    return;
  }

  const log = copyTree(src, dst);

  assert.equal(fs.readFileSync(path.join(dst, "nested", "keep.txt"), "utf8"), "kept\n");
  assert.equal(fs.existsSync(path.join(dst, "assets")), false);
  assert.deepEqual(
    log.filter((entry) => entry.action === "skipped-link").map((entry) => entry.src),
    [path.join(src, "assets")]
  );
});

test("upgrade mode replaces a factory file and backs up the old bytes", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lmc-upgrade-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const src = path.join(root, "src", "agent.md");
  const dst = path.join(root, "dst", "agent.md");
  fs.mkdirSync(path.dirname(src), { recursive: true });
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(src, "new instructions\n");
  fs.writeFileSync(dst, "old instructions\n");

  const log = [];
  copyFile(src, dst, { mode: "upgrade", log });

  assert.equal(fs.readFileSync(dst, "utf8"), "new instructions\n");
  const backup = log.find((entry) => entry.action === "backed-up");
  assert.ok(backup, "the replaced file must be backed up");
  assert.equal(fs.readFileSync(backup.bak, "utf8"), "old instructions\n");
});

test("upgrade mode leaves an identical file alone instead of backing it up", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lmc-upgrade-same-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const src = path.join(root, "src", "skill.md");
  const dst = path.join(root, "dst", "skill.md");
  fs.mkdirSync(path.dirname(src), { recursive: true });
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(src, "same bytes\n");
  fs.writeFileSync(dst, "same bytes\n");

  const log = [];
  copyFile(src, dst, { mode: "upgrade", log });

  assert.deepEqual(log.map((entry) => entry.action), ["unchanged"]);
  assert.equal(fs.readdirSync(path.dirname(dst)).length, 1);
});

test("merge mode still refuses to overwrite an existing project file", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lmc-merge-keep-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const src = path.join(root, "src", "agent.md");
  const dst = path.join(root, "dst", "agent.md");
  fs.mkdirSync(path.dirname(src), { recursive: true });
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(src, "factory version\n");
  fs.writeFileSync(dst, "project version\n");

  const log = [];
  copyFile(src, dst, { mode: "merge", log });

  assert.equal(fs.readFileSync(dst, "utf8"), "project version\n");
  assert.deepEqual(log.map((entry) => entry.action), ["kept"]);
});
