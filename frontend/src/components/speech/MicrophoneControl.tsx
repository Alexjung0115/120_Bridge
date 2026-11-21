"use client";
import React from "react";
import { Button } from "@/components/ui/button";
import type { SpeechState } from "./useSpeechController";

export type MicrophoneControlProps = {
  state: SpeechState;
  isSupported: boolean;
  onToggleListening: () => void;
  disabled?: boolean;
  className?: string;
};

export function MicrophoneControl({
  state,
  isSupported,
  onToggleListening,
  disabled = false,
  className = "",
}: MicrophoneControlProps) {
  if (!isSupported) {
    return (
      <div className={"text-center type-body-xsmall text-text-subtle " + className}>
        브라우저가 음성 입출력을 지원하지 않습니다. 텍스트 입력을 사용해 주세요.
      </div>
    );
  }

  const isListening = state === "listening";

  return (
    <div className={"flex flex-col items-center guide-gap-2 " + className}>
      <Button
        type="button"
        onClick={onToggleListening}
        disabled={disabled}
        aria-label={isListening ? "음성 인식 중지" : "음성 상담 시작"}
        className={
          "size-16 rounded-full flex items-center justify-center transition-all " +
          (isListening
            ? "bg-element-error text-white animate-pulse"
            : "bg-element-primary text-white hover:opacity-90")
        }
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-7"
        >
          {isListening ? (
            <rect x="6" y="6" width="12" height="12" rx="2" />
          ) : (
            <>
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </>
          )}
        </svg>
      </Button>
      <span className="type-body-small text-text-subtle font-medium">
        {isListening ? "듣고 있습니다..." : state === "speaking" ? "말하는 중..." : "마이크 누르고 말씀하세요"}
      </span>
    </div>
  );
}
