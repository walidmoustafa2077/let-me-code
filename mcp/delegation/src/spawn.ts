import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { DelegateConfig } from "./config.ts";
import { parseModel, resolveModels } from "./config.ts";
import { changedSince, diffStat, statusPorcelain } from "./git.ts";
import { extractText, parseHandoff, type Handoff } from "./handoff.ts";
import type { MessageResult, ModelRef, OpenCodeClient } from "./http.ts";
import { StallError } from "./http.ts";
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
  log_path: string | null;
  /** True when the child was killed for making no progress — a different failure from "failed". */
  stalled?: boolean;
}

const HANDOFF_INSTRUCTION = [
  "",
  "Before your first action: load the skill your instructions name, using the `skill` tool.",
  "If the instructions name no skill, load the one that governs the job you were given.",
  "Working from memory is a failure, even when the output looks right.",
  "",
  "When you have finished, you MUST end your reply with exactly this block:",
  "### HANDOFF",
  "status: done | blocked | needs-input",
  "summary: <one paragraph>",
  "artifacts: <paths created/modified>",
  "skills: <comma-separated skills you actually loaded with the skill tool>",
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
  const prompt = buildPrompt(args.prompt, args.contextFiles ?? []);
  const { candidates } = resolveModels(cfg, args.agent, args.model);

  const parts = [{ type: "text", text: prompt }];
  const attempts: (ModelRef | undefined)[] = candidates.length ? candidates : [undefined];
  const attemptErrors: string[] = [];
  let result: MessageResult | undefined;
  // v2 fixes agent and model on the session itself, so a retried candidate needs its
  // own session. v1 ignores the extra options and creates one session per attempt.
  let sessionId: string | undefined;
  /** One fresh-session retry after a stall, then a hard blocked. Never a third attempt. */
  let stallRetries = 0;

  for (let i = 0; i < attempts.length; i++) {
    const model = attempts[i];
    const label = model ? `${model.providerID}/${model.modelID}` : "default";
    try {
      sessionId = await client.createSession(`job:${args.agent}`, {
        agent: args.agent,
        ...(model ? { model } : {}),
      });
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
      // A stall is not a model failure: retry once in a fresh session, then give up loudly
      // instead of letting the orchestrator sit on it.
      if (err instanceof StallError) {
        await writeLog(root, args.agent, err.sessionId, {
          args,
          baseline,
          stalled: err.message,
        }).catch(() => null);
        attemptErrors.push(`${label}: stalled after ${Math.round(err.stalledMs / 1000)}s`);
        if (stallRetries < 1) {
          stallRetries += 1;
          attempts.push(model);
          continue;
        }
        return {
          status: "blocked",
          stalled: true,
          summary:
            `Child "${args.agent}" produced no output for ${Math.round(err.stalledMs / 1000)}s ` +
            `twice in a row and was aborted both times. Nothing was committed. The ticket did ` +
            `not progress — do not dispatch a third attempt without changing the prompt or ` +
            `splitting the ticket.`,
          handoff: null,
          changed_files: await changedSince(root, baseline),
          diff_stat: await diffStat(root),
          session_id: err.sessionId,
          log_path: null,
        };
      }
      attemptErrors.push(`${label}: ${(err as Error).message}`);
      if (i < attempts.length - 1 && isRetryableModelError(err)) continue;
      if (attemptErrors.length > 1) {
        throw new Error(`all model candidates failed: ${attemptErrors.join(" | ")}`);
      }
      throw err;
    }
  }

  if (!result || !sessionId) {
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
  if (tasks.length === 0) return [];
  // Warm the engine once before the fan-out. Without this every task races the same cold
  // start, and the losers of that race fail with a raw "fetch failed". This is an
  // optimisation only: if it cannot confirm health, the per-request self-heal still runs.
  if (client.canAutoStart) {
    try {
      await client.ensureServer();
    } catch (err) {
      process.stderr.write(
        `[delegation] engine pre-warm failed, dispatching anyway: ${
          err instanceof Error ? err.message : String(err)
        }\n`,
      );
    }
  }
  const stamp = Date.now();
  return Promise.all(
    tasks.map((task, i) => {
      const suffix = Math.random().toString(36).slice(2, 6);
      const worktreePath = join(repoRoot, ".worktrees", `par-${stamp}-${i}-${suffix}`);
      return delegateInWorktree(repoRoot, worktreePath, cfg, client, task);
    }),
  );
}
