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

/** Wire protocol spoken by the configured server. opencode v1 and v2 differ. */
export type ApiMode = "v1" | "v2";

export interface SessionOptions {
  agent?: string;
  model?: ModelRef;
}

interface V2Part {
  type?: string;
  text?: string;
}

interface V2Message {
  type?: string;
  time?: { created?: number; completed?: number };
  content?: V2Part[];
  outcome?: string;
  error?: unknown;
}

interface V2Messages {
  data?: V2Message[];
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * A child session that stopped making visible progress. Thrown instead of waiting out the
 * whole messageMs budget, so a wedged model costs two minutes and not thirty.
 */
export class StallError extends Error {
  readonly sessionId: string;
  readonly stalledMs: number;
  readonly lastActivity: string;

  constructor(sessionId: string, stalledMs: number, lastActivity: string) {
    super(
      `session ${sessionId} stalled: no progress for ${Math.round(stalledMs / 1000)}s ` +
        `(last activity: ${lastActivity})`,
    );
    this.name = "StallError";
    this.sessionId = sessionId;
    this.stalledMs = stalledMs;
    this.lastActivity = lastActivity;
  }
}

/** Cheap progress signal: message count, last type, text content hash, completion time. */
function fingerprintOf(messages: V2Message[]): string {
  const last = messages[messages.length - 1];
  if (!last) return "0:-";
  const text = (last.content ?? []).map((part) => part.text ?? "").join("");
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return `${messages.length}:${last.type ?? "-"}:${text.length}:${hash}:${last.time?.completed ?? 0}`;
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
  private ensuring?: Promise<void>;
  private mode?: ApiMode;

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
      if (allowRetry && this.autoStart && isNetworkError(err)) {
        // Every caller that lost the cold-start race joins the same boot and retries,
        // instead of failing fast with the original transport error.
        await this.ensureInFlight();
        return this.request<T>(path, init, timeoutMs, false);
      }
      throw err;
    }
  }

  /**
   * Single-flight engine start. Concurrent requests share one in-flight boot promise;
   * a boolean gate here would abort the losers of the race rather than let them wait.
   */
  private ensureInFlight(): Promise<void> {
    if (this.ensuring) return this.ensuring;
    const boot = this.ensureServer();
    // `finally` keeps the boot's rejection (and clears the slot once it settles).
    this.ensuring = boot.finally(() => {
      this.ensuring = undefined;
    });
    return this.ensuring;
  }

  /** True when this client is allowed to start the engine itself. */
  get canAutoStart(): boolean {
    return this.autoStart || this.ensureOverride !== undefined;
  }

  /**
   * Run the v1 call first and fall back to the v2 surface only when v1 fails and the
   * server proves it is v2 by answering `/api/info` with a version. A v2 server serves
   * the web app for every unknown path, so a 200/HTML answer is not proof of anything.
   */
  private async call<T>(v1: () => Promise<T>, v2: () => Promise<T>): Promise<T> {
    if (this.mode === "v1") return v1();
    if (this.mode === "v2") return v2();
    try {
      return await v1();
    } catch (err) {
      if (isNetworkError(err) || !(await this.isV2())) throw err;
      this.mode = "v2";
      return v2();
    }
  }

  private async isV2(): Promise<boolean> {
    try {
      const info = await this.raw<{ version?: unknown }>(
        "/api/info",
        { method: "GET" },
        this.cfg.timeouts.healthMs,
      );
      return typeof info?.version === "string";
    } catch {
      return false;
    }
  }

  /** Start the configured engine in the project root if it is not already healthy. */
  async ensureServer(): Promise<void> {
    if (this.ensureOverride) return this.ensureOverride();
    await ensureEngine(this.root, this.cfg, () => this.checkHealth());
    this.mode = undefined;
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
    return this.call(
      () => this.request("/global/health", { method: "GET" }, this.cfg.timeouts.healthMs, false),
      async () => {
        const info = await this.raw<{ version?: string }>(
          "/api/info",
          { method: "GET" },
          this.cfg.timeouts.healthMs,
        );
        return { healthy: true, version: info.version };
      },
    );
  }

  agents(): Promise<Array<{ name: string }>> {
    return this.call(
      () => this.request("/agent", { method: "GET" }, this.cfg.timeouts.healthMs),
      async () => {
        const r = await this.request<{ data?: Array<{ id?: string; name?: string }> }>(
          "/api/agent",
          { method: "GET" },
          this.cfg.timeouts.healthMs,
        );
        return (r.data ?? []).map((agent) => ({ name: agent.id ?? agent.name ?? "" }));
      },
    );
  }

  createSession(title: string, options: SessionOptions = {}): Promise<string> {
    return this.call(
      async () => {
        const r = await this.request<{ id: string }>("/session", {
          method: "POST",
          body: JSON.stringify({ title }),
        });
        return r.id;
      },
      async () => {
        const body: Record<string, unknown> = { title };
        if (options.agent) body.agent = options.agent;
        if (options.model) body.model = { providerID: options.model.providerID, id: options.model.modelID };
        const r = await this.request<{ data?: { id?: string } }>("/api/session", {
          method: "POST",
          body: JSON.stringify(body),
        });
        const id = r.data?.id;
        if (!id) throw new Error("createSession failed: the server returned no session id");
        return id;
      },
    );
  }

  postMessage(
    id: string,
    body: { agent: string; model?: ModelRef; parts: ChatPart[] },
  ): Promise<MessageResult> {
    return this.call(
      () =>
        this.request<MessageResult>(`/session/${id}/message`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
      () => this.postMessageV2(id, body),
    );
  }

  /** v2 accepts the prompt asynchronously and streams the answer into the session. */
  private async postMessageV2(
    id: string,
    body: { agent: string; model?: ModelRef; parts: ChatPart[] },
  ): Promise<MessageResult> {
    const text = body.parts
      .map((part) => part.text ?? "")
      .filter((part) => part.length > 0)
      .join("\n\n");
    await this.request(`/api/session/${id}/prompt`, {
      method: "POST",
      body: JSON.stringify({ text, delivery: "queue" }),
    });

    const stallMs = this.cfg.timeouts.stallMs;
    const deadline = Date.now() + this.cfg.timeouts.messageMs;
    let fingerprint = "";
    let lastProgress = Date.now();

    for (;;) {
      // A dead server must not eat the stall budget, so the poll GET gets its own short timeout.
      const res = await this.request<V2Messages>(
        `/api/session/${id}/message`,
        { method: "GET" },
        Math.min(15_000, stallMs),
      );
      const messages = res.data ?? [];
      const idle = [...messages].reverse().find((message) => message.type === "idle");
      if (idle) return this.v2Result(id, messages, idle);

      const next = fingerprintOf(messages);
      if (next !== fingerprint) {
        fingerprint = next;
        lastProgress = Date.now();
      }

      const quiet = Date.now() - lastProgress;
      if (quiet >= stallMs) {
        const last = messages[messages.length - 1];
        const detail = last
          ? `${last.type ?? "unknown"} message, ${messages.length} total`
          : "no messages at all";
        // Abort before throwing so the wedged session does not keep burning tokens.
        await this.abort(id).catch(() => ({ aborted: false }));
        throw new StallError(id, quiet, detail);
      }

      if (Date.now() >= deadline) {
        throw new Error(
          `timed out after ${this.cfg.timeouts.messageMs}ms waiting for session ${id} ` +
            `(last progress ${Math.round(quiet / 1000)}s ago)`,
        );
      }

      await delay(500);
    }
  }

  private v2Result(id: string, messages: V2Message[], idle: V2Message): MessageResult {
    const assistants = messages.filter((message) => message.type === "assistant");
    const parts: ChatPart[] = [];
    for (const message of assistants) {
      for (const part of message.content ?? []) {
        if (part.type === "text" && typeof part.text === "string" && part.text.length > 0) {
          parts.push({ type: "text", text: part.text });
        }
      }
    }
    const last = assistants[assistants.length - 1];
    const info: Record<string, unknown> = { ...(last ?? {}), session_id: id };
    if (idle.outcome && idle.outcome !== "succeeded") info.error = idle.error ?? idle.outcome;
    if (!assistants.length) info.error = info.error ?? "the session finished without an assistant message";
    return { info, parts };
  }

  abort(id: string): Promise<{ aborted: boolean }> {
    return this.call(
      () => this.request<{ aborted: boolean }>(`/session/${id}/abort`, { method: "POST" }),
      async () => {
        const r = await this.request<{ interrupted?: boolean }>(`/api/session/${id}/interrupt`, {
          method: "POST",
        });
        return { aborted: r.interrupted === true };
      },
    );
  }
}
