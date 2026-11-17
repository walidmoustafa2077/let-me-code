import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { run, statusPorcelain } from "./git.ts";

export interface HaltResult {
  aborted_sessions: string[];
  snapshot_path: string | null;
  reverted: boolean;
}

function toIds(value: unknown): string[] {
  const one = (v: unknown): string | null => {
    if (typeof v === "string" && v) return v;
    if (v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string") {
      return (v as { id: string }).id;
    }
    return null;
  };
  if (value == null) return [];
  if (value instanceof Set) {
    return [...value].map(one).filter((x): x is string => x !== null);
  }
  if (Array.isArray(value)) {
    return value.map(one).filter((x): x is string => x !== null);
  }
  const single = one(value);
  return single ? [single] : [];
}

async function collectSessionIds(client: any): Promise<string[]> {
  if (!client) return [];
  if (Array.isArray(client) || client instanceof Set) return toIds(client);

  const ids: string[] = [];
  for (const method of ["listSessions", "listActiveSessions"]) {
    if (typeof client[method] === "function") {
      try {
        ids.push(...toIds(await client[method]()));
      } catch {
        // an unresponsive listing must not block the halt
      }
    }
  }
  for (const prop of ["activeSessionIds", "sessionIds", "sessions"]) {
    ids.push(...toIds(client[prop]));
  }
  return [...new Set(ids)];
}

async function abortSessions(client: any, ids: string[]): Promise<string[]> {
  if (!client || typeof client !== "object") return [];
  const aborter =
    typeof client.abort === "function"
      ? client.abort.bind(client)
      : typeof client.abortSession === "function"
        ? client.abortSession.bind(client)
        : null;
  if (!aborter) return [];

  const done: string[] = [];
  for (const id of ids) {
    try {
      await aborter(id);
      done.push(id);
    } catch {
      // a failed abort must not stop the revert
    }
  }
  return done;
}

async function generatePatch(root: string): Promise<string> {
  await run("git", ["add", "--intent-to-add", "."], root);
  const hasHead = (await run("git", ["rev-parse", "--verify", "HEAD"], root)).code === 0;
  const diff = await run("git", ["diff", hasHead ? "HEAD" : "--cached"], root);
  await run("git", ["reset", "-q"], root);
  const body = diff.stdout;
  return body === "" || body.endsWith("\n") ? body : `${body}\n`;
}

export async function haltAndRevert(
  repoRoot: string,
  client?: any,
  reason?: string,
): Promise<HaltResult> {
  void reason;

  const aborted_sessions = await abortSessions(client, await collectSessionIds(client));

  const dirty = (await statusPorcelain(repoRoot)).trim().length > 0;
  if (!dirty) {
    return { aborted_sessions, snapshot_path: null, reverted: false };
  }

  const patch = await generatePatch(repoRoot);
  await run("git", ["checkout", "--", "."], repoRoot);
  await run("git", ["clean", "-fd"], repoRoot);

  const dir = join(repoRoot, ".delegation", "snapshots");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapshotPath = join(dir, `${stamp}.patch`);
  await writeFile(snapshotPath, patch, "utf8");

  return { aborted_sessions, snapshot_path: snapshotPath, reverted: true };
}
