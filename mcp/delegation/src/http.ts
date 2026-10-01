import type { DelegateConfig } from "./config.ts";

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

export function authHeaders(): Record<string, string> {
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  if (!password) return {};
  const user = process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
  const token = Buffer.from(`${user}:${password}`).toString("base64");
  return { authorization: `Basic ${token}` };
}

export class OpenCodeClient {
  private base: string;
  private fetchImpl: typeof fetch;
  private cfg: DelegateConfig;

  constructor(cfg: DelegateConfig, fetchImpl?: typeof fetch) {
    this.cfg = cfg;
    this.base = cfg.serverUrl.replace(/\/$/, "");
    this.fetchImpl = fetchImpl ?? fetch;
  }

  private async request<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T> {
    const controller = new AbortController();
    const ms = timeoutMs ?? this.cfg.timeouts.messageMs;
    const timer = setTimeout(() => controller.abort(), ms);
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

  health(): Promise<{ healthy: boolean; version?: string }> {
    return this.request("/global/health", { method: "GET" }, this.cfg.timeouts.healthMs);
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
