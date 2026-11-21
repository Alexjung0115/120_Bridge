"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { startHandoff, useRecentConsultation, type Channel } from "../_lib/handoff";

export function HandoffLink({ channel, summary, className, children }: {
  channel: Channel;
  summary: string;
  className: string;
  children: React.ReactNode;
}) {
  const [error, setError] = useState(false);
  return (
    <>
    <Link
      href={`/citizen/handoff?channel=${channel}`}
      onClick={(event) => { if (!startHandoff({ channel, summary })) { event.preventDefault(); setError(true); } }}
      className={className}
    >
      {children}
    </Link>
    {error && <p role="alert" className="type-body-small text-text-danger">연결 요청을 저장하지 못했습니다. 브라우저 저장소를 확인한 뒤 다시 시도해주세요.</p>}
    </>
  );
}

export function RecentConsultation() {
  const recent = useRecentConsultation();
  const router = useRouter();
  const [error, setError] = useState(false);
  if (!recent) return null;

  return (
    <section aria-label="최근 상담 내역">
      <button
        type="button"
        onClick={() => {
          if (startHandoff(recent)) router.push(`/citizen/handoff?channel=${recent.channel}`);
          else setError(true);
        }}
        className="flex min-h-12 w-full items-center gap-2 rounded-guide-xlarge border border-border-gray-light px-4 text-left type-body-small text-text-basic"
      >
        <span aria-hidden="true">◷</span>
        <span className="shrink-0 font-bold">최근 상담</span>
        <span className="min-w-0 flex-1 truncate text-text-subtle">{recent.summary || "상담사 연결 실패"}</span>
        <span className="shrink-0 text-text-primary">다시 연결 ›</span>
      </button>
      {error && <p role="alert" className="type-body-small text-text-danger">연결 요청을 저장하지 못했습니다. 다시 시도해주세요.</p>}
    </section>
  );
}
