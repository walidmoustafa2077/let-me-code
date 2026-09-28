export type HandoffStatus = "done" | "blocked" | "needs-input";

export interface Handoff {
  status: HandoffStatus;
  summary: string;
  artifacts: string;
  next: string;
}

const STATUSES: HandoffStatus[] = ["done", "blocked", "needs-input"];

export function parseHandoff(text: string): Handoff | null {
  const idx = text.indexOf("### HANDOFF");
  if (idx === -1) return null;
  const block = text.slice(idx + "### HANDOFF".length);
  const field = (name: string): string => {
    const re = new RegExp(`^\\s*${name}\\s*:\\s*(.*)$`, "im");
    const m = block.match(re);
    return m ? m[1].trim() : "";
  };
  const status = field("status").toLowerCase() as HandoffStatus;
  if (!STATUSES.includes(status)) return null;
  return {
    status,
    summary: field("summary"),
    artifacts: field("artifacts"),
    next: field("next"),
  };
}

export function extractText(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("");
}
