"use client";

import { Card } from "@/components/ui/card";
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { BridgeBrand } from "@/components/bridge-brand";
import Image from "next/image";
import Link from "next/link";
import { ConfirmedSummary } from "../_components/confirmed-summary";
import { SummaryRow } from "../_components/summary-row";
import inquiryIcon from "@/assets/icon/inquiry.svg";
import successIcon from "@/assets/icon/face_smile.svg";
import { readStorage, writeStorage } from "../_lib/storage";
import { parseSummary, summaryKey } from "../_lib/summary";
import { parseHistory, readHistorySnapshot, resultHistoryIdKey, saveHistoryEntry, type HistoryStatus } from "../_lib/history";

const subscribe = () => () => {};

export default function ResultPage() {
  const saved = useSyncExternalStore(subscribe, () => readStorage("session", summaryKey), () => null);
  const router = useRouter();
  const [error, setError] = useState(false);

  function finish(status: HistoryStatus) {
    if (!saved) return;
    const id = readStorage("session", resultHistoryIdKey) ?? globalThis.crypto?.randomUUID?.();
    if (!id || !writeStorage("session", resultHistoryIdKey, id)) {
      setError(true);
      return;
    }
    const { business, region, date, summary } = parseSummary(saved);
    const existing = parseHistory(readHistorySnapshot()).find((entry) => entry.id === id);
    if (!saveHistoryEntry({
      id, channel: "voice", title: business,
      summary: `지역 ${region}\n신청일 ${date}\n${summary}`,
      status: existing?.status === "resolved" ? existing.status : status,
    })) {
      setError(true);
      return;
    }
    router.push(`/citizen/history/${id}`);
  }
  if (!saved) return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="type-heading-medium text-text-bolder">확인된 민원 내역이 없습니다</h1>
      <p className="type-body-small text-text-subtle">민원 내용을 확인한 뒤 다시 확인해주세요.</p>
      <Link href="/citizen/history" className={buttonVariants()}>상담 내역 보기</Link>
    </main>
  );
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col sm:max-w-xl sm:px-10 bg-background-white px-6 pb-6 pt-6 text-text-basic">
      <header aria-label="120Bridge" className="flex items-center guide-gap-3">
        <BridgeBrand />
      </header>

      <section aria-labelledby="result-title" className="flex flex-1 flex-col items-center justify-center py-8 text-center">
        <Image src={successIcon} alt="" aria-hidden="true" className="mt-4 size-20" />
        <h1 id="result-title" className="mt-6 type-heading-medium text-text-bolder">
          해당 민원에 대한
          <br />
          안내 결과입니다.
        </h1>
      </section>

      <Card as="section" aria-labelledby="guidance-title" className="bg-element-primary-lighter guide-p-6">
        <h2 id="guidance-title" className="flex items-center guide-gap-3 type-body-medium-bold text-text-primary">
          <Image src={inquiryIcon} alt="" aria-hidden="true" className="size-icon-24" />
          AI 안내
        </h2>
        <p className="mt-4 type-body-small">현재 신청 건의 실제 처리 상태는 확인할 수 없습니다. 안내 내용과 처리 결과는 별도로 확인해야 합니다.</p>
      </Card>

      <Card as="section" aria-label="문의 정보" className="mt-6 guide-p-6">
        <dl className="flex flex-col guide-gap-4 type-body-small">
          <SummaryRow label="정책 안내">확인된 근거 없음</SummaryRow>
          <ConfirmedSummary />
        </dl>
      </Card>

      <section aria-labelledby="resolution-title" className="mt-8 flex flex-col guide-gap-3">
        <h2 id="resolution-title" className="type-body-medium-bold">안내를 받고 문의가 해결됐나요?</h2>
        <Button type="button" onClick={() => finish("ai-resolved")}>해결됐어요</Button>
        <Button type="button" variant="outline" onClick={() => finish("unresolved")}>추가 도움이 필요해요</Button>
        {error && <p role="alert" className="type-body-small text-text-danger">상담 내역을 저장하지 못했습니다. 다시 시도해주세요.</p>}
      </section>
    </main>
  );
}
