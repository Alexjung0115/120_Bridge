import type { Citation, Document } from "./document-schema";

export function isEligibleEvidence(
  document: Document,
  chunkId: string,
  claimKey: string,
  district: string | null,
  businessDate: string,
  citation: Citation,
): boolean {
  const chunk = document.chunks.find((item) => item.chunkId === chunkId);
  const place = document.jurisdiction;
  const matchesDistrict = place.scope === "city" || place.scope === "national" ||
    (place.scope === "district" && district !== null &&
      (place.districtName === district || place.applicableDistricts.includes(district)));

  return document.verificationStatus === "verified" &&
    matchesDistrict &&
    document.sourceVerifiedAt !== null &&
    (document.effectiveFrom === null || document.effectiveFrom <= businessDate) &&
    (document.effectiveUntil === null || businessDate < document.effectiveUntil) &&
    chunk !== undefined &&
    chunk.answerEligible &&
    chunk.conflicts.length === 0 &&
    chunk.verifiedClaims.includes(claimKey) &&
    citation.chunkId === chunkId &&
    citation.claimKey === claimKey &&
    citation.sourceUrl === document.sourceUrl &&
    citation.basisDate !== null &&
    chunk.text.includes(citation.quote);
}
