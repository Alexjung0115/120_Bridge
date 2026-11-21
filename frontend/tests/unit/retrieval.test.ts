import assert from "node:assert/strict";
import { test } from "node:test";

import { documentSchema } from "../../src/lib/retrieval/document-schema";
import { isEligibleEvidence } from "../../src/lib/retrieval/evidence-eligibility";

const baseDocument = {
  docId: "waste/mapo.md",
  sourcePath: "rag-data/waste/mapo.md",
  title: "마포구 대형폐기물 안내",
  category: "대형폐기물",
  jurisdiction: { scope: "district", districtName: "마포구", applicableDistricts: ["마포구"] },
  sourceUrl: "https://www.mapo.go.kr/example",
  retrievedAt: "2026-11-21",
  publishedAt: null,
  updatedAt: "2026-01-13",
  effectiveFrom: null,
  effectiveUntil: null,
  dateStatus: "updatedAt only",
  sourceVerifiedAt: "2026-11-21",
  verificationStatus: "verified",
  sourceHash: "b".repeat(64),
  chunks: [{
    chunkId: "waste/mapo.md/free-pickup",
    docId: "waste/mapo.md",
    heading: "무상 수거",
    text: "냉장고는 무료 방문수거 대상입니다.",
    claimKeys: ["waste.mapo.free-pickup"],
    verifiedClaims: ["waste.mapo.free-pickup"],
    answerEligible: true,
    routingEligible: false,
    conflicts: [],
  }],
};

test("retrieval fixtures preserve district and city-common provenance", () => {
  assert.ok(documentSchema.safeParse(baseDocument).success);
  assert.ok(documentSchema.safeParse({ ...baseDocument, jurisdiction: { scope: "city", districtName: null, applicableDistricts: [] } }).success);
});

test("retrieval fixtures retain the metadata T014 must filter", () => {
  for (const candidate of [
    { verificationStatus: "unverified" },
    { effectiveFrom: "2026-12-01", effectiveUntil: null },
    { chunks: [{ ...baseDocument.chunks[0], conflicts: ["전화번호 상충"] }] },
    { sourceVerifiedAt: null },
  ]) {
    assert.ok(documentSchema.safeParse({ ...baseDocument, ...candidate }).success);
  }
});

const citation = {
  chunkId: baseDocument.chunks[0].chunkId,
  claimKey: baseDocument.chunks[0].claimKeys[0],
  quote: "냉장고는 무료 방문수거 대상입니다.",
  sourceUrl: baseDocument.sourceUrl,
  basisDate: "2026-01-13",
  basisDateType: "updatedAt",
};

function eligible(change: Record<string, unknown> = {}, citationChange: Record<string, unknown> = {}, district = "마포구") {
  return isEligibleEvidence(
    documentSchema.parse({ ...baseDocument, ...change }),
    citation.chunkId,
    citation.claimKey,
    district,
    "2026-11-21",
    { ...citation, ...citationChange },
  );
}

test("accepts matching district and city-wide verified evidence", () => {
  assert.equal(eligible(), true);
  assert.equal(eligible({ jurisdiction: { scope: "city", districtName: null, applicableDistricts: [] } }, {}, "강남구"), true);
  assert.equal(eligible({}, {}, "강남구"), false);
});

test("rejects unverified, future-effective and expired records", () => {
  assert.equal(eligible({ verificationStatus: "unverified" }), false);
  assert.equal(eligible({ effectiveFrom: "2026-12-01" }), false);
  assert.equal(eligible({ effectiveUntil: "2026-11-21" }), false);
});

test("rejects conflicting, undated and mismatched claim citations", () => {
  assert.equal(eligible({ chunks: [{ ...baseDocument.chunks[0], conflicts: ["전화번호 상충"] }] }), false);
  assert.equal(eligible({ sourceVerifiedAt: null }), false);
  assert.equal(eligible({}, { basisDate: null }), false);
  assert.equal(eligible({}, { quote: "없는 인용문" }), false);
  assert.equal(eligible({}, { claimKey: "other" }), false);
  assert.equal(eligible({}, { sourceUrl: "https://example.org" }), false);
});
