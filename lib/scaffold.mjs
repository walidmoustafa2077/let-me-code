import fs from "node:fs";
import path from "node:path";

export const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".delegation",
  "vendor",
  "dist"
]);

export function timestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function backupFile(dst, date = new Date()) {
  if (!fs.existsSync(dst)) {
    return null;
  }
  const bak = `${dst}.bak-${timestamp(date)}`;
  fs.copyFileSync(dst, bak);
  return bak;
}

/** True when both paths hold the same bytes. Used to skip no-op backups. */
export function filesEqual(a, b) {
  try {
    if (fs.statSync(a).size !== fs.statSync(b).size) {
      return false;
    }
    return fs.readFileSync(a).equals(fs.readFileSync(b));
  } catch {
    return false;
  }
}

export function copyFile(src, dst, { mode = "merge", log = [] } = {}) {
  if (fs.existsSync(dst)) {
    if (mode === "merge") {
      log.push({ action: "kept", dst });
      return dst;
    }
    // Overwriting modes leave an untouched file alone instead of filling the
    // tree with backups that are byte-identical to the replacement.
    if (filesEqual(src, dst)) {
      log.push({ action: "unchanged", dst });
      return dst;
    }
    const bak = `${dst}.bak-${timestamp()}`;
    fs.copyFileSync(dst, bak);
    log.push({ action: "backed-up", dst, bak });
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  log.push({ action: "copied", dst });
  return dst;
}

export function copyTree(srcDir, dstDir, { mode = "merge", skip = SKIP_DIRS, log = [] } = {}) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (skip.has(entry.name)) {
      continue;
    }
    const src = path.join(srcDir, entry.name);
    const dst = path.join(dstDir, entry.name);
    // Symlinks and Windows junctions point at this machine's filesystem, so
    // recreating them would either fail or leak a path that does not exist on
    // the target. Skip them and record the decision in the log.
    if (entry.isSymbolicLink() || fs.lstatSync(src).isSymbolicLink()) {
      log.push({ action: "skipped-link", src, dst });
      continue;
    }
    if (entry.isDirectory()) {
      copyTree(src, dst, { mode, skip, log });
    } else {
      copyFile(src, dst, { mode, log });
    }
  }
  return log;
}

export function installAssets({ sourceRoot, targetRoot, mode = "merge", log = [] }) {
  copyTree(path.join(sourceRoot, ".opencode"), path.join(targetRoot, ".opencode"), { mode, log });
  copyTree(path.join(sourceRoot, "mcp"), path.join(targetRoot, "mcp"), { mode, log });
  const config = path.join(sourceRoot, "DELEGATE_CONFIG.json");
  if (fs.existsSync(config)) {
    copyFile(config, path.join(targetRoot, "DELEGATE_CONFIG.json"), { mode, log });
  }
  return log;
}
