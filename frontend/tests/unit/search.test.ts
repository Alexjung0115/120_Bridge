import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { loadCorpus, runSamples } from "../../scripts/calibrate-retrieval";
import { RETRIEVAL_THRESHOLDS, search, type Corpus } from "../../src/lib/retrieval/search";
import { validateAnswerUnit } from "../../src/lib/retrieval/validate-evidence";

const corpus = loadCorpus();
const calibration = JSON.parse(readFileSync(new URL("../../../data/retrieval-calibration.json", import.meta.url), "utf8"));
const day = "2026-11-21";
const ids = (result: ReturnType<typeof search>) => result.hits.map((hit) => hit.chunkId);
const FEE = "waste/mapo-large-waste-guide.md/section-5";
const PICKUP = "waste/mapo-large-waste-guide.md/section-4";

test("uses the recorded thresholds and passes the development sample", () => {
  assert.deepEqual(calibration.thresholds, RETRIEVAL_THRESHOLDS);
  assert.equal(calibration.corpusVersion, corpus.corpusVersion);
  assert.deepEqual(runSamples(corpus, calibration.devSamples).filter((result) => !result.pass), []);
});

test("returns district evidence only for the confirmed district", () => {
  const text = "냉장고 버리는 수수료가 얼마예요?";
  assert.ok(ids(search(corpus, { text, district: "마포구", businessDate: day })).includes(FEE));
  assert.ok(!ids(search(corpus, { text, district: "강남구", businessDate: day })).includes(FEE));
  const unconfirmed = search(corpus, { text, district: null, businessDate: day });
  assert.deepEqual(ids(unconfirmed), []);
  assert.equal(unconfirmed.unknownReason, "jurisdiction_unconfirmed");
});

test("city-wide policy evidence applies to every district", () => {
  const text = "기후동행카드 후불카드는 언제까지 쓸 수 있어요?";
  for (const district of [null, "마포구", "강남구"]) {
    assert.ok(ids(search(corpus, { text, district, businessDate: day })).includes("policy-change/case1-after-climate-pass-qa.md/section-5"));
  }
});

test("drops future-effective and expired documents", () => {
  const shifted = (change: object): Corpus => ({
    ...corpus,
    documents: corpus.documents.map((doc) => doc.docId === "waste/mapo-large-waste-guide.md" ? { ...doc, ...change } : doc),
  });
  const query = { text: "냉장고 버리는 수수료", district: "마포구", businessDate: day };
  assert.ok(!ids(search(shifted({ effectiveFrom: "2026-12-01" }), query)).includes(FEE));
  assert.ok(!ids(search(shifted({ effectiveUntil: day }), query)).includes(FEE));
});

test("never returns unverified, blocked or conflicting chunks however well they match", () => {
  const law = search(corpus, { text: "도로교통법 주정차 과태료 금액", district: null, businessDate: day });
  assert.deepEqual(ids(law), []);
  assert.equal(law.unknownReason, "no_eligible_evidence");
  const contact = search(corpus, { text: "평화환경 수거업체 전화번호", district: "마포구", businessDate: day });
  assert.ok(!ids(contact).includes("waste/mapo-large-waste-guide.md/section-6"));
});

test("an undated quote can route but cannot answer", () => {
  const result = search(corpus, { text: "120다산콜 상담 범위와 전화번호", district: "마포구", businessDate: day });
  const evidence = result.hits.flatMap((hit) => hit.evidence);
  assert.ok(evidence.some((item) => item.claimKey === "routing.120.general-scope" && item.routingEligible));
  assert.ok(evidence.every((item) => item.basisDate !== null || !item.answerEligible));
});

const feeCitation = corpus.citations.find((item) => item.claimKey === "waste.mapo.refrigerator.fee")!;
const unit = (text: string, quote = feeCitation.quote) => ({
  text, citations: [{ chunkId: feeCitation.chunkId, claimKey: feeCitation.claimKey, quote }],
});
const mapo = { district: "마포구", businessDate: day };

test("accepts an answer whose numbers and targets are in the cited quote", () => {
  assert.deepEqual(validateAnswerUnit(corpus, unit("300리터 이상 냉장고는 8,000원입니다."), { ...mapo, targets: ["냉장고"] }), { ok: true, problems: [] });
});

test("rejects numbers, targets and quotes the evidence does not support", () => {
  assert.equal(validateAnswerUnit(corpus, unit("냉장고는 9,000원입니다."), mapo).ok, false);
  assert.equal(validateAnswerUnit(corpus, unit("세탁기는 8,000원입니다."), { ...mapo, targets: ["세탁기"] }).ok, false);
  assert.equal(validateAnswerUnit(corpus, unit("냉장고는 8,000원입니다.", "냉장고 | 8,000원 확정"), mapo).ok, false);
  assert.equal(validateAnswerUnit(corpus, unit("냉장고는 8,000원입니다."), { ...mapo, district: "강남구" }).ok, false);
  assert.equal(validateAnswerUnit(corpus, { text: "무료입니다.", citations: [] }, mapo).ok, false);
});

test("checks quotes from other chunks of the corpus too", () => {
  const pickup = corpus.citations.find((item) => item.chunkId === PICKUP)!;
  assert.ok(validateAnswerUnit(corpus, { text: "1m 이상 냉장고는 무료로 방문수거합니다.", citations: [pickup] }, mapo).ok);
});
