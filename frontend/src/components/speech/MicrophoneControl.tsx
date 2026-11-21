"use client";

import type { SpeechProblem } from "./useSpeechController";

export type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

const phaseLabels: Record<VoicePhase, string> = {
  idle: "말씀해 주세요",
  listening: "듣는 중",
  thinking: "확인 중",
  speaking: "답변 중",
};

const problemMessages: Record<SpeechProblem, string> = {
  unsupported: "이 브라우저에서는 음성 입력을 쓸 수 없습니다. 아래에 글자로 입력해 주세요.",
  denied: "마이크 사용이 허용되지 않았습니다. 아래에 글자로 입력해 주세요.",
  no_speech: "목소리가 들리지 않았습니다. 다시 눌러 말씀하시거나 글자로 입력해 주세요.",
  failed: "음성을 알아듣지 못했습니다. 다시 시도하시거나 글자로 입력해 주세요.",
};

type Props = {
  phase: VoicePhase;
  supported: boolean;
  disabled: boolean;
  interim: string;
  problem: SpeechProblem | null;
  onToggle: () => void;
};

// State is always conveyed in text, never by color alone (FR-030).
export function MicrophoneControl({ phase, supported, disabled, interim, problem, onToggle }: Props) {
  const listening = phase === "listening";
  const shownProblem = problem ?? (supported ? null : "unsupported");
  return (
    <div className="flex flex-col items-center gap-3 pb-4">
      <p role="status" aria-live="polite" className="type-body-small-bold">
        {phaseLabels[phase]}
      </p>
      <button
        type="button"
        aria-pressed={listening}
        disabled={disabled || !supported}
        onClick={onToggle}
        className="min-h-20 min-w-48 rounded-guide-xlarge border border-border-primary bg-element-primary px-6 type-body-medium text-text-inverse-static disabled:opacity-50"
      >
        {listening ? "말하기 끝내기" : "눌러서 말하기"}
      </button>
      {interim && <p aria-label="인식한 말" className="max-w-full break-words text-center">{interim}</p>}
      {shownProblem && <p role="alert" className="text-center type-body-small">{problemMessages[shownProblem]}</p>}
    </div>
  );
}
