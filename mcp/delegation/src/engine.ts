import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";

export interface ServerAddress {
  host: string;
  port: number;
}

export interface EngineLock {
  pid: number;
  port: number;
  url: string;
  startedAt: string;
}

export interface EnsureResult {
  started: boolean;
  reused: boolean;
  pid?: number;
}

export interface EnsureServerOptions {
  /** Override the engine executable (defaults to `opencode`, shelled on win32). */
  command?: string;
  /** How long to wait for a freshly spawned or locked engine to become healthy. */
  spawnTimeoutMs?: number;
  /** Health-poll interval. */
  pollMs?: number;
  /** Test seam: replace the real spawn with a recorder. Returns the child pid. */
  spawnImpl?: (root: string, port: number, command: string) => number | undefined;
}

export interface EngineDiagnostics {
  serverUrl: string;
  host: string;
  port: number;
  portOpen: boolean;
  healthy: boolean;
  lock: EngineLock | null;
  lockAlive: boolean;
}

const DEFAULT_SPAWN_TIMEOUT_MS = 30000;
const DEFAULT_POLL_MS = 300;

export function parseServerUrl(url: string): ServerAddress {
  const parsed = new URL(url);
  const fallback = parsed.protocol === "https:" ? 443 : 80;
  return { host: parsed.hostname, port: Number(parsed.port || fallback) };
}

export function lockPath(root: string, port: number): string {
  return join(root, ".delegation", `engine-${port}.lock`);
}

/** True when the OS reports the pid as a live process (EPERM means it exists but is not ours). */
export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Resolve true when something is accepting TCP connections at host:port. */
export function isPortOpen(host: string, port: number, timeoutMs = 750): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    let settled = false;
    const finish = (open: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

export function readLock(root: string, port: number): EngineLock | null {
  const path = lockPath(root, port);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as EngineLock;
  } catch {
    return null;
  }
}

export function writeLock(root: string, lock: EngineLock): void {
  const dir = join(root, ".delegation");
  mkdirSync(dir, { recursive: true });
  writeFileSync(lockPath(root, lock.port), `${JSON.stringify(lock, null, 2)}\n`, "utf8");
}

export function clearLock(root: string, port: number): void {
  rmSync(lockPath(root, port), { force: true });
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll `check` until it passes or the deadline elapses. */
export async function waitForHealth(
  check: () => Promise<boolean>,
  timeoutMs: number,
  pollMs = DEFAULT_POLL_MS,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check().catch(() => false)) return true;
    if (Date.now() >= deadline) return false;
    await delay(pollMs);
  }
}

/** Spawn a detached `opencode serve --port <port>` in the project root. */
export function spawnEngine(root: string, port: number, command = "opencode"): number | undefined {
  const child = spawn(command, ["serve", "--port", String(port)], {
    cwd: root,
    detached: true,
    // "ignore" avoids the WriteStream drain-listener leak of redirected stdio.
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  child.unref();
  return child.pid;
}

/**
 * Guarantee the configured opencode server is reachable, starting exactly one in `root` when
 * it is not. A pid lock makes the start single-flight across concurrent MCP instances, and an
 * occupied-but-unhealthy port is treated as an error rather than a reason to spawn a duplicate.
 */
export async function ensureServer(
  root: string,
  cfg: { serverUrl: string; timeouts: { healthMs: number } },
  check: () => Promise<boolean>,
  opts: EnsureServerOptions = {},
): Promise<EnsureResult> {
  const { host, port } = parseServerUrl(cfg.serverUrl);
  if (await check().catch(() => false)) {
    return { started: false, reused: true };
  }

  const spawnTimeout = opts.spawnTimeoutMs ?? DEFAULT_SPAWN_TIMEOUT_MS;
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;

  const lock = readLock(root, port);
  if (lock && isPidAlive(lock.pid)) {
    // Another MCP generation is bringing this exact port up; wait rather than race it.
    if (await waitForHealth(check, Math.min(spawnTimeout, cfg.timeouts.healthMs), pollMs)) {
      return { started: false, reused: true, pid: lock.pid };
    }
  }

  if (await isPortOpen(host, port)) {
    if (await waitForHealth(check, cfg.timeouts.healthMs, pollMs)) {
      return { started: false, reused: true };
    }
    throw new Error(
      `port ${port} is occupied by a process that is not a healthy opencode server; ` +
        `refusing to spawn a duplicate (stop the stale process or change serverUrl)`,
    );
  }

  const spawnImpl = opts.spawnImpl ?? ((r, p, c) => spawnEngine(r, p, c));
  const pid = spawnImpl(root, port, opts.command ?? "opencode");
  writeLock(root, {
    pid: pid ?? 0,
    port,
    url: cfg.serverUrl,
    startedAt: new Date().toISOString(),
  });

  if (!(await waitForHealth(check, spawnTimeout, pollMs))) {
    throw new Error(
      `failed to start opencode server on port ${port} within ${spawnTimeout}ms; ` +
        `check that \`opencode\` is on PATH and the project is initialised`,
    );
  }
  return { started: true, reused: false, pid };
}

/** Snapshot of the engine's reachability and lock state, for engine_status. */
export async function engineDiagnostics(
  root: string,
  cfg: { serverUrl: string; timeouts: { healthMs: number } },
  check: () => Promise<boolean>,
): Promise<EngineDiagnostics> {
  const { host, port } = parseServerUrl(cfg.serverUrl);
  const lock = readLock(root, port);
  const healthy = await check().catch(() => false);
  return {
    serverUrl: cfg.serverUrl,
    host,
    port,
    portOpen: healthy || (await isPortOpen(host, port)),
    healthy,
    lock,
    lockAlive: lock ? isPidAlive(lock.pid) : false,
  };
}
