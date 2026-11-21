export type ConsultationMessage = {
  sequence: number;
  speaker: "citizen" | "ai" | "counselor";
  content: string;
};

export const speakerLabel = { citizen: "시민", ai: "AI 상담봇", counselor: "상담사" };

export function isConsultationMessage(value: unknown): value is ConsultationMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ConsultationMessage>;
  return typeof message.sequence === "number" && Number.isSafeInteger(message.sequence) &&
    message.sequence > 0 && typeof message.content === "string" &&
    (message.speaker === "citizen" || message.speaker === "ai" || message.speaker === "counselor");
}
