import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { DelegateConfig } from "./config.ts";
import { parseModel, resolveModels } from "./config.ts";
import { changedSince, diffStat, statusPorcelain } from "./git.ts";
import { extractText, parseHandoff, type Handoff } from "./handoff.ts";
import type { MessageResult, OpenCodeClient } from "./http.ts";
import { createWorktree, removeWorktree } from "./worktree.ts";

export interface DelegateArgs {
  agent: string;
  prompt: string;
  contextFiles?: string[];
  model?: string;
  timeoutMs?: number;
}

export interface DelegateResult {
  status: string;
  summary: string;
  handoff: Handoff | null;
  changed_files: string[];
  diff_stat: string;
  session_id: string;
  log_path: string;
}

const HANDOFF_INSTRUCTION = [
  "",
  "When you have finished, you MUST end your reply with exactly this block:",
  "### HANDOFF",
  "status: done | blocked | needs-input",
  "summary: <one paragraph>",
  "artifacts: <paths created/modified>",
  "next: <what the orchestrator should do>",
].join("\n");

export function buildPrompt(prompt: string, contextFiles: string[]): string {
  const ctx = contextFiles.length
    ? `\n\nRead these context files first: ${contextFiles.join(", ")}`
    : "";
  return `${prompt}${ctx}${HANDOFF_INSTRUCTION}`;
}

export function assertInside(root: string, target: string): string {
  const absRoot = resolve(root);
  const abs = resolve(absRoot, target);
  if (abs !== absRoot && !abs.startsWith(absRoot + "\\") && !abs.startsWith(absRoot + "/")) {
    throw new Error(`path escapes repo root: ${target}`);
  }
  return abs;
}

export async function writeLog(
  root: string,
  agent: string,
  sessionId: string,
  payload: unknown,
): Promise<string> {
  const dir = assertInside(root, ".delegation/logs");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${dir}/${stamp}-${agent}-${sessionId}.jsonl`;
  await writeFile(path, JSON.stringify(payload) + "\n", "utf8");
  return path;
}

/**
 * True for provider/model failures that another candidate could plausibly serve:
 * missing model, rate limits, quota exhaustion, missing keys, 429/502/503/504, overload.
 * A generic 500 (e.g. "boom") is NOT retryable, so unrelated bugs still surface.
 */
export function isRetryableModelError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err);
  return /ProviderModelNotFoundError|Model not found|ProviderError|ProviderAuthError|rate.?limit|usage limit|quota|too many requests|No API keys|overloaded|temporarily unavailable|isRetryable|\b(429|502|503|504)\b/i.test(
    msg,
  );
}

/** Pull a human-readable provider error out of an opencode `MessageResult.info`. */
export function extractInfoError(info: unknown): string | null {
  if (!info || typeof info !== "object") return null;
  const err = (info as Record<string, unknown>).error;
  if (!err) return null;
  if (typeof err === "string") return err;
  const o = err as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name : "Error";
  const status = o.statusCode ?? o.status;
  const data = o.data as Record<string, unknown> | undefined;
  const message = (data?.message ?? o.message ?? "") as string;
  return `${name}${status ? ` (${status})` : ""}: ${message || JSON.stringify(o)}`;
}

export async function delegateTask(
  root: string,
  cfg: DelegateConfig,
  client: OpenCodeClient,
  args: DelegateArgs,
): Promise<DelegateResult> {
  const agentKeys = Object.keys(cfg.agents ?? {});
  const allowed = agentKeys.length ? agentKeys : cfg.allowedAgents;
  if (!allowed.includes(args.agent)) {
    throw new Error(`agent "${args.agent}" is not on the allowlist (${allowed.join(", ")})`);
  }

  const baseline = await statusPorcelain(root);
  const sessionId = await client.createSession(`job:${args.agent}`);
  const prompt = buildPrompt(args.prompt, args.contextFiles ?? []);
  const { candidates } = resolveModels(cfg, args.agent, args.model);

  const parts = [{ type: "text", text: prompt }];
  const attempts = candidates.length ? candidates : [undefined];
  const attemptErrors: string[] = [];
  let result: MessageResult | undefined;

  for (let i = 0; i < attempts.length; i++) {
    const model = attempts[i];
    const label = model ? `${model.providerID}/${model.modelID}` : "default";
    try {
      const r = await client.postMessage(sessionId, {
        agent: args.agent,
        ...(model ? { model } : {}),
        parts,
      });
      result = r;
      const infoError = extractInfoError(r.info);
      if (infoError) attemptErrors.push(`${label}: ${infoError}`);
      // opencode can return HTTP 200 with a provider error in info; fall back on those too.
      if (infoError && isRetryableModelError(infoError) && i < attempts.length - 1) continue;
      break;
    } catch (err) {
      attemptErrors.push(`${label}: ${(err as Error).message}`);
      if (i < attempts.length - 1 && isRetryableModelError(err)) continue;
      if (attemptErrors.length > 1) {
        throw new Error(`all model candidates failed: ${attemptErrors.join(" | ")}`);
      }
      throw err;
    }
  }

  if (!result) {
    throw new Error(`no model candidates available (${attemptErrors.join(" | ") || "none configured"})`);
  }

  const changed = await changedSince(root, baseline);
  const stat = await diffStat(root);
  const infoError = extractInfoError(result.info);

  if (infoError) {
    const logPath = await writeLog(root, args.agent, sessionId, { args, baseline, result, infoError });
    return {
      status: "blocked",
      summary: `Provider/session error: ${infoError}`,
      handoff: null,
      changed_files: changed,
      diff_stat: stat,
      session_id: sessionId,
      log_path: logPath,
    };
  }

  const text = extractText(result.parts);
  const handoff = parseHandoff(text);
  const logPath = await writeLog(root, args.agent, sessionId, { args, baseline, result });

  return {
    status: handoff?.status ?? "needs-input",
    summary: handoff?.summary ?? text.slice(-2000),
    handoff,
    changed_files: changed,
    diff_stat: stat,
    session_id: sessionId,
    log_path: logPath,
  };
}

async function delegateInWorktree(
  repoRoot: string,
  worktreePath: string,
  cfg: DelegateConfig,
  client: OpenCodeClient,
  task: DelegateArgs,
): Promise<DelegateResult> {
  await createWorktree(repoRoot, worktreePath);
  try {
    return await delegateTask(worktreePath, cfg, client, task);
  } finally {
    await removeWorktree(repoRoot, worktreePath);
  }
}

export async function delegateParallel(
  repoRoot: string,
  cfg: DelegateConfig,
  client: OpenCodeClient,
  tasks: DelegateArgs[],
): Promise<DelegateResult[]> {
  const stamp = Date.now();
  return Promise.all(
    tasks.map((task, i) => {
      const suffix = Math.random().toString(36).slice(2, 6);
      const worktreePath = join(repoRoot, ".worktrees", `par-${stamp}-${i}-${suffix}`);
      return delegateInWorktree(repoRoot, worktreePath, cfg, client, task);
    }),
  );
}
