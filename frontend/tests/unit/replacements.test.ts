import assert from "node:assert/strict";
import { test } from "node:test";

import { loadCorpus } from "../../scripts/calibrate-retrieval";
import { buildCorpus } from "../../scripts/build-corpus";
import { claimScopedDocument, governingReplacements } from "../../src/lib/retrieval/replacements";
import { search } from "../../src/lib/retrieval/search";
import { validateAnswerUnit } from "../../src/lib/retrieval/validate-evidence";

const corpus = loadCorpus();
const QA = "policy-change/case1-after-climate-pass-qa.md";
const QA_END = `${QA}/section-5`;
const evidenceOf = (text: string, businessDate: string) =>
  search(corpus, { text, district: null, businessDate }).hits
    .filter((hit) => hit.chunkId === QA_END)
    .flatMap((hit) => hit.evidence);

test("a replaced claim follows its own validity window, not the successor document's", () => {
  // The Q&A takes effect 2026-09-01 as a document, but its new end dates were announced for 2026-08-12.
  const before = evidenceOf("기후동행카드 후불카드는 언제까지 쓸 수 있어요?", "2026-08-11");
  const after = evidenceOf("기후동행카드 후불카드는 언제까지 쓸 수 있어요?", "2026-08-20");
  assert.ok(!before.some((item) => item.claimKey === "policy.climate-card.postpaid.end"));
  assert.ok(after.some((item) => item.claimKey === "policy.climate-card.postpaid.end" && item.answerEligible));
});

test("each claim switches on its own date and unreplaced claims keep the document window", () => {
  const evidence = evidenceOf("기후동행카드 페이백 신청 기간과 후불카드 종료", "2026-09-10");
  const keys = evidence.map((item) => item.claimKey);
  assert.ok(keys.includes("policy.climate-card.postpaid.end"));
  assert.ok(!keys.includes("policy.climate-card.payback.application-period"), "payback is replaced only from 2026-09-17");
  assert.ok(keys.includes("policy.climate-card.payback.channel"), "unreplaced claim keeps the 2026-09-01 document window");
  const later = evidenceOf("기후동행카드 페이백 신청 기간과 후불카드 종료", "2026-09-20").map((item) => item.claimKey);
  assert.ok(later.includes("policy.climate-card.payback.application-period"));
});

test("search hits carry before/after values only for the replaced claim", () => {
  const evidence = evidenceOf("기후동행카드 후불카드는 언제까지 쓸 수 있어요?", "2026-11-21");
  const postpaid = evidence.find((item) => item.claimKey === "policy.climate-card.postpaid.end")!;
  assert.deepEqual(postpaid.replaces.map((item) => item.before), ["8월 말까지 사용, 9월 1일 서비스 종료"]);
  assert.equal(postpaid.replaces[0].validFrom, "2026-08-12");
  const channel = evidence.find((item) => item.claimKey === "policy.climate-card.payback.channel");
  assert.deepEqual(channel?.replaces ?? [], []);
  const deposit = governingReplacements(corpus.replacements, QA, "policy.climate-card.payback.deposit-period");
  assert.equal(deposit.length, 2, "both predecessors of the deposit period stay listed");
});

test("answer validation uses the same claim window as search", () => {
  const citation = corpus.citations.find((item) => item.chunkId === QA_END && item.claimKey === "policy.climate-card.postpaid.end")!;
  const unit = { text: "후불 카드는 9월 30일까지 이용할 수 있습니다.", citations: [citation] };
  assert.equal(validateAnswerUnit(corpus, unit, { district: null, businessDate: "2026-08-20" }).ok, true);
  assert.equal(validateAnswerUnit(corpus, unit, { district: null, businessDate: "2026-08-11" }).ok, false);
});

test("a document that is not the successor keeps its own dates", () => {
  const doc = corpus.documents.find((item) => item.docId === QA)!;
  assert.equal(claimScopedDocument(corpus.replacements, doc, "policy.climate-pass.youth-age"), doc);
  const scoped = claimScopedDocument(corpus.replacements, doc, "policy.climate-card.postpaid.end");
  assert.equal(scoped.effectiveFrom, "2026-08-12");
});

test("case2 and case3 share one source URL but keep separate claims and dates (AUD-005)", () => {
  const sameUrl = "policy-change/case2-after-2026-h2-changes.md";
  const replacements = corpus.replacements ?? [];
  const bus = replacements.filter((item) => item.successorDocId === sameUrl);
  const card = replacements.filter((item) => item.successorDocId === "policy-change/case3-after-2026-h2-changes.md");
  assert.deepEqual(bus.map((item) => [item.claimKey, item.validFrom]), [["policy.village-bus.max-ride-time", "2026-07-01"]]);
  assert.deepEqual(card.map((item) => [item.claimKey, item.validFrom]), [["policy.dadungi-card.app-card.householder-requirement", "2026-10-01"]]);
  // Successor pages are blocked, so neither change may be answered until re-verified.
  const result = search(corpus, { text: "다둥이행복카드 앱카드 세대주 아니어도 발급", district: null, businessDate: "2026-11-21" });
  assert.ok(!result.hits.some((hit) => hit.docId.startsWith("policy-change/case")));
});

test("corpus build rejects replacements whose evidence or window is inconsistent", () => {
  const { report } = buildCorpus();
  assert.deepEqual(report.errors, []);
  assert.ok(report.warnings.some((item) => item.target === "case3-dadungi-householder" && item.message.includes("검색에 적용되지 않는다")));
});
