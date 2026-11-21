"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Browser Web Speech API (ko-KR). TypeScript's DOM lib does not ship the recognition types.
type RecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
};
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionConstructor = new () => Recognition;

export type SpeechProblem = "unsupported" | "denied" | "no_speech" | "failed";
export type SpeechStatus = "idle" | "listening" | "speaking";

const language = "ko-KR";

/** One spoken unit is at most `maxSentences` sentences (FR-006). Decimals like "3.5" stay intact. */
export function splitUtterances(text: string, maxSentences = 2): string[] {
  const sentences = text.split(/(?<=[.!?。])\s+|\n+/).map((part) => part.trim()).filter(Boolean);
  const units: string[] = [];
  for (let index = 0; index < sentences.length; index += maxSentences) {
    units.push(sentences.slice(index, index + maxSentences).join(" "));
  }
  return units;
}

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

export function useSpeechController() {
  const recognition = useRef<Recognition | null>(null);
  const spoken = useRef(new Set<string>());
  const queued = useRef(0);
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [interim, setInterim] = useState("");
  const [problem, setProblem] = useState<SpeechProblem | null>(null);
  // Detected after mount so server and first client render match.
  const [support, setSupport] = useState({ recognition: false, synthesis: false });

  useEffect(() => {
    queueMicrotask(() => setSupport({
      recognition: recognitionConstructor() !== null,
      synthesis: typeof window !== "undefined" && "speechSynthesis" in window,
    }));
  }, []);

  const stopSpeaking = useCallback(() => {
    queued.current = 0;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setStatus((current) => (current === "speaking" ? "idle" : current));
  }, []);

  const stopListening = useCallback(() => {
    recognition.current?.abort();
    recognition.current = null;
    setInterim("");
    setStatus((current) => (current === "listening" ? "idle" : current));
  }, []);

  /** Ends the current utterance but still delivers what was heard. */
  const finishListening = useCallback(() => { recognition.current?.stop(); }, []);

  /** Cancels anything in progress, e.g. when the citizen asks for a counselor. */
  const cancel = useCallback(() => {
    stopListening();
    stopSpeaking();
  }, [stopListening, stopSpeaking]);

  const listen = useCallback((onFinal: (text: string) => void) => {
    const Ctor = recognitionConstructor();
    if (!Ctor) {
      setProblem("unsupported");
      return;
    }
    stopSpeaking(); // The microphone would otherwise pick up our own voice.
    stopListening();
    setProblem(null);
    const next = new Ctor();
    next.lang = language;
    next.interimResults = true;
    next.continuous = false;
    let finalText = "";
    let failed = false;
    next.onresult = (event) => {
      let heard = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        heard += result[0].transcript;
        if (result.isFinal) finalText = heard;
      }
      setInterim(heard);
    };
    next.onerror = (event) => {
      failed = true;
      if (event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") setProblem("denied");
      else if (event.error === "no-speech") setProblem("no_speech");
      else setProblem("failed");
    };
    next.onend = () => {
      if (recognition.current === next) recognition.current = null;
      setInterim("");
      setStatus((current) => (current === "listening" ? "idle" : current));
      if (!failed && finalText.trim()) onFinal(finalText.trim());
    };
    recognition.current = next;
    try {
      next.start();
      setStatus("listening");
    } catch {
      recognition.current = null;
      setProblem("failed");
    }
  }, [stopListening, stopSpeaking]);

  /** Reads an utterance once per id, so repeated polling never replays it. */
  const speak = useCallback((id: string, text: string) => {
    if (spoken.current.has(id)) return;
    spoken.current.add(id);
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    for (const unit of splitUtterances(text)) {
      const utterance = new SpeechSynthesisUtterance(unit);
      utterance.lang = language;
      queued.current += 1;
      utterance.onend = utterance.onerror = () => {
        queued.current = Math.max(0, queued.current - 1);
        if (queued.current === 0) setStatus((current) => (current === "speaking" ? "idle" : current));
      };
      window.speechSynthesis.speak(utterance);
      setStatus("speaking");
    }
  }, []);

  /** Existing history is shown as captions but not read aloud. */
  const markSpoken = useCallback((id: string) => { spoken.current.add(id); }, []);

  useEffect(() => cancel, [cancel]);

  return { support, status, interim, problem, listen, finishListening, speak, markSpoken, cancel };
}
