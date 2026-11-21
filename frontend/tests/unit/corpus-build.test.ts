import assert from "node:assert/strict";
import { test } from "node:test";

import { buildCorpus, normalizeDates, normalizeJurisdiction } from "../../scripts/build-corpus";

const { corpus, report } = buildCorpus();
const doc = (docId: string) => corpus.documents.find((item) => item.docId === docId)!;
const chunk = (chunkId: string) => corpus.documents.flatMap((item) => item.chunks).find((item) => item.chunkId === chunkId)!;

test("builds a valid, reproducible corpus from the committed inputs", () => {
  assert.deepEqual(report.errors, []);
  assert.equal(buildCorpus().corpus.corpusVersion, corpus.corpusVersion);
  assert.equal(report.counts.records, 36);
  assert.equal(report.counts.uniqueSourceUrls, 32);
});

test("keeps publication, update and effective dates apart", () => {
  assert.deepEqual(normalizeDates("2026-01-13", "페이지 최종 수정일"), {
    publishedAt: null, updatedAt: "2026-01-13", effectiveFrom: null, dateStatus: "updatedAt: 페이지 최종 수정일",
  });
  assert.equal(normalizeDates("2017-03-28", "게시일 (수수료 기준 변경 시행일은 2012-08-01)").effectiveFrom, null);
  assert.equal(normalizeDates("미확인", "수정일").updatedAt, null);
  assert.equal(doc("parking/law-road-traffic-act-article-160.md").effectiveFrom, "2027-04-14");
});

test("does not treat an organization as a district", () => {
  assert.equal(normalizeJurisdiction("120다산콜재단").scope, "organization");
  assert.equal(normalizeJurisdiction("서울시").scope, "city");
  assert.equal(normalizeJurisdiction("전국(법령)").scope, "national");
  assert.equal(normalizeJurisdiction("마포구").districtName, "마포구");
});

test("grants eligibility per approved claim only", () => {
  assert.equal(chunk("waste/mapo-large-waste-guide.md/section-4").answerEligible, true);
  assert.equal(chunk("waste/mapo-large-waste-guide.md/section-7").routingEligible, true);
  // Conflicting and superseded claims never become answers.
  assert.equal(chunk("waste/mapo-large-waste-guide.md/section-6").answerEligible, false);
  assert.equal(chunk("policy-change/case1-before-climate-card-payback.md/section-3").answerEligible, false);
  assert.equal(chunk("policy-change/case1-after-climate-card-plus.md/section-1").answerEligible, false);
  for (const status of ["unverified", "blocked", "conflict"]) {
    assert.ok(corpus.documents.filter((item) => item.verificationStatus === status)
      .every((item) => item.chunks.every((c) => !c.answerEligible && !c.routingEligible)));
  }
  for (const citation of corpus.citations) assert.ok(chunk(citation.chunkId).text.includes(citation.quote));
});

test("merges duplicate URLs into one source and keeps welfare data separate", () => {
  assert.equal(corpus.sourceGroups.length, 4);
  assert.equal(corpus.externalDatasets[0].includedInCorpus, false);
  assert.ok(corpus.documents.every((item) => !item.docId.startsWith("OA-23014/")));
});
