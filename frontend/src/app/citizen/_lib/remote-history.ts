export type SavedSession = { sessionId: string; citizenToken: string };
export type RemoteHistory = {
  id: string; createdAt: string; state: string; outcome: string;
  transcript: { id: string; sequence: number; role: "citizen" | "assistant" | "system"; text: string; inputMode: string }[];
};

const historyKey = "120bridge:session-credentials";
const activeKey = "120bridge:mvp:citizen";

function isSavedSession(value: unknown): value is SavedSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<SavedSession>;
  return typeof session.sessionId === "string" && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(session.sessionId) &&
    typeof session.citizenToken === "string" && /^cit_[\w-]{43}$/.test(session.citizenToken);
}

export function savedSessions(): SavedSession[] {
  let sessions: SavedSession[] = [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(historyKey) ?? "[]");
    sessions = Array.isArray(parsed) ? parsed.filter(isSavedSession) : [];
  } catch { /* The active session may still be available in this tab. */ }
  try {
    const active: unknown = JSON.parse(sessionStorage.getItem(activeKey) ?? "null");
    if (isSavedSession(active) && !sessions.some((item) => item.sessionId === active.sessionId)) sessions.push(active);
  } catch { /* Persistent credentials may still be available. */ }
  return sessions;
}

export function rememberSession(session: SavedSession): boolean {
  try {
    const sessions = savedSessions().filter((item) => item.sessionId !== session.sessionId);
    localStorage.setItem(historyKey, JSON.stringify([session, ...sessions]));
    return true;
  } catch { return false; }
}

export async function fetchHistory(session: SavedSession, signal?: AbortSignal): Promise<RemoteHistory> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(session.sessionId)}/history`, {
    headers: { Authorization: `Bearer ${session.citizenToken}` }, cache: "no-store", signal,
  });
  if (!response.ok) throw new Error("상담 내역을 불러오지 못했습니다.");
  const result = await response.json();
  return result.data as RemoteHistory;
}
