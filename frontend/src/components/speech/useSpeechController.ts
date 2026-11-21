import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

export type SpeechState = "idle" | "listening" | "speaking" | "error" | "unsupported";

export type SpeechControllerOptions = {
  lang?: string;
  onTranscript?: (text: string) => void;
  onError?: (error: string) => void;
};

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal?: boolean;
      [subIndex: number]: { transcript: string };
    };
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

export function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function checkSupport(): boolean {
  if (typeof window === "undefined") return false;
  const hasSpeechRecognition =
    "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
  const hasSpeechSynthesis = "speechSynthesis" in window;
  return Boolean(hasSpeechRecognition && hasSpeechSynthesis);
}

export function useSpeechController(options: SpeechControllerOptions = {}) {
  const { lang = "ko-KR", onTranscript, onError } = options;
  const isSupported = useSyncExternalStore(
    () => () => {},
    checkSupport,
    () => false
  );
  const [state, setState] = useState<SpeechState>(isSupported ? "idle" : "unsupported");
  const [transcript, setTranscript] = useState("");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const lastSpokenRef = useRef<string>("");
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onErrorRef.current = onError;
  }, [onTranscript, onError]);

  useEffect(() => {
    if (!isSupported || typeof window === "undefined") return;

    synthesisRef.current = window.speechSynthesis;

    const SpeechRecognitionCtor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) return;

    const recognition: SpeechRecognitionLike = new SpeechRecognitionCtor();
    recognition.lang = lang;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let currentTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const item = event.results[i];
        if (item[0]) {
          currentTranscript += item[0].transcript;
          if (item.isFinal) {
            const finalVal = item[0].transcript.trim();
            if (finalVal) {
              onTranscriptRef.current?.(finalVal);
            }
          }
        }
      }
      setTranscript(currentTranscript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      const err = event.error || "speech_recognition_error";
      if (err === "not-allowed") {
        setState("error");
        onErrorRef.current?.("마이크 접근 권한이 거부되었습니다.");
      } else if (err !== "no-speech") {
        setState("error");
        onErrorRef.current?.("음성 인식 오류: " + err);
      }
    };

    recognition.onend = () => {
      setState((prev) => (prev === "listening" ? "idle" : prev));
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {}
      if (synthesisRef.current) {
        synthesisRef.current.cancel();
      }
    };
  }, [isSupported, lang]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || !isSupported) return;
    try {
      if (synthesisRef.current) {
        synthesisRef.current.cancel();
      }
      setTranscript("");
      recognitionRef.current.start();
      setState("listening");
    } catch {
      // Already active
    }
  }, [isSupported]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
      setState("idle");
    } catch {}
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!synthesisRef.current || !isSupported || !text.trim()) return;
      if (lastSpokenRef.current === text.trim()) return;

      synthesisRef.current.cancel();
      lastSpokenRef.current = text.trim();

      const sentences = splitIntoSentences(text).slice(0, 2);
      const textToSpeak = sentences.join(" ") || text;

      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = lang;
      utterance.rate = 1.0;

      utterance.onstart = () => {
        setState("speaking");
      };

      utterance.onend = () => {
        setState("idle");
      };

      utterance.onerror = () => {
        setState("idle");
      };

      synthesisRef.current.speak(utterance);
    },
    [isSupported, lang]
  );

  const cancelSpeech = useCallback(() => {
    if (synthesisRef.current) {
      synthesisRef.current.cancel();
      setState("idle");
    }
  }, []);

  return {
    state,
    transcript,
    isSupported,
    startListening,
    stopListening,
    speak,
    cancelSpeech,
  };
}
