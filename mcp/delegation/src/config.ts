import { readFileSync } from "node:fs";

export interface Timeouts {
  healthMs: number;
  messageMs: number;
}

export interface DelegateConfig {
  engine: string;
  serverUrl: string;
  defaultModel?: string;
  timeouts: Timeouts;
  allowedAgents: string[];
}

export function defaultConfig(): DelegateConfig {
  return {
    engine: "opencode",
    serverUrl: "http://localhost:4096",
    timeouts: { healthMs: 5000, messageMs: 900000 },
    allowedAgents: ["architect", "senior-dev", "qa-engineer", "general", "junior-dev"],
  };
}

export function repoRoot(): string {
  return process.env.DELEGATION_ROOT ?? process.cwd();
}

export function loadConfig(root: string): DelegateConfig {
  const base = defaultConfig();
  const path = `${root}/DELEGATE_CONFIG.json`;
  let raw: Partial<DelegateConfig> = {};
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return base;
  }
  return {
    ...base,
    ...raw,
    timeouts: { ...base.timeouts, ...(raw.timeouts ?? {}) },
    allowedAgents: raw.allowedAgents ?? base.allowedAgents,
  };
}
