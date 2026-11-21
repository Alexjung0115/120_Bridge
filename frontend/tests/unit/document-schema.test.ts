import assert from "node:assert/strict";
import { test } from "node:test";

import { citationSchema, documentSchema, replacementSchema } from "../../src/lib/retrieval/document-schema";

const document = {
  docId: "waste/mapo-large-waste-guide.md",
  sourcePath: "rag-data/waste/mapo-large-waste-guide.md",
  title: "마포구 대형폐기물 배출 안내",
  category: "대형폐기물",
  jurisdiction: { scope: "district", districtName: "마포구", applicableDistricts: ["마포구"] },
  sourceUrl: "https://www.mapo.go.kr/site/main/content/mapo05060502",
  retrievedAt: "2026-11-21",
  publishedAt: null,
  updatedAt: "2026-01-13",
  effectiveFrom: null,
  effectiveUntil: null,
  dateStatus: "updatedAt only",
  sourceVerifiedAt: "2026-11-21",
  verificationStatus: "verified",
  sourceHash: "a".repeat(64),
  chunks: [{
    chunkId: "waste/mapo-large-waste-guide.md/section-4",
    docId: "waste/mapo-large-waste-guide.md",
    heading: "무상 수거",
    text: "냉장고는 무료 방문수거 대상입니다.",
    claimKeys: ["waste.mapo.appliance.free-pickup"],
    verifiedClaims: ["waste.mapo.appliance.free-pickup"],
    answerEligible: true,
    routingEligible: false,
    conflicts: [],
  }],
};

test("document keeps canonical dates, jurisdiction and chunk eligibility", () => {
  assert.deepEqual(documentSchema.parse(document), document);
  assert.equal(documentSchema.safeParse({ ...document, sourceVerifiedAt: "2026-02-29" }).success, false);
  assert.equal(documentSchema.safeParse({ ...document, effectiveFrom: "2026-12-01", effectiveUntil: "2026-12-01" }).success, false);
  assert.equal(documentSchema.safeParse({ ...document, chunks: [{ ...document.chunks[0], docId: "other.md" }] }).success, false);
});

test("a chunk cannot verify a claim it does not contain", () => {
  const invalid = { ...document, chunks: [{ ...document.chunks[0], verifiedClaims: ["unknown.claim"] }] };
  assert.equal(documentSchema.safeParse(invalid).success, false);
});

test("citations and replacements keep their evidence and validity boundaries", () => {
  const citation = {
    chunkId: document.chunks[0].chunkId,
    claimKey: document.chunks[0].claimKeys[0],
    quote: "냉장고는 무료 방문수거 대상",
    sourceUrl: document.sourceUrl,
    basisDate: "2026-01-13",
    basisDateType: "updatedAt",
  };
  assert.ok(citationSchema.safeParse(citation).success);
  assert.equal(citationSchema.safeParse({ ...citation, sourceUrl: "file:///secret" }).success, false);
  const replacement = {
    id: "case-1",
    predecessorDocId: "before.md",
    successorDocId: "after.md",
    claimKey: citation.claimKey,
    before: "이전 일정",
    after: "변경 일정",
    validFrom: "2026-09-01",
    validUntil: "2026-10-01",
    evidenceChunkIds: [citation.chunkId],
  };
  assert.ok(replacementSchema.safeParse(replacement).success);
  assert.equal(replacementSchema.safeParse({ ...replacement, validUntil: "2026-09-01" }).success, false);
});
