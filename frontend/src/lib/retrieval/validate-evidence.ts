import { isEligibleEvidence } from "./evidence-eligibility";
import { claimScopedDocument } from "./replacements";
import type { Corpus } from "./search";

export type AnswerUnit = {
  text: string;
  citations: { chunkId: string; claimKey: string; quote: string }[];
};
export type EvidenceCheck = { ok: boolean; problems: string[] };

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
const numbers = (text: string) => (text.match(NUMBER) ?? []).map((value) => value.replace(/,/g, ""));

/**
 * Checks an answer unit after the model wrote it:
 * - every citation is a real, currently eligible quote of its chunk (jurisdiction, dates, verification),
 * - every number in the answer appears in a cited quote,
 * - every stated target (item, applicant group) appears in a cited quote.
 */
export function validateAnswerUnit(
  corpus: Corpus,
  unit: AnswerUnit,
  context: { district: string | null; businessDate: string; targets?: string[] },
): EvidenceCheck {
  const problems: string[] = [];
  if (!unit.citations.length) problems.push("인용이 없다.");
  for (const cited of unit.citations) {
    const doc = corpus.documents.find((item) => item.chunks.some((chunk) => chunk.chunkId === cited.chunkId));
    const citation = corpus.citations.find((item) => item.chunkId === cited.chunkId && item.claimKey === cited.claimKey);
    if (!doc || !citation) {
      problems.push(`${cited.claimKey}: corpus에 없는 인용이다.`);
    } else if (!isEligibleEvidence(claimScopedDocument(corpus.replacements, doc, cited.claimKey), cited.chunkId, cited.claimKey, context.district, context.businessDate, { ...citation, quote: cited.quote })) {
      problems.push(`${cited.claimKey}: 관할·유효기간·검증·기준일 조건을 통과하지 못했거나 인용문이 청크에 없다.`);
    }
  }
  const quoted = unit.citations.map((item) => item.quote).join("\n");
  const quotedNumbers = new Set(numbers(quoted));
  for (const value of numbers(unit.text)) {
    if (!quotedNumbers.has(value)) problems.push(`숫자 ${value}가 인용문에 없다.`);
  }
  for (const target of context.targets ?? []) {
    if (!quoted.includes(target)) problems.push(`대상 "${target}"이 인용문에 없다.`);
  }
  return { ok: problems.length === 0, problems };
}
