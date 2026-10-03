import type { DelegateConfig } from "./config.ts";
import { ensureServer as ensureEngine, engineDiagnostics, type EngineDiagnostics } from "./engine.ts";

export interface ChatPart {
  type: string;
  text?: string;
}

export interface MessageResult {
  info: unknown;
  parts: ChatPart[];
}

export interface ModelRef {
  providerID: string;
  modelID: string;
}

export interface OpenCodeClientOptions {
  /** Project root used when auto-starting the engine. */
  root?: string;
  /** When true, a network failure triggers a one-shot ensureServer + retry. */
  autoStart?: boolean;
  /** Test seam: replace the engine-ensure step entirely. */
  ensure?: () => Promise<void>;
}

export function authHeaders(): Record<string, string> {
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  if (!password) return {};
  const user = process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
  const token = Buffer.from(`${user}:${password}`).toString("base64");
  return { authorization: `Basic ${token}` };
}

/**
 * True for transport-level failures (server down / socket torn down / connection refused).
 * Deliberately excludes AbortError so a timeout is never mistaken for a dead engine.
 */
export function isNetworkError(err: unknown): boolean {
  const e = err as { name?: string; message?: string; cause?: { code?: string } } | undefined;
  if (!e) return false;
  if (e.name === "AbortError") return false;
  const code = String(e.cause?.code ?? "");
  const text = `${e.message ?? ""} ${code}`;
  if (/ECONNREFUSED|ECONNRESET|EPIPE|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(text)) return true;
  return /^TypeError$/i.test(e.name ?? "") && /fetch failed/i.test(e.message ?? "");
}

export class OpenCodeClient {
  private base: string;
  private fetchImpl: typeof fetch;
  private cfg: DelegateConfig;
  private root: string;
  private autoStart: boolean;
  private ensureOverride?: () => Promise<void>;
  private ensuring = false;

  constructor(cfg: DelegateConfig, fetchImpl?: typeof fetch, options: OpenCodeClientOptions = {}) {
    this.cfg = cfg;
    this.base = cfg.serverUrl.replace(/\/$/, "");
    this.fetchImpl = fetchImpl ?? fetch;
    this.root = options.root ?? process.cwd();
    this.autoStart = options.autoStart ?? false;
    this.ensureOverride = options.ensure;
  }

  private async raw<T>(path: string, init: RequestInit | undefined, timeoutMs: number): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.base}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { "content-type": "application/json", ...authHeaders(), ...(init?.headers ?? {}) },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${path}${body ? ` ${body.slice(0, 500)}` : ""}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private async request<T>(
    path: string,
    init?: RequestInit,
    timeoutMs?: number,
    allowRetry = true,
  ): Promise<T> {
    const ms = timeoutMs ?? this.cfg.timeouts.messageMs;
    try {
      return await this.raw<T>(path, init, ms);
    } catch (err) {
      if (allowRetry && !this.ensuring && this.autoStart && isNetworkError(err)) {
        this.ensuring = true;
        try {
          await this.ensureServer();
        } finally {
          this.ensuring = false;
        }
        return this.request<T>(path, init, timeoutMs, false);
      }
      throw err;
    }
  }

  /** Start the configured engine in the project root if it is not already healthy. */
  async ensureServer(): Promise<void> {
    if (this.ensureOverride) return this.ensureOverride();
    await ensureEngine(this.root, this.cfg, () => this.checkHealth());
  }

  /** Pure reachability probe: never auto-starts, never throws. */
  private async checkHealth(): Promise<boolean> {
    return this.health().then((h) => h.healthy).catch(() => false);
  }

  /** Engine reachability + lock snapshot. */
  diagnostics(): Promise<EngineDiagnostics> {
    return engineDiagnostics(this.root, this.cfg, () => this.checkHealth());
  }

  health(): Promise<{ healthy: boolean; version?: string }> {
    return this.request("/global/health", { method: "GET" }, this.cfg.timeouts.healthMs, false);
  }

  agents(): Promise<Array<{ name: string }>> {
    return this.request("/agent", { method: "GET" }, this.cfg.timeouts.healthMs);
  }

  async createSession(title: string): Promise<string> {
    const r = await this.request<{ id: string }>("/session", {
      method: "POST",
      body: JSON.stringify({ title }),
    });
    return r.id;
  }

  postMessage(
    id: string,
    body: { agent: string; model?: ModelRef; parts: ChatPart[] },
  ): Promise<MessageResult> {
    return this.request<MessageResult>(`/session/${id}/message`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  abort(id: string): Promise<{ aborted: boolean }> {
    return this.request(`/session/${id}/abort`, { method: "POST" });
  }
}
