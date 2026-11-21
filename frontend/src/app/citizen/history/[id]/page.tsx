"use client";

import { Card } from "@/components/ui/card";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { historyDateFormat, parseHistory, readHistorySnapshot, saveHistoryEntry, statusLabel, subscribeHistory } from "../../_lib/history";
import { speakerLabel } from "../../_lib/messages";
import { fetchHistory, savedSessions, type RemoteHistory } from "../../_lib/remote-history";

const speakerStyle = {
  citizen: "self-end bg-element-primary-lighter",
  ai: "self-start bg-element-gray-lighter",
  counselor: "self-start border border-border-gray-light",
};

function HistoryDetail() {
  const { id } = useParams<{ id: string }>();
  const raw = useSyncExternalStore(subscribeHistory, readHistorySnapshot, () => null);
  const entry = parseHistory(raw).find((item) => item.id === id);
  const [error, setError] = useState(false);
  const [remote, setRemote] = useState<RemoteHistory | null>(null);
  const [remoteLoading, setRemoteLoading] = useState(true);
  const [remoteError, setRemoteError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const session = savedSessions().find((item) => item.sessionId === id);
    if (!session) {
      queueMicrotask(() => { if (!controller.signal.aborted) setRemoteLoading(false); });
    } else {
      void fetchHistory(session, controller.signal).then(setRemote).catch(() => {
        if (!controller.signal.aborted) setRemoteError(true);
      }).finally(() => { if (!controller.signal.aborted) setRemoteLoading(false); });
    }
    return () => controller.abort();
  }, [id]);

  if (remoteLoading) return <p role="status">상담 내역을 불러오는 중입니다.</p>;
  if (remoteError) return <p role="alert">상담 내역을 불러오지 못했습니다. 다시 시도해주세요.</p>;
  if (remote) return <>
    <header>
      <h1 className="type-heading-large text-text-bolder">상담 내역</h1>
      <time dateTime={remote.createdAt} className="type-body-small text-text-subtle">{historyDateFormat.format(new Date(remote.createdAt))}</time>
    </header>
    <section aria-labelledby="remote-messages">
      <h2 id="remote-messages" className="type-body-medium-bold">대화 내역</h2>
      {remote.transcript.length ? <ol className="mt-3 flex flex-col gap-3">
        {remote.transcript.map((turn) => <li key={turn.id} className={`min-w-0 max-w-[90%] rounded-guide-xlarge px-4 py-3 ${turn.role === "citizen" ? speakerStyle.citizen : speakerStyle.ai}`}>
          <p className="type-body-small-bold">{turn.role === "citizen" ? "시민" : turn.role === "assistant" ? "AI 상담봇" : "안내"}</p>
          <p className="mt-1 whitespace-pre-wrap break-words type-body-small">{turn.text}</p>
        </li>)}
      </ol> : <Card as="p" className="mt-3 p-5 type-body-small text-text-subtle">저장된 대화 내역이 없습니다.</Card>}
    </section>
  </>;

  if (!entry) return <p role="status">상담 내역을 찾을 수 없습니다.</p>;
  const messages = entry.messages ?? [];

  return (
    <>
      <header>
        <p className="type-body-small-bold text-text-primary">{statusLabel[entry.status]}</p>
        <h1 className="mt-2 break-words type-heading-large text-text-bolder">{entry.title}</h1>
        <p className="mt-2 type-body-small text-text-subtle">
          {entry.channel === "voice" ? "음성 상담" : "텍스트 상담"} ·{" "}
          <time dateTime={new Date(entry.createdAt).toISOString()}>{historyDateFormat.format(entry.createdAt)}</time>
        </p>
      </header>
      {entry.summary && (
        <Card as="section" aria-labelledby="consultation-summary" className="p-5">
          <h2 id="consultation-summary" className="type-body-medium-bold">상담 요약</h2>
          <p className="mt-2 whitespace-pre-wrap break-words type-body-small">{entry.summary}</p>
        </Card>
      )}
      <section aria-labelledby="consultation-messages">
        <h2 id="consultation-messages" className="type-body-medium-bold">대화 내역</h2>
        {messages.length ? (
          <ol className="mt-3 flex flex-col gap-3">
            {messages.map(({ sequence, speaker, content }) => (
              <li key={sequence} className={`min-w-0 max-w-[90%] rounded-guide-xlarge px-4 py-3 sm:max-w-[80%] ${speakerStyle[speaker]}`}>
                <p className="type-body-small-bold">{speakerLabel[speaker]}</p>
                <p className="mt-1 whitespace-pre-wrap break-words type-body-small">{content}</p>
              </li>
            ))}
          </ol>
        ) : (
          <Card as="p" className="mt-3 p-5 type-body-small text-text-subtle">저장된 대화 내역이 없습니다.</Card>
        )}
      </section>
      {entry.status === "unresolved" && (
        <div className="flex flex-col gap-3">
          <Link href="/citizen/text" className={buttonVariants()}>새 텍스트 상담 시작</Link>
          <Button type="button" variant="outline" onClick={() => setError(!saveHistoryEntry({ ...entry, status: "resolved" }))}>
            해결로 표시
          </Button>
          {error && <p role="alert" className="type-body-small text-text-danger">상담 상태를 저장하지 못했습니다. 다시 시도해주세요.</p>}
        </div>
      )}
    </>
  );
}

export default function HistoryDetailPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 bg-background-white px-6 py-8 sm:px-10">
      <Link href="/citizen/history" className="self-start type-body-small-bold text-text-primary">← 상담 내역 목록</Link>
      <Suspense fallback={<p role="status">상담 내역을 불러오는 중입니다.</p>}>
        <HistoryDetail />
      </Suspense>
    </main>
  );
}
