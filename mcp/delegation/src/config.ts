import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export interface Timeouts {
  healthMs: number;
  messageMs: number;
}

export interface AgentModelConfig {
  model?: string;
  fallback?: string;
  allowCustom?: boolean;
}

export interface DelegateConfig {
  engine: string;
  serverUrl: string;
  defaultModel?: string;
  fallbackModel?: string;
  allowCustomModel?: boolean;
  agents?: Record<string, AgentModelConfig>;
  timeouts: Timeouts;
  allowedAgents: string[];
}

export interface ModelRef {
  providerID: string;
  modelID: string;
}

export interface ResolvedModels {
  candidates: ModelRef[];
  usedCustom: boolean;
}

/** Where each layer of the effective config came from, in precedence order. */
export type ConfigSource = "defaults" | "user" | "project" | "env";

export interface ResolvedConfig {
  config: DelegateConfig;
  sources: ConfigSource[];
  projectPath: string | null;
  projectRoot: string;
}

export interface LoadOptions {
  /** Override the user-layer config path (tests inject a temp file). */
  userConfigPath?: string;
  /** Environment map to read overrides from (tests inject a hermetic map). */
  env?: NodeJS.ProcessEnv;
}

const CONFIG_FILENAME = "DELEGATE_CONFIG.json";

export function defaultConfig(): DelegateConfig {
  return {
    engine: "opencode",
    serverUrl: "http://localhost:4096",
    allowCustomModel: true,
    agents: {},
    timeouts: { healthMs: 5000, messageMs: 900000 },
    allowedAgents: [
      "architect",
      "senior-dev",
      "qa-engineer",
      "general",
      "challenger",
      "git-agent",
      "minimalism-enforcer",
      "tech-writer",
      "devobs",
      "visualizer",
      "junior-dev",
    ],
  };
}

/** Split `provider/model` on the first slash; undefined when malformed. */
export function parseModel(spec?: string): ModelRef | undefined {
  if (!spec) return undefined;
  const slash = spec.indexOf("/");
  if (slash < 1) return undefined;
  return { providerID: spec.slice(0, slash), modelID: spec.slice(slash + 1) };
}

/**
 * Resolve the ordered list of models to try for one delegated job.
 *
 * A per-call model is honored only when the agent (or the global default)
 * allows it. Otherwise candidates come from, in order: the agent's model, the
 * global default, the agent's fallback, the global fallback — de-duplicated.
 * An empty list means "let opencode's own agent config choose".
 */
export function resolveModels(
  cfg: DelegateConfig,
  agent: string,
  perCall?: string,
): ResolvedModels {
  if (perCall) {
    const allowed = cfg.agents?.[agent]?.allowCustom ?? cfg.allowCustomModel ?? true;
    if (!allowed) {
      throw new Error(`agent "${agent}" does not allow a custom (per-call) model`);
    }
    const parsed = parseModel(perCall);
    return { candidates: parsed ? [parsed] : [], usedCustom: true };
  }

  const specs = [
    cfg.agents?.[agent]?.model,
    cfg.defaultModel,
    cfg.agents?.[agent]?.fallback,
    cfg.fallbackModel,
  ];
  const seen = new Set<string>();
  const candidates: ModelRef[] = [];
  for (const spec of specs) {
    const parsed = parseModel(spec);
    if (!parsed) continue;
    const key = `${parsed.providerID}/${parsed.modelID}`;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(parsed);
  }
  return { candidates, usedCustom: false };
}

/**
 * Find the nearest `DELEGATE_CONFIG.json` at or above `startDir`.
 * Returns its absolute path and the directory that owns it (the project root),
 * or `null` when no ancestor contains one. Terminates at the filesystem root.
 */
export function resolveConfigPath(startDir: string): { path: string; root: string } | null {
  let dir = resolve(startDir);
  for (;;) {
    const candidate = join(dir, CONFIG_FILENAME);
    if (existsSync(candidate)) {
      return { path: candidate, root: dir };
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

/** Project root for artifacts: DELEGATION_ROOT ?? nearest config dir ?? startDir. */
export function repoRoot(startDir: string = process.cwd()): string {
  const forced = process.env.DELEGATION_ROOT;
  if (forced) return forced;
  const found = resolveConfigPath(startDir);
  return found ? found.root : startDir;
}

function readJson(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    throw new Error(`Unable to read ${path}: ${(e as Error).message}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (e) {
    throw new Error(`${path} is not valid JSON: ${(e as Error).message}`);
  }
}

/** Validate a raw config object, throwing a field-named error on any wrong type. */
export function validateConfig(raw: unknown, path: string): Partial<DelegateConfig> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path} must contain a JSON object`);
  }
  const o = raw as Record<string, unknown>;
  if ("engine" in o && typeof o.engine !== "string") {
    throw new Error(`${path}: "engine" must be a string`);
  }
  if ("serverUrl" in o && typeof o.serverUrl !== "string") {
    throw new Error(`${path}: "serverUrl" must be a string`);
  }
  if ("defaultModel" in o && typeof o.defaultModel !== "string") {
    throw new Error(`${path}: "defaultModel" must be a string`);
  }
  if ("fallbackModel" in o && typeof o.fallbackModel !== "string") {
    throw new Error(`${path}: "fallbackModel" must be a string`);
  }
  if ("allowCustomModel" in o && typeof o.allowCustomModel !== "boolean") {
    throw new Error(`${path}: "allowCustomModel" must be a boolean`);
  }
  if ("agents" in o) {
    const a = o.agents;
    if (a === null || typeof a !== "object" || Array.isArray(a)) {
      throw new Error(`${path}: "agents" must be an object`);
    }
    for (const [name, entry] of Object.entries(a as Record<string, unknown>)) {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`${path}: "agents.${name}" must be an object`);
      }
      const e = entry as Record<string, unknown>;
      if ("model" in e && typeof e.model !== "string") {
        throw new Error(`${path}: "agents.${name}.model" must be a string`);
      }
      if ("fallback" in e && typeof e.fallback !== "string") {
        throw new Error(`${path}: "agents.${name}.fallback" must be a string`);
      }
      if ("allowCustom" in e && typeof e.allowCustom !== "boolean") {
        throw new Error(`${path}: "agents.${name}.allowCustom" must be a boolean`);
      }
    }
  }
  if ("timeouts" in o) {
    const t = o.timeouts;
    if (t === null || typeof t !== "object" || Array.isArray(t)) {
      throw new Error(`${path}: "timeouts" must be an object`);
    }
    const tt = t as Record<string, unknown>;
    if ("healthMs" in tt && typeof tt.healthMs !== "number") {
      throw new Error(`${path}: "timeouts.healthMs" must be a number`);
    }
    if ("messageMs" in tt && typeof tt.messageMs !== "number") {
      throw new Error(`${path}: "timeouts.messageMs" must be a number`);
    }
  }
  if ("allowedAgents" in o) {
    const a = o.allowedAgents;
    if (!Array.isArray(a) || a.some((x) => typeof x !== "string")) {
      throw new Error(`${path}: "allowedAgents" must be an array of strings`);
    }
  }
  return o as Partial<DelegateConfig>;
}

function mergeConfig(base: DelegateConfig, over: Partial<DelegateConfig>): DelegateConfig {
  return {
    ...base,
    ...over,
    timeouts: { ...base.timeouts, ...(over.timeouts ?? {}) },
    agents: { ...(base.agents ?? {}), ...(over.agents ?? {}) },
    allowedAgents: over.allowedAgents ?? base.allowedAgents,
  };
}

/**
 * Resolve the effective config by layering, in increasing precedence:
 * defaults → user → project → env overrides. Throws on a malformed file.
 */
export function loadConfigDetailed(startDir: string, options: LoadOptions = {}): ResolvedConfig {
  const env = options.env ?? process.env;
  const sources: ConfigSource[] = ["defaults"];
  let cfg = defaultConfig();

  const userPath =
    options.userConfigPath ?? join(homedir(), ".config", "let-me-code", CONFIG_FILENAME);
  if (existsSync(userPath)) {
    cfg = mergeConfig(cfg, validateConfig(readJson(userPath), userPath));
    sources.push("user");
  }

  let projectRoot: string;
  let projectPath: string | null = null;
  let projectRaw: Partial<DelegateConfig> | null = null;

  const forcedRoot = env.DELEGATION_ROOT;
  if (forcedRoot) {
    projectRoot = forcedRoot;
    const candidate = join(forcedRoot, CONFIG_FILENAME);
    if (existsSync(candidate)) {
      projectPath = candidate;
      projectRaw = validateConfig(readJson(candidate), candidate);
    }
  } else {
    const found = resolveConfigPath(startDir);
    if (found) {
      projectRoot = found.root;
      projectPath = found.path;
      projectRaw = validateConfig(readJson(found.path), found.path);
    } else {
      projectRoot = resolve(startDir);
    }
  }

  if (projectRaw) {
    cfg = mergeConfig(cfg, projectRaw);
    sources.push("project");
  }

  if (env.DELEGATION_SERVER_URL) {
    cfg = { ...cfg, serverUrl: env.DELEGATION_SERVER_URL };
    sources.push("env");
  }

  return { config: cfg, sources, projectPath, projectRoot };
}

/** Backward-compatible wrapper: reads exactly `<root>/DELEGATE_CONFIG.json` over defaults. */
export function loadConfig(root: string): DelegateConfig {
  const base = defaultConfig();
  const path = join(root, CONFIG_FILENAME);
  if (!existsSync(path)) return base;
  return mergeConfig(base, validateConfig(readJson(path), path));
}
