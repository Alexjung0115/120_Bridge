import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { recommendRouting, type VerifiedRoutingSource } from "../../src/lib/dialogue/routing.ts";
import { routingResultSchema } from "../../src/lib/schema/candidate.ts";

// TEMPORARY T040: These sources stand in for T039/T014 verified routing chunks.
const { sources } = JSON.parse(readFileSync(
  new URL("../fixtures/temporary-routing.json", import.meta.url), "utf8",
)) as { sources: VerifiedRoutingSource[] };
const issue = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", localId: "issue-1", purpose: "residence" as const };
const secondIssue = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", localId: "issue-2", purpose: "residence" as const };
const proposal = (source: VerifiedRoutingSource, localId = issue.localId) => ({
  issueLocalId: localId,
  chunkId: source.evidence[0].chunkId,
  claimKey: source.evidence[0].claimKey,
  quote: source.evidence[0].quote,
});

test("requires a reason only for an empty result and limits candidates to two", () => {
  assert.ok(routingResultSchema.safeParse({
    candidates: [], unknownReason: "검증된 근거 없음",
  }).success);
  assert.equal(routingResultSchema.safeParse({
    candidates: [], unknownReason: null,
  }).success, false);
  const result = recommendRouting([issue], [proposal(sources[0])], sources);
  assert.equal(routingResultSchema.safeParse({
    candidates: result.candidates, unknownReason: "불필요한 사유",
  }).success, false);
  assert.equal(routingResultSchema.safeParse({
    candidates: Array(3).fill(result.candidates[0]), unknownReason: null,
  }).success, false);
  assert.equal(routingResultSchema.safeParse({
    candidates: [{ ...result.candidates[0], unknownReason: "후보 내부 사유" }],
    unknownReason: null,
  }).success, false);
});

test("uses verified 120 evidence for a low-confidence water fallback", () => {
  const result = recommendRouting([issue], [proposal(sources[0])], sources);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].name, "120다산콜");
  assert.equal(result.candidates[0].confidence, "low");
  assert.notEqual(result.candidates[0].id, sources[0].id);
  assert.deepEqual(result.candidates[0].issueIds, [issue.id]);
  assert.deepEqual(result.candidates[0].evidence, sources[0].evidence);
  assert.equal(result.candidates[0].selectedByAgent, false);
  assert.equal(result.unknownReason, null);
});

test("returns no invented department when evidence is absent or unverified", () => {
  const noEvidence = recommendRouting([issue], [], sources);
  assert.deepEqual(noEvidence.candidates, []);
  assert.ok(noEvidence.unknownReason);
  const unverified = recommendRouting([issue], [proposal(sources[3])], sources);
  assert.deepEqual(unverified.candidates, []);
  assert.ok(unverified.unknownReason);
  const wrongQuote = { ...proposal(sources[0]), quote: "근거와 다른 문구" };
  assert.deepEqual(recommendRouting([issue], [wrongQuote], sources).candidates, []);
  assert.deepEqual(recommendRouting([{ ...issue, purpose: "disposal" }],
    [proposal(sources[0])], sources).candidates, []);
});

test("ranks by unresolved issue coverage, then direct source, and caps the consultation at two", () => {
  const proposals = [
    proposal(sources[0]), proposal(sources[1]), proposal(sources[2]),
    proposal(sources[2], secondIssue.localId),
  ];
  const result = recommendRouting([issue, secondIssue], proposals, sources);
  assert.deepEqual(result.candidates.map((candidate) => candidate.name),
    ["서울시 교통정책과", "티머니"]);
  assert.deepEqual(result.candidates.map((candidate) => candidate.rank), [1, 2]);
  assert.deepEqual(result.candidates[0].issueIds, [issue.id, secondIssue.id]);
  assert.equal(result.candidates[0].confidence, "high");
  assert.equal(result.unknownReason, null);
});
