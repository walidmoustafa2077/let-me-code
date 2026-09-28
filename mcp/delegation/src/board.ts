import { readFile, writeFile } from "node:fs/promises";

export type Column = "Todo" | "In Progress" | "In Review" | "Blocked" | "Done";

export interface BoardRow {
  ticket: string;
  title: string;
  extra: string[];
}

export interface BoardState {
  todo: BoardRow[];
  inProgress: BoardRow[];
  inReview: BoardRow[];
  blocked: BoardRow[];
  done: BoardRow[];
}

const ORDER: Column[] = ["Todo", "In Progress", "In Review", "Blocked", "Done"];

const HEADER: Record<Column, string> = {
  Todo: "| Ticket | Title | Depends on |",
  "In Progress": "| Ticket | Title | Owner | Started |",
  "In Review": "| Ticket | Title | Reviewer |",
  Blocked: "| Ticket | Title | Reason | Since |",
  Done: "| Ticket | Title | Commit |",
};

const SEP = "| --- | --- | --- |";

export function boardPath(root: string): string {
  return `${root}/BOARD.md`;
}

export function renderBoard(feature: string, rows: Record<Column, BoardRow[]>): string {
  const out: string[] = [`# BOARD — ${feature}`, ""];
  for (const col of ORDER) {
    out.push(`## ${col}`, HEADER[col], SEP);
    for (const r of rows[col]) out.push(`| ${r.ticket} | ${r.title} | ${r.extra.join(" | ")} |`);
    out.push("");
  }
  return out.join("\n");
}

export async function initBoard(root: string, feature: string): Promise<void> {
  const empty: Record<Column, BoardRow[]> = {
    Todo: [],
    "In Progress": [],
    "In Review": [],
    Blocked: [],
    Done: [],
  };
  try {
    await readFile(boardPath(root), "utf8");
    return;
  } catch {
    await writeFile(boardPath(root), renderBoard(feature, empty), "utf8");
  }
}

function parseCells(line: string): string[] {
  return line.split("|").slice(1, -1).map((c) => c.trim());
}

export async function readBoard(root: string): Promise<BoardState> {
  const text = await readFile(boardPath(root), "utf8");
  const lines = text.split(/\r?\n/);
  const state: BoardState = { todo: [], inProgress: [], inReview: [], blocked: [], done: [] };
  const key: Record<Column, keyof BoardState> = {
    Todo: "todo",
    "In Progress": "inProgress",
    "In Review": "inReview",
    Blocked: "blocked",
    Done: "done",
  };
  let current: Column | null = null;
  let skipSep = false;
  for (const line of lines) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      const col = h[1] as Column;
      current = ORDER.includes(col) ? col : null;
      skipSep = true;
      continue;
    }
    if (!current || !line.trim().startsWith("|")) continue;
    if (skipSep) {
      skipSep = false;
      continue;
    }
    if (line.includes("---")) continue;
    const cells = parseCells(line);
    if (!cells[0]) continue;
    state[key[current]].push({ ticket: cells[0], title: cells[1] ?? "", extra: cells.slice(2) });
  }
  return state;
}

export async function moveTicket(
  root: string,
  ticket: string,
  column: Column,
  note?: string,
): Promise<BoardState> {
  const state = await readBoard(root);
  const rows: Record<Column, BoardRow[]> = {
    Todo: state.todo,
    "In Progress": state.inProgress,
    "In Review": state.inReview,
    Blocked: state.blocked,
    Done: state.done,
  };
  let found: BoardRow | undefined;
  for (const col of ORDER) {
    const i = rows[col].findIndex((r) => r.ticket === ticket);
    if (i !== -1) {
      found = rows[col].splice(i, 1)[0];
      break;
    }
  }
  const row: BoardRow = found ?? { ticket, title: "", extra: [] };
  if (note !== undefined) row.extra = [note];
  rows[column].push(row);
  const feature = (await readFile(boardPath(root), "utf8")).match(/^# BOARD — (.*)$/m)?.[1] ?? "feature";
  await writeFile(boardPath(root), renderBoard(feature, rows), "utf8");
  return readBoard(root);
}
