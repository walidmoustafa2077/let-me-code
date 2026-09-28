import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DelegateConfig } from "./config.ts";
import { changedSince, diffStat, statusPorcelain } from "./git.ts";
import { extractText, parseHandoff, type Handoff } from "./handoff.ts";
import type { OpenCodeClient } from "./http.ts";

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

function assertInside(root: string, target: string): string {
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

export async function delegateTask(
  root: string,
  cfg: DelegateConfig,
  client: OpenCodeClient,
  args: DelegateArgs,
): Promise<DelegateResult> {
  if (!cfg.allowedAgents.includes(args.agent)) {
    throw new Error(`agent "${args.agent}" is not on the allowlist (${cfg.allowedAgents.join(", ")})`);
  }

  const baseline = await statusPorcelain(root);
  const sessionId = await client.createSession(`job:${args.agent}`);
  const prompt = buildPrompt(args.prompt, args.contextFiles ?? []);
  const model = args.model ?? cfg.defaultModel;

  const result = await client.postMessage(sessionId, {
    agent: args.agent,
    model,
    parts: [{ type: "text", text: prompt }],
  });

  const text = extractText(result.parts);
  const handoff = parseHandoff(text);
  const changed = await changedSince(root, baseline);
  const stat = await diffStat(root);
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
