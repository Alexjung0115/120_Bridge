"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Entry = { sessionId: string; receivedAt: string };
type Detail = { sessionId: string; revision: number; state: string; transcript: { id: string; role: string; text: string }[]; summary: { coreLines: string[]; confirmation: string } | null };

class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function api<T>(url: string, body?: object): Promise<T> {
  const response = await fetch(url, { method: body ? "POST" : "GET", cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new RequestError(result?.error?.message ?? "상담 정보를 불러오지 못했습니다.", response.status);
  return result.data;
}

export function LiveQueue() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ sessionId: string; revision: number; commandId: string } | null>(null);
  const refresh = useCallback(async () => {
    try {
      const result = await api<{ items: Entry[] }>("/api/counselor/queue");
      setEntries(result.items);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "대기열을 불러오지 못했습니다."); }
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [refresh]);

  async function select(id: string) {
    setBusy(true);
    try { setDetail(await api<Detail>(`/api/counselor/sessions/${id}`)); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "상담을 불러오지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function claim() {
    if (!detail) return;
    setBusy(true);
    const command = pending.current?.sessionId === detail.sessionId ? pending.current : { sessionId: detail.sessionId, revision: detail.revision, commandId: crypto.randomUUID() };
    pending.current = command;
    try {
      await api(`/api/counselor/sessions/${command.sessionId}/actions`, { action: "claim", baseRevision: command.revision, commandId: command.commandId });
      pending.current = null;
      setDetail(await api<Detail>(`/api/counselor/sessions/${command.sessionId}`));
      await refresh();
    } catch (cause) {
      if (cause instanceof RequestError && cause.status >= 400 && cause.status < 500 && cause.status !== 408) pending.current = null;
      setError(cause instanceof Error ? cause.message : "상담을 수락하지 못했습니다.");
    }
    finally { setBusy(false); }
  }

  return <section aria-labelledby="live-queue-title" className="mx-auto max-w-[2000px] space-y-4 px-4 pt-8">
    <h1 id="live-queue-title" className="text-2xl font-bold">실제 상담 대기열</h1>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <Button type="button" variant="outline" onClick={() => void refresh()}>대기열 새로고침</Button>
    {entries.length ? <ul className="space-y-2">{entries.map((entry) => <li key={entry.sessionId}>
      <Button type="button" variant="outline" disabled={busy} onClick={() => void select(entry.sessionId)}>{new Date(entry.receivedAt).toLocaleString("ko-KR")} 상담 보기</Button>
    </li>)}</ul> : <p>대기 중인 상담이 없습니다.</p>}
    {detail && <div className="space-y-3 rounded border border-slate-300 bg-white p-4">
      <h2 className="text-xl font-bold">상담 상세</h2>
      <p>상태: {detail.state === "queued" ? "대기 중" : detail.state === "serving" ? "상담 수락" : detail.state}</p>
      <p>요약: {detail.summary?.coreLines.join(" / ") || "전달된 요약이 없습니다."} {detail.summary?.confirmation === "unconfirmed" ? "(시민 미확인)" : ""}</p>
      <h3 className="font-bold">대화 기록</h3>
      {detail.transcript?.length ? <ul>{detail.transcript.map((turn) => <li key={turn.id} className="whitespace-pre-wrap">{turn.role === "citizen" ? "시민" : "상담"}: {turn.text}</li>)}</ul> : <p>전달된 대화가 없습니다.</p>}
      {detail.state === "queued" && <Button type="button" disabled={busy} onClick={() => void claim()}>상담 수락</Button>}
    </div>}
  </section>;
}
