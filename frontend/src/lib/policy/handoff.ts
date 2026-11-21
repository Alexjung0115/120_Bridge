type Question =
  | { kind: "required_field"; count: number }
  | { kind: "missing_evidence"; count: number };

type OfferReason = "very_dissatisfied" | "question_cap";
type SkipReason = "citizen_requested" | "very_dissatisfied_with_consent";

export interface HandoffPolicyInput {
  explicitHumanRequest?: boolean;
  offerDecision?: "accept" | "decline";
  veryDissatisfied?: boolean;
  skipConfirmation?: boolean;
  question?: Question;
  // Persist the decline in the caller for the same unresolved question or offer.
  previouslyDeclined?: boolean;
}

export type HandoffPolicyDecision =
  | { action: "confirm_summary" }
  | { action: "send_unconfirmed"; skipReason: SkipReason }
  | { action: "offer_handoff"; reason: OfferReason }
  | { action: "ask_question"; rephrase: boolean }
  | { action: "continue" }
  | { action: "continue_without_question" };

export function decideHandoff(input: HandoffPolicyInput): HandoffPolicyDecision {
  // Voice, button and key requests all enter through the same explicit signal.
  if (input.explicitHumanRequest || input.offerDecision === "accept" || input.skipConfirmation) {
    if (input.skipConfirmation) {
      return { action: "send_unconfirmed", skipReason: "citizen_requested" };
    }
    if (input.veryDissatisfied) {
      return { action: "send_unconfirmed", skipReason: "very_dissatisfied_with_consent" };
    }
    return { action: "confirm_summary" };
  }

  if (input.offerDecision === "decline" || input.previouslyDeclined) {
    return { action: "continue_without_question" };
  }
  if (input.veryDissatisfied) {
    return { action: "offer_handoff", reason: "very_dissatisfied" };
  }

  const question = input.question;
  if (!question) {
    return { action: "continue" };
  }
  const limit = question.kind === "required_field" ? 2 : 1;
  if (question.count >= limit) {
    return { action: "offer_handoff", reason: "question_cap" };
  }
  return { action: "ask_question", rephrase: question.count === 1 };
}
