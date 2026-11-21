"use client";

import { useState, useRef, useEffect } from "react";
import { buttonVariants } from "@/components/ui/button";
import { HandoffLink } from "../_components/handoff-entry";
import { Badge } from "@/components/ui/badge";
import { BridgeBrand } from "@/components/bridge-brand";
import Link from "next/link";
import { ClipboardCheck, ChevronRight } from "lucide-react";
import { CancelConsultation } from "../_components/cancel-consultation";
import { resultHistoryIdKey } from "../_lib/history";
import { summaryKey } from "../_lib/summary";
import { removeStorage } from "../_lib/storage";
import { speakerLabel, voiceMessages } from "../_lib/messages";
import { useSpeechController } from "@/components/speech/useSpeechController";
import { MicrophoneControl } from "@/components/speech/MicrophoneControl";

const voiceSummary = "마포구 안심생활 키트 신청 후 처리 결과를 받지 못함";
const bars = [8, 14, 23, 12, 31, 43, 25, 51, 34, 20, 42, 29, 14, 25, 10];


export default function VoicePage() {
  const [messages, setMessages] = useState(voiceMessages);
  const [statusMessage, setStatusMessage] = useState("대기 중");

  const speakRef = useRef<(text: string) => void>(() => {});

  const { state: speechState, transcript, isSupported, startListening, stopListening, speak } =
    useSpeechController({
      lang: "ko-KR",
      onTranscript: (text) => {
        const userMsg = {
          sequence: Date.now(),
          speaker: "citizen" as const,
          content: text,
        };
        setMessages((prev) => [...prev, userMsg]);
        setStatusMessage("답변 생성 중...");

        setTimeout(() => {
          const replyText = text.includes("냉장고")
            ? "마포구 대형폐기물 배출은 관할 동주민센터 방문 또는 구청 홈페이지 스마트클린에서 신청 가능합니다."
            : text.includes("안심생활")
            ? "마포구 안심생활 지원 신청 건은 현재 담당 부서에서 접수 검토 중입니다."
            : "말씀하신 문의 내용을 확인했습니다. 관련 절차를 안내해 드리겠습니다.";

          const aiMsg = {
            sequence: Date.now() + 1,
            speaker: "ai" as const,
            content: replyText,
          };
          setMessages((prev) => [...prev, aiMsg]);
          setStatusMessage("안내 말씀드리는 중");
          speakRef.current(replyText);
        }, 600);
      },
      onError: (err) => setStatusMessage(err),
    });

  useEffect(() => {
    speakRef.current = speak;
  }, [speak]);

  const toggleListening = () => {
    if (speechState === "listening") {
      stopListening();
      setStatusMessage("음성 인식 중지됨");
    } else {
      startListening();
      setStatusMessage("말씀을 듣고 있습니다...");
    }
  };

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col sm:max-w-xl sm:px-10 overflow-y-auto bg-background-white px-6 pb-4 pt-6 text-text-basic [@media(max-height:720px)]:pt-4">
      <header aria-label="120Bridge" className="flex items-center guide-gap-3">
        <BridgeBrand />
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
          <Badge size="md">{speechState === "listening" ? "듣는 중" : speechState === "speaking" ? "답변 재생 중" : statusMessage}</Badge>
        </div>
      </section>

      <section aria-label="실시간 자막" className="shrink-0 text-center py-2 min-h-10">
        {transcript ? (
          <p className="type-body-small text-text-primary bg-element-primary-lighter px-4 py-2 rounded-xl inline-block animate-pulse">
            {transcript}
          </p>
        ) : (
          <p className="type-body-xsmall text-text-subtle">마이크 버튼을 누르고 말씀하시면 음성이 인식됩니다.</p>
        )}
      </section>

      <section aria-labelledby="caption-title" className="shrink-0 rounded-2xl bg-element-secondary-lighter guide-p-6">
        <h2 id="caption-title" className="type-body-small-bold text-text-bolder">상담 내용</h2>
        <dl className="mt-2 flex flex-col guide-gap-3 type-body-small">
          {messages.map(({ sequence, speaker, content }) => (
            <div key={sequence}>
              <dt className={`type-body-small-bold ${speaker === "citizen" ? "text-text-subtle" : "text-text-primary"}`}>{speakerLabel[speaker]}</dt>
              <dd className="mt-1">{content}</dd>
            </div>
          ))}
        </dl>
      </section>

      <nav aria-label="음성 상담 조작" className="flex shrink-0 items-center justify-center py-4 [@media(max-height:720px)]:py-2">
        <MicrophoneControl
          state={speechState}
          isSupported={isSupported}
          onToggleListening={toggleListening}
        />
      </nav>

      <Link href="/citizen/summary" onNavigate={() => {
        removeStorage("session", summaryKey);
        removeStorage("session", resultHistoryIdKey);
      }} className="mb-3 flex min-h-16 w-full items-center gap-3 rounded-guide-xlarge border border-border-primary bg-background-white px-4 text-left text-text-primary">
        <ClipboardCheck aria-hidden="true" className="size-6 shrink-0" />
        <span className="flex-1"><span className="block type-body-medium-bold">AI 상담 마치기</span><span className="block type-body-xsmall text-text-subtle">상담 내용을 확인하고 마무리합니다</span></span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0" />
      </Link>
      <HandoffLink channel="voice" summary={voiceSummary} messages={voiceMessages} className={buttonVariants({ className: "w-full" })}>
        사람 상담사 연결
      </HandoffLink>
      <CancelConsultation />
    </main>
  );
}
