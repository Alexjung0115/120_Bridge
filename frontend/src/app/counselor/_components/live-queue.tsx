"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronDown, MessageCircleMore, Phone, PhoneOff } from "lucide-react";
import { SortSelect } from "./sort-select";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

type Entry = { sessionId: string; receivedAt: string; status: "queued" | "serving" | "transferred_demo" | "completed_demo" };
type Detail = { sessionId: string; revision: number; state: string; transcript: { id: string; role: string; text: string; inputMode?: string }[]; summary: { coreLines: string[]; confirmation: string } | null };

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
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [allStatuses, setAllStatuses] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [sort, setSort] = useState("최신순");
  const [filter, setFilter] = useState("all");
  const paged = useRef(false);
  const requestVersion = useRef(0);
  const loadingMore = useRef(false);
  const pending = useRef<{ sessionId: string; revision: number; commandId: string; action: "claim" | "complete_case" } | null>(null);
  const refresh = useCallback(async (reset = false) => {
    if ((paged.current || loadingMore.current) && !reset) return;
    const version = ++requestVersion.current;
    try {
      const result = await api<{ items: Entry[]; nextCursor: string | null; allStatuses: boolean }>(`/api/counselor/cases?status=${filter}`);
      if (version !== requestVersion.current) return;
      paged.current = false;
      setEntries(result.items);
      setAllStatuses(result.allStatuses);
      setNextCursor(result.nextCursor);
      setError("");
    } catch (cause) { if (version === requestVersion.current) setError(cause instanceof Error ? cause.message : "대기열을 불러오지 못했습니다."); }
  }, [filter]);
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [refresh]);

  async function loadMore() {
    if (!nextCursor) return;
    loadingMore.current = true;
    setBusy(true);
    const version = ++requestVersion.current;
    try {
      const result = await api<{ items: Entry[]; nextCursor: string | null }>(`/api/counselor/cases?status=${filter}&cursor=${encodeURIComponent(nextCursor)}`);
      if (version !== requestVersion.current) return;
      setEntries((current) => [...current, ...result.items.filter((entry) => !current.some((item) => item.sessionId === entry.sessionId))]);
      paged.current = true;
      setNextCursor(result.nextCursor);
      setError("");
    } catch (cause) { if (version === requestVersion.current) setError(cause instanceof Error ? cause.message : "대기열을 불러오지 못했습니다."); }
    finally { loadingMore.current = false; setBusy(false); }
  }

  async function select(id: string) {
    setBusy(true);
    try { setDetail(await api<Detail>(`/api/counselor/sessions/${id}`)); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "상담을 불러오지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function applyAction(action: "claim" | "complete_case") {
    if (!detail) return;
    setBusy(true);
    const command = pending.current?.sessionId === detail.sessionId && pending.current.action === action ? pending.current : { sessionId: detail.sessionId, revision: detail.revision, commandId: crypto.randomUUID(), action };
    pending.current = command;
    try {
      await api(`/api/counselor/sessions/${command.sessionId}/actions`, { action, baseRevision: command.revision, commandId: command.commandId });
      pending.current = null;
      setDetail(await api<Detail>(`/api/counselor/sessions/${command.sessionId}`));
      await refresh(true);
    } catch (cause) {
      if (cause instanceof RequestError && cause.status >= 400 && cause.status < 500 && cause.status !== 408) pending.current = null;
      setError(cause instanceof Error ? cause.message : "상담 상태를 저장하지 못했습니다.");
    }
    finally { setBusy(false); }
  }

  const ordered = [...entries].sort((a, b) => sort === "오래된순"
    ? a.receivedAt.localeCompare(b.receivedAt) : b.receivedAt.localeCompare(a.receivedAt));
  const selected = entries.find((entry) => entry.sessionId === detail?.sessionId);
  const status = detail?.state === "queued" ? "대기" : detail?.state === "serving" ? "진행 중" : detail?.state === "completed_demo" ? "처리 기록 완료" : "상태 확인 필요";

  return <>
    <Card as="section" tone="console" aria-labelledby="queue-title" className="p-5">
      <div className="flex items-center justify-between gap-2">
        <h1 id="queue-title" className="text-2xl font-bold">상담 목록</h1>
        <span className="rounded-lg bg-gray-100 px-3 py-1 text-sm">표시 {entries.length}건</span>
      </div>
      <div className="my-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <NativeSelect aria-label="상담 상태 필터" value={filter} onChange={(event) => { requestVersion.current++; paged.current = false; setEntries([]); setNextCursor(null); setFilter(event.target.value); }}>
          <NativeSelectOption value="all">전체 상태</NativeSelectOption>
          <NativeSelectOption value="queued">대기</NativeSelectOption>
          <NativeSelectOption value="serving" disabled={!allStatuses}>진행 중{allStatuses ? "" : " (준비 중)"}</NativeSelectOption>
          <NativeSelectOption value="completed" disabled={!allStatuses}>완료{allStatuses ? "" : " (준비 중)"}</NativeSelectOption>
        </NativeSelect>
        <SortSelect label="상담 정렬" value={sort} onChange={setSort} />
        <Button type="button" variant="outline" size="compact" onClick={() => void refresh(true)}>새로고침</Button>
      </div>
      {!allStatuses && <p className="mb-3 text-sm text-slate-500">현재는 대기 중인 상담만 조회할 수 있습니다.</p>}
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
      {ordered.length ? <ul className="space-y-3">{ordered.map((entry) => <li key={entry.sessionId}>
        <button type="button" disabled={busy} onClick={() => void select(entry.sessionId)} aria-pressed={detail?.sessionId === entry.sessionId}
          className={`w-full rounded-2xl border p-4 text-left ${detail?.sessionId === entry.sessionId ? "border-2 border-blue-600 bg-blue-50" : "border-slate-300 bg-white"}`}>
          <span className="flex flex-wrap justify-between gap-2 text-sm text-slate-500">
            <span className="break-all">{entry.sessionId}</span>
            <time dateTime={entry.receivedAt}>{new Date(entry.receivedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</time>
          </span>
          <span className="mt-3 flex items-center justify-between gap-2"><span className="font-medium">상담사 연결 요청</span><span className="rounded bg-amber-50 px-2 py-1 text-xs font-bold text-amber-600">{entry.status === "queued" ? "대기" : entry.status === "completed_demo" ? "완료" : "진행 중"}</span></span>
        </button>
      </li>)}</ul> : <p role="status" className="py-4 text-sm text-slate-500">해당 상태의 상담이 없습니다.</p>}
      {nextCursor && <Button type="button" variant="outline" size="compact" className="mt-4" disabled={busy} onClick={() => void loadMore()}>더 보기</Button>}
    </Card>
    <Card as="section" tone="console" aria-labelledby="detail-title" className="min-w-0 p-5 sm:p-7">
      <h2 id="detail-title" className="text-2xl font-bold">상담 상세</h2>
      {detail ? <>
        <div className="mt-6 flex flex-wrap justify-between gap-2 text-lg"><strong className="break-all">상담번호 {detail.sessionId}</strong>
          {selected && <span>접수 일시 {new Date(selected.receivedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</span>}</div>
        <dl className="mt-5 grid grid-cols-[100px_1fr] overflow-hidden rounded border border-slate-300 text-sm sm:text-base">
          {[["민원 제목", detail.summary?.coreLines[0] || "미확인"], ["민원 지역", "미확인"], ["처리상태", status], ["상담 유형", detail.transcript.find((turn) => turn.role === "citizen")?.inputMode === "text" ? "텍스트 상담" : "미확인"]].map(([label, value]) => <div key={label} className="contents">
            <dt className="border-b border-white/30 bg-[#0873c4] px-3 py-2 text-center font-bold text-white">{label}</dt><dd className="break-words border-b border-slate-200 px-3 py-2">{value}</dd>
          </div>)}
        </dl>
        <div className="my-5 border-t border-slate-300" />
        <div className="rounded border border-slate-300 bg-gray-100 p-3"><h3 className="flex items-center gap-2 text-lg font-bold"><MessageCircleMore size={23} /> 상담 요약</h3>
          <p className="mt-3 whitespace-pre-wrap">{detail.summary?.coreLines.join("\n") || "요약 정보가 없습니다."}</p>
          {detail.summary?.confirmation === "unconfirmed" && <p className="mt-2 text-sm">시민 미확인</p>}
        </div>
        <div className="mt-5 rounded border border-slate-300 p-3"><button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="flex w-full items-center justify-between border-b border-slate-300 pb-3 text-left font-medium text-[#173e70]">전체 대화 기록 {expanded ? "접기" : "펼치기"}<ChevronDown className={expanded ? "rotate-180" : ""} /></button>
          {expanded && <div className="flex min-h-48 flex-col justify-end gap-3 pt-4">{detail.transcript?.length ? detail.transcript.map((turn) => <p key={turn.id} className={`max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-4 py-3 text-sm ${turn.role === "citizen" ? "self-start border border-blue-400 bg-blue-50" : "self-end bg-gray-100"}`}><strong>{turn.role === "citizen" ? "시민" : turn.role === "assistant" ? "AI 상담" : "안내"}</strong><br />{turn.text}</p>) : <p className="text-sm text-slate-500">전달된 대화 기록이 없습니다.</p>}</div>}
        </div>
        {detail.state === "queued" && <Button className="mt-5 w-full rounded-xl bg-[#286af1]" type="button" disabled={busy} onClick={() => void applyAction("claim")}><Phone size={20} /> 상담 수락</Button>}
        {detail.state === "serving" && <><p role="status" className="mt-3 text-sm text-blue-700">상담을 수락했습니다.</p><Button className="mt-4 w-full bg-element-danger" type="button" disabled={busy} onClick={() => void applyAction("complete_case")}><PhoneOff size={20} /> 처리 기록 완료</Button></>}
      </> : <div role="status" className="flex min-h-64 flex-col items-center justify-center text-center text-slate-500"><p>표시할 상담이 없습니다.</p><p className="mt-2 text-sm">대기 중인 상담을 선택하면 상세 내용을 확인할 수 있습니다.</p></div>}
    </Card>
  </>;
}
