import { buttonVariants } from "@/components/ui/button";
import { HandoffLink } from "../_components/handoff-entry";
import { Badge } from "@/components/ui/badge";
import { GovernmentIcon } from "@/app/citizen/_components/government-icon";
import Link from "next/link";
import Image from "next/image";
import callIcon from "@/assets/icon/call.svg";

const voiceSummary = "마포구 안심생활 키트 신청 후 처리 결과를 받지 못함";
const bars = [8, 14, 23, 12, 31, 43, 25, 51, 34, 20, 42, 29, 14, 25, 10];

function MuteIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-icon-24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 9v2a3 3 0 0 0 4.7 2.5M15 9V7a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.4 2.3M12 18v3m-3 0h6M3 3l18 18" />
    </svg>
  );
}

function EndIcon() {
  return <Image src={callIcon} alt="" aria-hidden="true" className="size-icon-24 rotate-135 brightness-0 invert" />;
}

export default function VoicePage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col sm:max-w-xl sm:px-10 overflow-y-auto bg-background-white px-6 pb-4 pt-6 text-text-basic [@media(max-height:720px)]:pt-4">
      <header aria-label="120Bridge" className="flex items-center guide-gap-3">
        <GovernmentIcon />
        <span className="type-heading-medium text-element-primary">120</span>
        <span className="type-body-small tracking-wider">BRIDGE</span>
      </header>

      <section aria-labelledby="voice-title" className="mt-4 shrink-0 text-center [@media(max-height:720px)]:mt-2">
        <p className="type-body-xsmall-bold text-text-primary">연결되지 않음</p>
        <h1 id="voice-title" className="mt-2 type-heading-large text-text-bolder">AI 상담중입니다</h1>
        <p className="mt-2 type-body-small text-text-subtle">상담 번호 120-1109-024 · 02:18</p>
      </section>

      <section aria-label="음성 상태" className="flex min-h-24 flex-1 flex-col items-center justify-center py-2 [@media(max-height:720px)]:min-h-16">
        <div aria-hidden="true" className="flex h-14 items-center guide-gap-3">
          {bars.map((height, index) => (
            <span key={index} style={{ height }} className={`w-1.5 rounded-full ${index % 3 === 0 ? "bg-element-success" : "bg-element-primary"}`} />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap justify-center guide-gap-3 type-body-xsmall">
          <Badge size="md">듣는 중 · 대기</Badge>
        </div>
      </section>

      <section aria-labelledby="caption-title" className="shrink-0 rounded-2xl bg-element-secondary-lighter guide-p-6">
        <h2 id="caption-title" className="type-body-small-bold text-text-bolder">상담 내용</h2>
        <dl className="mt-2 flex flex-col guide-gap-3 type-body-small">
          <div>
            <dt className="type-body-small-bold text-text-subtle">시민</dt>
            <dd className="mt-1">마포구 안심생활 키트를 신청했는데 아직 처리 결과를 못 받았어요.</dd>
          </div>
          <div>
            <dt className="type-body-small-bold text-text-primary">AI 상담봇</dt>
            <dd className="mt-1">10월 15일 신청이시군요. 변경된 정책을 기준으로 확인해보겠습니다.</dd>
          </div>
        </dl>
      </section>

      <nav aria-label="음성 상담 조작" className="flex shrink-0 items-start justify-around py-4 [@media(max-height:720px)]:py-2">
        <div className="flex flex-col items-center guide-gap-3">
          <button type="button" disabled className="flex size-15 items-center justify-center rounded-full bg-element-gray-lighter text-icon-gray disabled:cursor-not-allowed">
            <MuteIcon />
          </button>
          <span className="type-body-small">음소거</span>
        </div>
        <div className="flex flex-col items-center guide-gap-3">
          <Link href="/citizen" aria-label="처음으로 돌아가기" className="flex size-15 items-center justify-center rounded-full bg-element-danger text-icon-inverse">
            <EndIcon />
          </Link>
          <span className="type-body-small">화면 종료</span>
        </div>
      </nav>

      <HandoffLink channel="voice" summary={voiceSummary} className={buttonVariants({ className: "w-full" })}>
        사람 상담사 연결
      </HandoffLink>
    </main>
  );
}
