"use client";

import { useState } from "react";
import { HandoffLink } from "../_components/handoff-entry";
import { BridgeBrand } from "@/components/bridge-brand";

export default function TextPage() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const summary = [...messages, message.trim()].filter(Boolean).join("\n");
  function sendMessage() {
    const text = message.trim();
    if (!text) return;
    setMessages((previous) => [...previous, text]);
    setMessage("");
  }
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background-white sm:max-w-xl text-text-basic">
      <header className="shrink-0 border-b border-border-gray-light px-6 pb-4 pt-6">
        <div aria-label="120Bridge" className="flex items-center guide-gap-3">
          <BridgeBrand />
        </div>
        <div className="mt-4 flex items-center justify-between guide-gap-3">
          <div>
            <h1 className="type-heading-small text-text-bolder">텍스트 상담</h1>
          </div>
          <HandoffLink channel="text" summary={summary} messages={messages.map((content, index) => ({
            sequence: index + 1, speaker: "citizen", content,
          }))} className="rounded-guide-medium-1 border border-border-primary px-3 py-2 type-body-small-bold text-text-primary">
            상담사 연결
          </HandoffLink>
        </div>
      </header>

      <section aria-label="대화 내용" className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-[85%] rounded-guide-xlarge rounded-bl-none bg-element-gray-lighter px-4 py-3 type-body-small text-text-basic">문의 내용을 입력해주세요.</div>
        {messages.map((text, index) => (
          <div key={index} className="mt-4 flex flex-col gap-3">
            <p className="ml-auto max-w-[85%] whitespace-pre-wrap break-words rounded-guide-xlarge bg-element-primary px-4 py-3 type-body-small text-text-inverse-static">{text}</p>
          </div>
        ))}
      </section>

      <div className="shrink-0 border-t border-border-gray-light bg-background-white px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <label htmlFor="chat-message" className="sr-only">
          문의 내용
        </label>
        <div className="flex items-end guide-gap-3">
          <textarea
            id="chat-message"
            rows={1}
            maxLength={2000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                sendMessage();
              }
            }}
            placeholder="메시지를 입력해주세요"
            className="max-h-32 min-h-12 min-w-0 flex-1 resize-none rounded-guide-medium-1 border border-border-gray px-4 py-3 type-body-small placeholder:text-text-disabled"
          />
          <button
            type="button"
            disabled={!message.trim()}
            onClick={sendMessage}
            className="flex min-h-12 shrink-0 items-center justify-center rounded-guide-medium-1 bg-element-primary px-4 type-body-small-bold text-text-inverse-static disabled:cursor-not-allowed disabled:bg-element-disabled-dark"
          >
            전송
          </button>
        </div>
      </div>
    </main>
  );
}
