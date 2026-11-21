import { readStorage, writeStorage } from "./storage";
import { isConsultationMessage, type ConsultationMessage } from "./messages";

type Channel = "voice" | "text";

export type HistoryStatus = "unresolved" | "ai-resolved" | "resolved";
export type HistoryEntry = {
  id: string;
  channel: Channel;
  title: string;
  summary: string;
  status: HistoryStatus;
  createdAt: number;
  messages?: ConsultationMessage[];
};

export const statusLabel = { unresolved: "미해결", "ai-resolved": "AI 상담으로 해결", resolved: "해결 완료" };
export const historyDateFormat = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul",
});

const historyKey = "120bridge:consultation-history";
export const resultHistoryIdKey = "120bridge:result-history-id";
const changed = "120bridge:history-changed";

export function subscribeHistory(callback: () => void) {
  window.addEventListener(changed, callback);
  return () => window.removeEventListener(changed, callback);
}

export function readHistorySnapshot() {
  return readStorage("session", historyKey);
}

function isEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<HistoryEntry>;
  return typeof entry.id === "string" && typeof entry.title === "string" &&
    typeof entry.summary === "string" && typeof entry.createdAt === "number" &&
    Number.isFinite(entry.createdAt) && Math.abs(entry.createdAt) <= 8.64e15 &&
    (entry.channel === "voice" || entry.channel === "text") &&
    (entry.status === "unresolved" || entry.status === "ai-resolved" || entry.status === "resolved");
}

export function parseHistory(value: string | null): HistoryEntry[] {
  try {
    const data: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(data) ? data.filter(isEntry).map((entry) => ({
      ...entry,
      messages: Array.isArray(entry.messages)
        ? entry.messages.filter(isConsultationMessage).sort((a, b) => a.sequence - b.sequence)
        : [],
    })) : [];
  } catch {
    return [];
  }
}

export function saveHistoryEntry(entry: Omit<HistoryEntry, "createdAt">) {
  const entries = parseHistory(readHistorySnapshot());
  const createdAt = entries.find((previous) => previous.id === entry.id)?.createdAt ?? Date.now();
  const next = [{ ...entry, createdAt }, ...entries.filter((previous) => previous.id !== entry.id)];
  if (!writeStorage("session", historyKey, JSON.stringify(next))) return false;
  window.dispatchEvent(new Event(changed));
  return true;
}
