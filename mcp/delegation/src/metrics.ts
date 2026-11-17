import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseHandoff } from "./handoff.ts";

export interface AgentMetrics {
  total_runs: number;
  outcomes: { done: number; blocked: number; needs_input: number };
  avg_duration_ms: number;
  min_duration_ms: number;
  max_duration_ms: number;
  total_files_changed: number;
}

export interface RecentFailure {
  session_id: string;
  agent: string;
  summary: string;
  timestamp: string;
}

export interface MetricsSummary {
  total_sessions: number;
  agents: Record<string, AgentMetrics>;
  recent_failures: RecentFailure[];
}

export interface MetricsFilter {
  agent?: string;
  limit?: number;
}

type OutcomeBucket = "done" | "blocked" | "needs_input";

interface LogEntry {
  session_id: string;
  agent: string;
  outcome: OutcomeBucket;
  status: string;
  summary: string;
  duration_ms: number;
  changed_files: number;
  timestamp: string;
}

const ISO_STAMP = /(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/;
const DATE_STAMP = /(\d{4}-\d{2}-\d{2})/;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function timestampFromFile(file: string): string {
  const iso = file.match(ISO_STAMP);
  if (iso) return `${iso[1]}T${iso[2]}:${iso[3]}:${iso[4]}.${iso[5]}Z`;
  const date = file.match(DATE_STAMP);
  return date ? date[1] : "";
}

function handoffFromResult(result: unknown): { status: string; summary: string } | null {
  const parts = asRecord(result).parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .map((part) => asRecord(part))
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("");
  const handoff = parseHandoff(text);
  return handoff ? { status: handoff.status, summary: handoff.summary } : null;
}

function bucketOf(status: string): OutcomeBucket {
  const normalized = status.toLowerCase();
  if (normalized === "done") return "done";
  if (normalized === "blocked") return "blocked";
  return "needs_input";
}

function normalizeEntry(raw: unknown, file: string): LogEntry | null {
  if (!raw || typeof raw !== "object") return null;

  const entry = raw as Record<string, unknown>;
  const payload = asRecord(entry.payload);
  const args = asRecord(entry.args);
  const result = asRecord(entry.result);
  const info = asRecord(result.info);
  const time = asRecord(info.time);

  const handoff = handoffFromResult(result);
  const status = (
    asString(payload.status) ??
    asString(entry.status) ??
    handoff?.status ??
    "needs-input"
  ).toLowerCase();

  const created = asNumber(time.created);
  const completed = asNumber(time.completed);
  const durationFromClock =
    created !== undefined && completed !== undefined && completed >= created
      ? completed - created
      : 0;

  const changed = payload.changed_files ?? entry.changed_files;

  return {
    session_id:
      asString(entry.sessionId) ??
      asString(entry.session_id) ??
      asString(info.sessionID) ??
      file,
    agent: asString(entry.agent) ?? asString(args.agent) ?? "unknown",
    outcome: bucketOf(status),
    status,
    summary: asString(payload.summary) ?? handoff?.summary ?? asString(entry.summary) ?? "",
    duration_ms: asNumber(payload.duration_ms) ?? asNumber(entry.duration_ms) ?? durationFromClock,
    changed_files: Array.isArray(changed) ? changed.length : 0,
    timestamp: asString(entry.timestamp) ?? asString(payload.timestamp) ?? timestampFromFile(file),
  };
}

async function readEntries(logsDir: string): Promise<LogEntry[]> {
  let files: string[];
  try {
    files = (await readdir(logsDir)).filter((f) => f.endsWith(".jsonl")).sort();
  } catch {
    return [];
  }

  const entries: LogEntry[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = await readFile(join(logsDir, file), "utf8");
    } catch {
      continue;
    }
    for (const line of content.split(/\r?\n/)) {
      if (line.trim().length === 0) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const entry = normalizeEntry(parsed, file);
      if (entry) entries.push(entry);
    }
  }
  return entries;
}

export async function readMetrics(
  repoRoot: string,
  filter?: MetricsFilter,
): Promise<MetricsSummary> {
  const logsDir = join(repoRoot, ".delegation", "logs");
  const summary: MetricsSummary = { total_sessions: 0, agents: {}, recent_failures: [] };

  const entries = (await readEntries(logsDir)).filter(
    (entry) => !filter?.agent || filter.agent === entry.agent,
  );

  const durations: Record<string, number[]> = {};

  for (const entry of entries) {
    summary.total_sessions += 1;

    let agent = summary.agents[entry.agent];
    if (!agent) {
      agent = {
        total_runs: 0,
        outcomes: { done: 0, blocked: 0, needs_input: 0 },
        avg_duration_ms: 0,
        min_duration_ms: entry.duration_ms,
        max_duration_ms: entry.duration_ms,
        total_files_changed: 0,
      };
      summary.agents[entry.agent] = agent;
      durations[entry.agent] = [];
    }

    agent.total_runs += 1;
    agent.total_files_changed += entry.changed_files;
    if (entry.duration_ms < agent.min_duration_ms) agent.min_duration_ms = entry.duration_ms;
    if (entry.duration_ms > agent.max_duration_ms) agent.max_duration_ms = entry.duration_ms;
    durations[entry.agent].push(entry.duration_ms);

    agent.outcomes[entry.outcome] += 1;
    if (entry.outcome === "blocked") {
      summary.recent_failures.push({
        session_id: entry.session_id,
        agent: entry.agent,
        summary: entry.summary,
        timestamp: entry.timestamp,
      });
    }
  }

  for (const [name, list] of Object.entries(durations)) {
    if (list.length > 0) {
      const total = list.reduce((sum, value) => sum + value, 0);
      summary.agents[name].avg_duration_ms = Math.round(total / list.length);
    }
  }

  summary.recent_failures.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  if (filter?.limit !== undefined && filter.limit > 0) {
    summary.recent_failures = summary.recent_failures.slice(0, filter.limit);
  }

  return summary;
}
