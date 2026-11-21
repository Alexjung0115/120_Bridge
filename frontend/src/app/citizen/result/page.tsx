"use client";

import { useSyncExternalStore } from "react";
import { GovernmentIcon } from "@/app/citizen/_components/government-icon";
import Image from "next/image";
import Link from "next/link";
import { ConfirmedSummary } from "../_components/confirmed-summary";
import inquiryIcon from "@/assets/icon/inquiry.svg";
import successIcon from "@/assets/icon/face_smile.svg";
import { readStorage } from "../_lib/storage";
import { summaryKey } from "../_lib/summary";

const subscribe = () => () => {};

export default function ResultPage() {
  const saved = useSyncExternalStore(subscribe, () => readStorage("session", summaryKey), () => null);
  if (!saved) return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="type-heading-medium text-text-bolder">확인된 민원 내역이 없습니다</h1>
      <p className="type-body-small text-text-subtle">민원 내용을 확인한 뒤 다시 확인해주세요.</p>
      <Link href="/citizen" className="rounded-guide-xlarge bg-element-primary px-6 py-3 type-body-small-bold text-text-inverse-static">처음 화면으로</Link>
    </main>
  );
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col sm:max-w-xl sm:px-10 bg-background-white px-6 pb-6 pt-6 text-text-basic">
      <header aria-label="120Bridge" className="flex items-center guide-gap-3">
        <GovernmentIcon />
        <span className="type-heading-medium text-element-primary">120</span>
        <span className="type-body-small tracking-wider">BRIDGE</span>
      </header>

      <section aria-labelledby="result-title" className="flex flex-1 flex-col items-center justify-center py-8 text-center">
        <Image src={successIcon} alt="" aria-hidden="true" className="mt-4 size-20" />
        <h1 id="result-title" className="mt-6 type-heading-medium text-text-bolder">
          해당 민원에 대한
          <br />
          안내 결과입니다.
        </h1>
      </section>

      <section aria-labelledby="guidance-title" className="rounded-guide-xlarge border border-border-gray-light bg-element-primary-lighter guide-p-6">
        <h2 id="guidance-title" className="flex items-center guide-gap-3 type-body-medium-bold text-text-primary">
          <Image src={inquiryIcon} alt="" aria-hidden="true" className="size-icon-24" />
          AI 안내
        </h2>
        <p className="mt-4 type-body-small">현재 신청 건의 실제 처리 상태는 확인할 수 없습니다. 안내 내용과 처리 결과는 별도로 확인해야 합니다.</p>
      </section>

      <section aria-label="문의 정보" className="mt-6 rounded-guide-xlarge border border-border-gray-light guide-p-6">
        <dl className="flex flex-col guide-gap-4 type-body-small">
          <div className="grid grid-cols-[4.5rem_1fr] gap-3">
            <dt className="text-text-subtle">정책 안내</dt>
            <dd>확인된 근거 없음</dd>
          </div>
          <ConfirmedSummary />
        </dl>
      </section>

      <div className="mt-8 flex flex-col guide-gap-3">
        <Link
          href="/citizen/summary"
          className="flex min-h-13 items-center justify-center rounded-guide-xlarge bg-element-primary px-4 type-body-medium-bold text-text-inverse-static"
        >
          민원 내역 확인
        </Link>
      </div>
    </main>
  );
}
