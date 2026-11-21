"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { GovernmentIcon } from "@/app/citizen/_components/government-icon";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import headphonesIcon from "@/assets/icon/headphones.svg";
import { clearRecentConsultation, getActiveConsultation, settleHandoff, startPreparedHandoff, useHandoff } from "../_lib/handoff";

const copy = {
  ready: ["상담사 연결 요청", "상담사에게 연결을 요청할 수 있습니다."],
  waiting: ["상담원 연결을 요청중입니다.", "상담사 연결 중입니다. 잠시만 기다려주세요."],
  connected: ["상담원이 연결되었습니다.", "상담사가 연결 요청을 수락했습니다."],
  failed: ["상담원 연결에 실패했습니다.", "처음 화면에서 최근 상담 내역을 확인하고 다시 연결할 수 있습니다."],
} as const;

function HandoffScreen() {
  const channel = useSearchParams().get("channel") === "text" ? "text" : "voice";
  const [error, setError] = useState(false);
  const current = useHandoff();
  const request = current && getActiveConsultation()?.id === current.id ? current : null;
  const status = request?.status ?? "ready";
  const [title, description] = copy[status];

  useEffect(() => {
    if (!request) return;
    if (request.status === "connected") {
      clearRecentConsultation();
    }
    if (request.status === "waiting") {
      const timer = window.setTimeout(
        () => { if (!settleHandoff(request.id, "failed")) setError(true); },
        Math.max(0, request.deadline - Date.now()),
      );
      return () => window.clearTimeout(timer);
    }
  }, [request]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col sm:max-w-xl sm:px-10 bg-background-white px-6 pb-6 pt-6 text-text-basic">
      <header aria-label="120Bridge" className="flex items-center guide-gap-3">
        <GovernmentIcon />
        <span className="type-heading-medium text-element-primary">120</span>
        <span className="type-body-small tracking-wider">BRIDGE</span>
      </header>

      <section aria-live="polite" className="flex flex-1 flex-col items-center pt-12 text-center">
        <h1 className="mt-2 type-heading-large text-text-bolder">{title}</h1>
        <div aria-hidden="true" className={`mt-8 flex size-24 items-center justify-center rounded-full ${status === "failed" ? "bg-element-danger" : "bg-element-primary"} text-4xl font-bold text-white`}>
          {status === "failed" ? "!" : status === "waiting" ? "···" : <Image src={headphonesIcon} alt="" className="size-12 brightness-0 invert" />}
        </div>
        <p className="mt-5 max-w-64 type-body-small text-text-primary">{description}</p>
        <div className="mt-20 w-full rounded-guide-xlarge border border-border-gray-light guide-p-6 text-left">
          <p className="type-body-small-bold text-text-bolder">상담사 연결 {status === "waiting" ? "대기 중" : status === "connected" ? "요청 수락" : status === "failed" ? "실패" : "안내"}</p>
        </div>
      </section>

      {status === "ready" && (
        <Button type="button" onClick={() => setError(!startPreparedHandoff(channel))} className="mb-3">
          상담사 연결 요청
        </Button>
      )}
      {error && <p role="alert" className="mb-3 type-body-small text-text-danger">연결 요청을 저장하지 못했습니다. 다시 시도해주세요.</p>}
      {status !== "waiting" && (
        <Link href="/citizen" className={buttonVariants({ variant: "outline" })}>
          처음 화면으로
        </Link>
      )}
    </main>
  );
}

export default function HandoffPage() {
  return (
    <Suspense fallback={<p role="status">연결 화면을 불러오는 중입니다.</p>}>
      <HandoffScreen />
    </Suspense>
  );
}
