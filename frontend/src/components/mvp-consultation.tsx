"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MicrophoneControl, type VoicePhase } from "@/components/speech/MicrophoneControl";
import { useSpeechController } from "@/components/speech/useSpeechController";
import { BridgeBrand } from "@/components/bridge-brand";
import { consultationLimits } from "@/lib/contracts";
import { rememberSession } from "@/app/citizen/_lib/remote-history";
import type { Session, Turn } from "@/lib/schema/session";

type CitizenSession = {
  sessionId: string;
  citizenToken: string;
};

type CitizenRead = Pick<Session, "revision" | "state" | "transcript"> & {
  processing: boolean;
  summary?: { revision: number; coreLines: string[] } | null;
};

type Queue = {
  items: { sessionId: string; receivedAt: string }[];
  nextCursor: string | null;
};

const stateLabels: Record<Session["state"], string> = {
  active: "상담 중",
  handoff_offered: "상담사 연결 가능",
  summary_confirm: "상담 요약 확인 중",
  sending: "연결 요청을 보내는 중",
  queued: "상담사 연결 대기 중",
  serving: "상담사 연결 완료",
  transferred_demo: "상담사 연결 완료",
  completed_demo: "상담 완료",
  ended: "상담 종료",
  delivery_failed: "연결 요청 실패",
};

const roleLabels: Record<Turn["role"], string> = {
  citizen: "시민",
  assistant: "AI 상담",
  system: "안내",
};

function useRequest() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(task: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "요청에 실패했습니다.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  return { run, busy, error };
}

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function api<T>(path: string, token?: string, body?: object, signal?: AbortSignal): Promise<T> {
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (body) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
  }).catch(() => {
    throw new Error("서버에 연결할 수 없습니다.");
  });
  const envelope = await response.json().catch(() => null);
  if (response.status === 409) {
    throw new ApiError("상담 상태가 바뀌었습니다. 상태를 새로고침한 뒤 다시 시도해 주세요.", response.status);
  }
  if (!response.ok || envelope?.data === undefined) {
    if (response.status === 404 && response.headers.get("content-type")?.includes("text/html")) {
      throw new ApiError("현재 서버에 이 API가 연결되어 있지 않습니다.", response.status);
    }
    throw new ApiError(envelope?.error?.message ?? `서버 응답을 처리할 수 없습니다 (${response.status}).`, response.status);
  }
  return envelope.data;
}

function useCommand() {
  const pending = useRef<{ key: string; commandId: string; baseRevision: number } | null>(null);

  return async function sendCommand(path: string, token: string, baseRevision: number, body: object) {
    const key = JSON.stringify([path, token, body]);
    if (pending.current?.key !== key) {
      pending.current = { key, commandId: crypto.randomUUID(), baseRevision };
    }
    try {
      await api(path, token, {
        ...body,
        commandId: pending.current.commandId,
        baseRevision: pending.current.baseRevision,
      });
      pending.current = null;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500 && cause.status !== 408) {
        pending.current = null;
      }
      throw cause;
    }
  };
}

const citizenStorageKey = "120bridge:mvp:citizen";

function savedCitizenSession(storageKey: string): CitizenSession | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
    if (typeof value?.sessionId === "string" && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value.sessionId) &&
      typeof value.citizenToken === "string" && /^cit_[\w-]{43}$/.test(value.citizenToken)) {
      return { sessionId: value.sessionId, citizenToken: value.citizenToken };
    }
  } catch {
    // Storage may be unavailable in this browser.
  }
  return null;
}

function saveCitizenSession(session: CitizenSession | null, storageKey: string) {
  try {
    if (session) sessionStorage.setItem(storageKey, JSON.stringify(session));
    else sessionStorage.removeItem(storageKey);
    return true;
  } catch {
    return false;
  }
}

function readCitizenSession(current: CitizenSession, signal?: AbortSignal) {
  return api<CitizenRead>(`/api/sessions/${current.sessionId}`, current.citizenToken, undefined, signal);
}

const sectionClass = "min-w-0 space-y-4 border-t border-border-gray pt-5";
const inputClass = "w-full rounded-guide-small border border-border-gray bg-background-white p-3";

const speakingStates: Session["state"][] = ["active", "handoff_offered", "summary_confirm"];

export function CitizenConsultation({ storageScope = "mvp", mode = "text" }: { storageScope?: string; mode?: "text" | "voice" }) {
  const storageKey = storageScope === "mvp" ? citizenStorageKey : `${citizenStorageKey}:${storageScope}`;
  const request = useRequest();
  const sendCommand = useCommand();
  const speech = useSpeechController();
  const voice = mode === "voice";
  const primedFor = useRef<string | null>(null);
  const startKey = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<CitizenSession | null>(null);
  const [snapshot, setSnapshot] = useState<CitizenRead | null>(null);
  const [readError, setReadError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      const saved = savedCitizenSession(storageKey);
      if (saved && !rememberSession(saved)) setStorageError("상담을 다시 찾기 위한 정보를 브라우저에 저장하지 못했습니다.");
      setSession(saved);
      setReady(true);
    });
    return () => { mounted = false; };
  }, [storageKey]);

  const hasSnapshot = snapshot !== null;
  const needsRefresh = !snapshot || snapshot.processing || snapshot.state === "sending" ||
    snapshot.state === "queued";

  useEffect(() => {
    if (!session || !needsRefresh || request.busy) return;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll(current: CitizenSession) {
      try {
        const data = await readCitizenSession(current, controller.signal);
        if (controller.signal.aborted) return;
        setSnapshot(data);
        setReadError("");
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) {
          saveCitizenSession(null, storageKey);
          startKey.current = null;
          setSession(null);
          setSnapshot(null);
          setReadError("이전에 열린 상담을 불러올 수 없습니다. 새 상담을 시작해 주세요.");
          return;
        }
        setReadError("상담 상태를 불러오지 못했습니다. 잠시 후 다시 확인합니다.");
      }
      timer = setTimeout(() => void poll(current), 2_000);
    }

    timer = setTimeout(() => void poll(session), hasSnapshot ? 2_000 : 0);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [session, needsRefresh, request.busy, hasSnapshot, storageKey]);

  async function refresh(current: CitizenSession) {
    setSnapshot(await readCitizenSession(current));
    setReadError("");
  }

  function start() {
    return request.run(async () => {
      const retryStorageKey = `${storageKey}:start-key`;
      try { startKey.current ??= sessionStorage.getItem(retryStorageKey); } catch { /* In-memory retries remain available. */ }
      startKey.current ??= crypto.randomUUID();
      try { sessionStorage.setItem(retryStorageKey, startKey.current); } catch { /* In-memory retries remain available. */ }
      const { sessionId, citizenToken } = await api<CitizenSession>("/api/sessions", undefined, {
        clientSessionKey: startKey.current,
        inputMode: mode,
      });
      const created = { sessionId, citizenToken };
      setStorageError(rememberSession(created) ? "" : "상담을 다시 찾기 위한 정보를 브라우저에 저장하지 못했습니다.");
      if (saveCitizenSession(created, storageKey)) {
        try { sessionStorage.removeItem(retryStorageKey); } catch { /* Session is kept in memory. */ }
      }
      setSession(created);
      await refresh(created);
    });
  }

  function endSession() {
    if (!session || !snapshot) return;
    return request.run(async () => {
      await sendCommand(`/api/sessions/${session.sessionId}/end`, session.citizenToken, snapshot.revision, {});
      setSnapshot(null);
      await refresh(session);
    });
  }

  function newSession() {
    saveCitizenSession(null, storageKey);
    startKey.current = null;
    setSession(null);
    setSnapshot(null);
    setNotice("");
  }

  function send(
    kind: "turns" | "handoff-request" | "summary",
    skipConfirmation = false,
    extra: { text?: string; trigger?: "key" } = {},
  ) {
    if (!session || !snapshot || (kind === "summary" && !snapshot.summary)) return;
    if (kind === "handoff-request") speech.cancel(); // Stop reading and listening the moment a person is requested.
    return request.run(async () => {
      setNotice("");
      const body = kind === "turns"
        ? { text: (extra.text ?? draft).trim(), inputMode: extra.text === undefined ? "text" : "voice" }
        : kind === "summary"
          ? { action: "confirm", summaryRevision: snapshot.summary?.revision }
          : skipConfirmation ? { trigger: "button", skipConfirmation: true } : { trigger: extra.trigger ?? "button" };
      await sendCommand(`/api/sessions/${session.sessionId}/${kind}`, session.citizenToken, snapshot.revision, body);
      if (kind === "turns" && extra.text === undefined) setDraft("");
      setNotice(kind === "turns" ? "메시지를 보냈습니다." : "상담사 연결을 요청했습니다.");
      // Require a fresh revision before enabling another write.
      setSnapshot(null);
      await refresh(session);
    });
  }

  const state = snapshot?.state;
  const consulting = snapshot?.state === "active" || snapshot?.state === "handoff_offered";
  const canSend = !request.busy && !snapshot?.processing && consulting;
  // A person can be requested even while the model is still answering.
  const canHandoff = !request.busy && !!snapshot && consulting;
  const validDraft = draft.trim().length > 0 &&
    Array.from(draft.trim()).length <= consultationLimits.turnCharacters;

  function submitVoice(text: string) {
    if (canSend && Array.from(text).length <= consultationLimits.turnCharacters) void send("turns", false, { text });
    else setDraft(text); // Keep what was heard so it can be edited and sent as text.
  }
  const latest = useRef({ send, submitVoice });
  useEffect(() => { latest.current = { send, submitVoice }; });

  const { speak, markSpoken, cancel: cancelSpeech } = speech;
  useEffect(() => {
    if (!voice || !session || !snapshot) return;
    if (!speakingStates.includes(snapshot.state)) {
      cancelSpeech(); // Final screens never read aloud.
      return;
    }
    const prime = primedFor.current !== session.sessionId;
    primedFor.current = session.sessionId;
    for (const turn of snapshot.transcript) {
      if (turn.role !== "assistant" || turn.outputStatus !== "committed") continue;
      if (prime) markSpoken(turn.id); // Resumed history is captioned, not replayed.
      else speak(turn.id, turn.text);
    }
  }, [voice, session, snapshot, speak, markSpoken, cancelSpeech]);

  // Key "1" asks for a counselor unless the citizen is typing.
  useEffect(() => {
    if (!canHandoff) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "1" || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if ((event.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]")) return;
      event.preventDefault();
      void latest.current.send("handoff-request", false, { trigger: "key" });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canHandoff]);

  const phase: VoicePhase = speech.status === "listening" ? "listening"
    : request.busy || snapshot?.processing ? "thinking"
      : speech.status === "speaking" ? "speaking" : "idle";

  function toggleMic() {
    if (speech.status === "listening") speech.finishListening();
    else speech.listen((text) => latest.current.submitVoice(text));
  }

  return (
    <section id="citizen" aria-labelledby="citizen-title" className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background-white text-text-basic sm:max-w-xl">
      <header className="shrink-0 border-b border-border-gray-light px-6 pb-4 pt-6">
        <BridgeBrand />
        <div className="mt-4 flex items-center justify-between gap-3">
          <h2 id="citizen-title" className="type-heading-small text-text-bolder">{voice ? "음성 상담" : "텍스트 상담"}</h2>
          {session && <Button type="button" variant="outline" size="compact" disabled={!canHandoff} onClick={() => send("handoff-request", true)}>상담사 연결 (1번 키)</Button>}
        </div>
        <Link href={voice ? "/citizen/text" : "/citizen/voice"} className="mt-2 inline-block type-body-small text-text-primary underline underline-offset-4">
          {voice ? "글자로 상담하기" : "음성으로 상담하기"}
        </Link>
      </header>
      {!ready ? <p role="status">이전 상담을 확인하고 있습니다.</p> : !session ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6"><p>상담을 시작해 문의 내용을 입력해주세요.</p><Button onClick={start} disabled={request.busy}>{voice ? "음성 상담 시작" : "텍스트 상담 시작"}</Button></div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 px-6 pt-4">
            <p role="status">
              {snapshot?.processing ? "답변을 작성하고 있습니다." : state ? stateLabels[state] : "상담 상태를 확인하고 있습니다."}
            </p>
            <Button variant="outline" size="compact" disabled={request.busy}
              onClick={() => request.run(() => refresh(session))}>
              상태 새로고침
            </Button>
            {(state === "active" || state === "handoff_offered" || state === "summary_confirm") &&
              <Button variant="outline" size="compact" disabled={request.busy} onClick={endSession}>상담 종료</Button>}
            {(state === "ended" || state === "serving") && <Button variant="outline" size="compact" onClick={newSession}>새 상담 시작</Button>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            <p className="max-w-[85%] rounded-guide-xlarge rounded-bl-none bg-element-gray-lighter px-4 py-3 type-body-small">문의 내용을 입력해주세요.</p>
            {!!snapshot?.transcript.length && <ol aria-label="상담 대화" className="space-y-3 pt-4">
              {snapshot.transcript.map((turn) => (
                <li key={turn.id} className={turn.role === "citizen" ? "ml-auto max-w-[85%] rounded-guide-xlarge bg-element-primary px-4 py-3 text-text-inverse-static" : "max-w-[85%] rounded-guide-xlarge bg-element-gray-lighter px-4 py-3"}>
                  <strong className="sr-only">{roleLabels[turn.role]}</strong>
                  <p className="whitespace-pre-wrap break-words">{turn.text}</p>
                </li>
              ))}
            </ol>}
            {snapshot?.state === "summary_confirm" && snapshot.summary && (
              <section aria-label="전달 요약" className="space-y-3 pt-4">
                <ul>{snapshot.summary.coreLines.map((line, index) => <li key={index}>{line}</li>)}</ul>
                <Button type="button" disabled={request.busy} onClick={() => send("summary")}>요약 승인하고 연결</Button>
              </section>
            )}
          </div>
          <form className="shrink-0 border-t border-border-gray-light px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4" onSubmit={(event) => {
            event.preventDefault();
            if (canSend && validDraft) void send("turns");
          }}>
            {voice && <MicrophoneControl phase={phase} supported={speech.support.recognition} disabled={!canSend && speech.status !== "listening"}
              interim={speech.interim} problem={speech.problem} onToggle={toggleMic} />}
            <label htmlFor="mvp-message" className="sr-only">상담 메시지</label>
            <div className="flex items-end gap-3"><textarea id="mvp-message" rows={1} className="max-h-32 min-h-12 min-w-0 flex-1 resize-none rounded-guide-medium-1 border border-border-gray px-4 py-3 type-body-small" placeholder="메시지를 입력해주세요"
              value={draft} onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (canSend && validDraft) void send("turns"); } }}
              disabled={!canSend} aria-describedby="mvp-message-limit" />
              <Button type="submit" disabled={!canSend || !validDraft}>전송</Button></div>
            <Button type="button" variant="outline" className="mt-3" disabled={!canHandoff} onClick={() => send("handoff-request")}>요약 확인 후 연결</Button>
            <p id="mvp-message-limit" className="text-sm">최대 {consultationLimits.turnCharacters.toLocaleString("ko-KR")}자</p>
          </form>
        </>
      )}
      <p role="status">{request.busy ? "요청 중입니다." : notice}</p>
      {request.error && <p role="alert">{request.error}</p>}
      {readError && <p role="status">{readError}</p>}
      {storageError && <p role="alert">{storageError}</p>}
    </section>
  );
}

function Counselor() {
  const request = useRequest();
  const sendCommand = useCommand();
  const [token, setToken] = useState("");
  const [queue, setQueue] = useState<Queue | null>(null);
  const [notice, setNotice] = useState("");

  async function loadQueue(cursor?: string) {
    const path = cursor ? `/api/console/queue?cursor=${encodeURIComponent(cursor)}` : "/api/console/queue";
    const page = await api<Queue>(path, token.trim());
    setQueue((current) => cursor && current
      ? { ...page, items: [...current.items, ...page.items] }
      : page);
  }

  function claim(sessionId: string) {
    return request.run(async () => {
      setNotice("");
      const path = `/api/console/sessions/${sessionId}`;
      const bearer = token.trim();
      const current = await api<{ revision: number }>(path, bearer);
      await sendCommand(`${path}/actions`, bearer, current.revision, { action: "claim" });
      setNotice(`상담을 인수했습니다. 세션 ID ${sessionId}`);
      setQueue((previous) => previous && {
        ...previous,
        items: previous.items.filter((item) => item.sessionId !== sessionId),
      });
      await loadQueue();
    });
  }

  return (
    <section id="counselor" aria-labelledby="counselor-title" className={sectionClass}>
      <h2 id="counselor-title" className="type-heading-small">상담사 대기열</h2>
      <form className="space-y-3" onSubmit={(event) => {
        event.preventDefault();
        if (token.trim()) void request.run(() => loadQueue());
      }}>
        <label htmlFor="mvp-token" className="block font-bold">콘솔 토큰</label>
        <input id="mvp-token" type="password" autoComplete="off" className={inputClass}
          value={token} disabled={request.busy} onChange={(event) => {
            setToken(event.target.value);
            setQueue(null);
            setNotice("");
          }} />
        <Button type="submit" disabled={request.busy || !token.trim()}>
          {queue ? "대기열 새로고침" : "대기열 조회"}
        </Button>
      </form>
      {queue && (queue.items.length ? (
        <ul aria-label="대기 중인 상담" className="divide-y divide-border-gray">
          {queue.items.map(({ sessionId, receivedAt }) => (
            <li key={sessionId} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0 wrap-anywhere">
                <p className="text-sm">{sessionId}</p>
                <time dateTime={receivedAt} className="text-sm">
                  {new Date(receivedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                </time>
              </div>
              <Button size="compact" variant="outline" disabled={request.busy}
                aria-label={`상담 인수 ${sessionId}`} onClick={() => claim(sessionId)}>
                상담 인수
              </Button>
            </li>
          ))}
        </ul>
      ) : <p>대기 중인 상담이 없습니다.</p>)}
      {queue?.nextCursor && (
        <Button size="compact" variant="outline" disabled={request.busy}
          onClick={() => request.run(() => loadQueue(queue.nextCursor ?? undefined))}>
          더 보기
        </Button>
      )}
      <p role="status" className="wrap-anywhere">{request.busy ? "요청 중입니다." : notice}</p>
      {request.error && <p role="alert">{request.error}</p>}
    </section>
  );
}

export default function MvpPage() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-8 text-text-basic sm:px-8">
      <h1 className="type-heading-large">120 Bridge</h1>
      <nav aria-label="상담 화면" className="mt-3 mb-8 flex flex-wrap gap-5">
        <a href="#citizen" className="text-text-primary underline">시민 상담</a>
        <a href="#counselor" className="text-text-primary underline">상담사 대기열</a>
      </nav>
      <div className="grid gap-8 lg:grid-cols-2">
        <CitizenConsultation />
        <Counselor />
      </div>
    </main>
  );
}
