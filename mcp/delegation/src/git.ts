import { execFile } from "node:child_process";

export function run(
  cmd: string,
  args: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code =
        err && typeof (err as { code?: number }).code === "number"
          ? (err as { code: number }).code
          : err
            ? 1
            : 0;
      resolve({ code, stdout: stdout.toString(), stderr: stderr.toString() });
    });
  });
}

export async function statusPorcelain(root: string): Promise<string> {
  const { stdout } = await run("git", ["status", "--porcelain"], root);
  return stdout;
}

function fileOf(line: string): string | null {
  const m = line.match(/^(?:.{2})\s+(.*)$/);
  if (!m) return null;
  let p = m[1].trim();
  if (p.includes(" -> ")) p = p.split(" -> ").pop() as string;
  return p.replace(/^"|"$/g, "");
}

export async function changedSince(root: string, baseline: string): Promise<string[]> {
  const before = new Set(baseline.split(/\r?\n/).filter(Boolean));
  const after = (await statusPorcelain(root)).split(/\r?\n/).filter(Boolean);
  const out: string[] = [];
  for (const line of after) {
    if (before.has(line)) continue;
    const f = fileOf(line);
    if (f) out.push(f);
  }
  return out;
}

export async function diffStat(root: string): Promise<string> {
  const tracked = await run("git", ["diff", "--stat", "HEAD"], root);
  const untracked = await run("git", ["ls-files", "--others", "--exclude-standard"], root);
  const extra = untracked.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((f) => ` ${f} (new)`)
    .join("\n");
  return [tracked.stdout.trim(), extra].filter(Boolean).join("\n");
}

export async function headCommit(root: string): Promise<string> {
  const { stdout } = await run("git", ["rev-parse", "HEAD"], root);
  return stdout.trim();
}
