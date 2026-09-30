import path from "node:path";

const ASSET_PATHS = [
  ".opencode",
  "opencode.json",
  "mcp",
  "DELEGATE_CONFIG.json",
  ".gitignore"
];

const GITIGNORE_LINES = [
  "node_modules/",
  ".delegation/logs/",
  ".delegation/runs/",
  ".delegation/snapshots/",
  "dist/",
  "*.tsbuildinfo",
  ".env",
  ".env.*"
];

export function isPlainObject(value) {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function deepMerge(base, overlay) {
  if (!isPlainObject(base) || !isPlainObject(overlay)) {
    return overlay === undefined ? base : overlay;
  }
  const out = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      out[key] = deepMerge(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function mergeOpencodeConfig(existing, factory) {
  return deepMerge(existing ?? {}, factory ?? {});
}

export function applyModel(config, model) {
  if (!model || !config || !isPlainObject(config.agent)) {
    return config;
  }
  const agents = { ...config.agent };
  for (const [name, def] of Object.entries(agents)) {
    if (isPlainObject(def) && "model" in def) {
      agents[name] = { ...def, model };
    }
  }
  return { ...config, agent: agents };
}

export function applyDelegateModel(config, model) {
  if (!model || !isPlainObject(config)) {
    return config;
  }
  return { ...config, defaultModel: model };
}

export function mergeGitignore(text, lines = GITIGNORE_LINES) {
  const current = String(text ?? "");
  const existing = new Set(
    current
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );
  const missing = lines.filter((line) => !existing.has(line.trim()));
  if (missing.length === 0) {
    return current;
  }
  const body = current.endsWith("\n") || current === "" ? current : current + "\n";
  const separator = body.endsWith("\n\n") || body === "" ? "" : "\n";
  return `${body}${separator}${missing.join("\n")}\n`;
}

export function detectConflicts(assetPaths, exists, targetDir = ".") {
  return assetPaths.filter((asset) => exists(path.join(targetDir, asset)));
}

export { ASSET_PATHS, GITIGNORE_LINES };
