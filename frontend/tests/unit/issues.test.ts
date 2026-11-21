import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createIssues, finishIssue, handoffIssues, updateIssueFields } from "../../src/lib/dialogue/issues.ts";
import { issueCollectionSchema } from "../../src/lib/schema/issue.ts";
import type { DialogueCandidate } from "../../src/lib/dialogue/candidate-schema.ts";

export function compoundIssues(requests = ["냉장고 배출", "수도 입금 확인"]) {
  const turnId = randomUUID();
  const candidate: DialogueCandidate = {
    intent: "문의", category: "복합", sentiment: "보통", confidence: "low",
    issues: requests.map((request, index) => ({ localId: `issue-${index}`, request,
      knownFields: [], missingFields: ["disposal.district"], needsPersonalLookup: index === 1 })),
    proposedQuestion: null, answerUnits: [], summaryProposal: null, routingEvidence: [],
  };
  return createIssues(randomUUID(), turnId, candidate, {
    "disposal.district": { value: "마포구", status: "known", originTurnId: turnId, confirmed: true },
  });
}

test("two compound inquiries reuse known facts and retain unresolved items in order", () => {
  for (const requests of [["냉장고 배출", "수도 입금 확인"], ["카드 정책", "개인 환급"]]) {
    const first = compoundIssues(requests);
    assert.equal(first.activeIssueId, first.issues[0].id);
    assert.equal(first.issues[1].fields["disposal.district"].confirmed, true);
    const next = finishIssue(first.issues, first.issues[0].id, "advised");
    assert.equal(next.activeIssueId, next.issues[1].id);
    const finished = finishIssue(next.issues, next.issues[1].id, "unresolved");
    assert.equal(finished.activeIssueId, null);
    assert.deepEqual(handoffIssues(finished.issues), {
      resolvedContextIds: [first.issues[0].id], unresolvedIssueIds: [first.issues[1].id],
    });
    assert.equal(first.issues[0].status, "active");
  }
});

test("location correction invalidates evidence, keeps counts and purpose-specific provenance", () => {
  const original = compoundIssues().issues[0];
  original.sourceChunkIds = ["old-chunk"];
  original.questionCounts["disposal.district"] = 2;
  const turn = randomUUID();
  const changed = updateIssueFields(original, {
    "disposal.district": { value: "강남구", status: "known", originTurnId: turn, confirmed: false },
    "residence.district": { value: "종로구", status: "known", originTurnId: turn, confirmed: true },
  }, "disposal");
  assert.equal(changed.jurisdiction, "강남구");
  assert.equal(changed.locations.find((item) => item.purpose === "disposal")?.originTurnId, turn);
  assert.deepEqual(changed.sourceChunkIds, []);
  assert.equal(changed.questionCounts["disposal.district"], 2);
  assert.equal(updateIssueFields(changed, {}, "incident").jurisdiction, null);
  assert.equal(original.fields["disposal.district"].value, "마포구");
});

test("rejects multiple active issues, cross-session records and finishing a pending issue", () => {
  const { issues } = compoundIssues();
  assert.throws(() => issueCollectionSchema.parse(issues.map((issue) => ({ ...issue, status: "active" }))));
  assert.throws(() => issueCollectionSchema.parse([issues[0], { ...issues[1], sessionId: randomUUID() } ]));
  assert.throws(() => finishIssue(issues, issues[1].id, "advised"));
});
