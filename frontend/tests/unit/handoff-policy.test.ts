import assert from "node:assert/strict";
import { test } from "node:test";

import { decideHandoff } from "../../src/lib/policy/handoff";

test("an explicit human request preempts a pending question and a prior decline", () => {
  for (const count of [0, 1, 2]) {
    assert.deepEqual(
      decideHandoff({
        explicitHumanRequest: true,
        previouslyDeclined: true,
        question: { kind: "required_field", count },
      }),
      { action: "confirm_summary" },
    );
  }
});

test("severe dissatisfaction offers a handoff until the citizen consents", () => {
  assert.deepEqual(decideHandoff({ veryDissatisfied: true }), {
    action: "offer_handoff",
    reason: "very_dissatisfied",
  });
  for (const consent of [{ explicitHumanRequest: true }, { offerDecision: "accept" }] as const) {
    assert.deepEqual(decideHandoff({ ...consent, veryDissatisfied: true }), {
      action: "send_unconfirmed",
      skipReason: "very_dissatisfied_with_consent",
    });
  }
  assert.deepEqual(decideHandoff({ offerDecision: "accept" }), {
    action: "confirm_summary",
  });
});

test("an explicit confirmation skip permits an unconfirmed summary", () => {
  assert.deepEqual(decideHandoff({ skipConfirmation: true }), {
    action: "send_unconfirmed",
    skipReason: "citizen_requested",
  });
});

test("a required field gets two questions and resumes normally if resolved", () => {
  assert.deepEqual(decideHandoff({ question: { kind: "required_field", count: 0 } }), {
    action: "ask_question",
    rephrase: false,
  });
  assert.deepEqual(decideHandoff({ question: { kind: "required_field", count: 1 } }), {
    action: "ask_question",
    rephrase: true,
  });
  assert.deepEqual(decideHandoff({ question: { kind: "required_field", count: 2 } }), {
    action: "offer_handoff",
    reason: "question_cap",
  });
  assert.deepEqual(decideHandoff({}), { action: "continue" });
});

test("missing evidence gets one clarification", () => {
  assert.deepEqual(decideHandoff({ question: { kind: "missing_evidence", count: 0 } }), {
    action: "ask_question",
    rephrase: false,
  });
  assert.deepEqual(decideHandoff({ question: { kind: "missing_evidence", count: 1 } }), {
    action: "offer_handoff",
    reason: "question_cap",
  });
});

test("declining stops the unresolved question and offer on later turns", () => {
  const unresolved = {
    veryDissatisfied: true,
    question: { kind: "required_field", count: 2 },
  } as const;
  assert.deepEqual(decideHandoff({ ...unresolved, offerDecision: "decline" }), {
    action: "continue_without_question",
  });
  assert.deepEqual(decideHandoff({ ...unresolved, previouslyDeclined: true }), {
    action: "continue_without_question",
  });
});
