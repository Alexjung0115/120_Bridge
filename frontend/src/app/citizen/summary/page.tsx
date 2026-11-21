"use client";

import { useState, useSyncExternalStore } from "react";
import { GovernmentIcon } from "@/app/citizen/_components/government-icon";
import Link from "next/link";
import { Textarea } from "@/components/ui/textarea";
import { parseSummary, summaryFields, summaryKey, type ConsultationSummary } from "../_lib/summary";
import { readStorage, writeStorage } from "../_lib/storage";

export default function SummaryPage() {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(false);
  const [draft, setDraft] = useState<ConsultationSummary | null>(null);
  const saved = useSyncExternalStore(() => () => {}, () => readStorage("session", summaryKey), () => null);
  const content = draft ?? parseSummary(saved);
  const valid = summaryFields.every(([key]) => content[key].trim());
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col sm:max-w-xl sm:px-10 overflow-y-auto bg-background-white px-6 pb-4 pt-6 text-text-basic [@media(max-height:720px)]:pt-4 [@media(max-height:650px)]:px-4 [@media(max-height:650px)]:pb-2 [@media(max-height:650px)]:pt-2">
      <header aria-label="120Bridge" className="flex shrink-0 items-center guide-gap-3">
        <GovernmentIcon />
        <span className="type-heading-medium text-element-primary">120</span>
        <span className="type-body-small tracking-wider">BRIDGE</span>
      </header>

      <section aria-labelledby="summary-title" className="flex flex-1 flex-col items-center justify-center py-4 text-center [@media(max-height:720px)]:py-1">
        <div
          aria-hidden="true"
          className="mt-4 flex size-20 items-center justify-center rounded-3xl bg-element-primary text-4xl font-bold text-text-inverse-static [@media(max-height:720px)]:mt-2 [@media(max-height:720px)]:size-12 [@media(max-height:650px)]:hidden"
        >
          ✓
        </div>
        <h1 id="summary-title" className="mt-4 type-heading-xlarge text-text-bolder [@media(max-height:720px)]:mt-2 [@media(max-height:720px)]:text-xl [@media(max-height:720px)]:leading-tight">
          민원 내용을
          <br className="[@media(max-height:650px)]:hidden" /> 확인해주세요.
        </h1>
      </section>

      <section aria-labelledby="summary-card-title" className="shrink-0 rounded-guide-xlarge border border-border-gray-light guide-p-6 [@media(max-height:720px)]:p-3">
        <h2 id="summary-card-title" className="type-body-medium-bold text-text-bolder">
          민원 요약
        </h2>
        <dl className="mt-3 flex flex-col guide-gap-3 type-body-small [@media(max-height:720px)]:mt-2 [@media(max-height:720px)]:gap-1">
          {summaryFields.map(([key, label]) => (
            <div key={key} className="grid grid-cols-[4rem_1fr] items-start gap-3">
              <dt className="text-text-subtle"><label htmlFor={editing ? `summary-${key}` : undefined}>{label}</label></dt>
              <dd>{editing ? <Textarea id={`summary-${key}`} value={content[key]} onChange={(event) => setDraft({ ...content, [key]: event.target.value })} rows={key === "summary" ? 3 : 1} maxLength={key === "summary" ? 2000 : 200} /> : <span className="whitespace-pre-wrap break-words">{content[key]}</span>}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div aria-hidden="true" className="min-h-4 flex-1 [@media(max-height:720px)]:min-h-2 [@media(max-height:650px)]:min-h-1" />

      <div className="flex shrink-0 flex-col guide-gap-3 [@media(max-height:650px)]:gap-1">
        <p className="rounded-guide-xlarge bg-element-primary-lighter px-4 py-3 type-body-small text-text-primary">민원 요약을 확인해주세요.</p>
        <Link
          href="/citizen/result"
          onClick={(event) => { if (!valid || editing || !writeStorage("session", summaryKey, JSON.stringify(content))) { event.preventDefault(); if (valid && !editing) setError(true); } }}
          aria-disabled={!valid || editing}
          className="flex min-h-13 items-center justify-center rounded-guide-xlarge bg-element-primary px-4 type-body-medium-bold text-text-inverse-static [@media(max-height:720px)]:min-h-11"
        >
          네, 맞아요
        </Link>
        <button
          type="button"
          onClick={() => setEditing(!editing)}
          className="min-h-13 rounded-guide-xlarge border border-border-gray-light bg-background-white px-4 type-body-medium-bold text-text-primary [@media(max-height:720px)]:min-h-11"
        >
          {editing ? "수정 완료" : "내용 수정하기"}
        </button>
        {!valid && <p role="alert" className="type-body-small text-text-subtle">모든 항목을 입력해주세요.</p>}
        {error && <p role="alert" className="type-body-small text-text-danger">내용을 저장하지 못했습니다. 브라우저 저장소를 확인한 뒤 다시 시도해주세요.</p>}
        <nav aria-label="화면 이동" className="flex flex-wrap justify-center gap-x-4 text-center type-body-small">
          <Link href="/citizen/voice" className="text-text-subtle underline underline-offset-4">요약 확인 건너뛰기</Link>
        </nav>
      </div>
    </main>
  );
}
