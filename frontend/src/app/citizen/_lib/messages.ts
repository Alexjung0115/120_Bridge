export type ConsultationMessage = {
  sequence: number;
  speaker: "citizen" | "ai" | "counselor";
  content: string;
};

export const speakerLabel = { citizen: "시민", ai: "AI 상담봇", counselor: "상담사" };

export const voiceMessages: ConsultationMessage[] = [
  { sequence: 1, speaker: "citizen", content: "마포구 안심생활 키트를 신청했는데 아직 처리 결과를 못 받았어요." },
  { sequence: 2, speaker: "ai", content: "10월 15일 신청이시군요. 변경된 정책을 기준으로 확인해보겠습니다." },
];

export function isConsultationMessage(value: unknown): value is ConsultationMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ConsultationMessage>;
  return typeof message.sequence === "number" && Number.isSafeInteger(message.sequence) &&
    message.sequence > 0 && typeof message.content === "string" &&
    (message.speaker === "citizen" || message.speaker === "ai" || message.speaker === "counselor");
}
