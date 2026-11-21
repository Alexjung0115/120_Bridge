import type { Citation, Document, Replacement } from "./document-schema";
import { isEligibleEvidence } from "./evidence-eligibility";
import { claimScopedDocument, governingReplacements } from "./replacements";

// Same shape as EvidenceExcerpt in src/lib/dialogue/answer.ts (AI2).
export type EvidenceExcerpt = {
  chunkId: string;
  claimKey: string;
  quote: string;
  answerEligible: boolean;
  routingEligible: boolean;
};
export type Corpus = { corpusVersion: string; documents: Document[]; citations: Citation[]; replacements?: Replacement[] };
export type SearchQuery = { text: string; district: string | null; businessDate: string };
export type SearchHit = {
  chunkId: string;
  docId: string;
  title: string;
  heading: string;
  sourceUrl: string;
  jurisdiction: Document["jurisdiction"];
  verificationStatus: Document["verificationStatus"];
  score: number;
  // replaces: earlier values this claim supersedes (empty when the claim was never replaced).
  evidence: (EvidenceExcerpt & { basisDate: string | null; basisDateType: string; replaces: Replacement[] })[];
};
export type SearchResult = {
  corpusVersion: string;
  hits: SearchHit[];
  unknownReason: "no_match" | "jurisdiction_unconfirmed" | "no_eligible_evidence" | null;
};

// Fixed from the development sample in data/retrieval-calibration.json (frontend/scripts/calibrate-retrieval.ts).
// Never tune these against the independent evaluation fixture (tests/fixtures/generalization.json).
export const RETRIEVAL_THRESHOLDS = { ngram: 2, minScore: 0.3, maxPerDoc: 2, topK: 4 } as const;

export function grams(text: string, size: number = RETRIEVAL_THRESHOLDS.ngram): Set<string> {
  const compact = text.toLowerCase().replace(/[^0-9a-z가-힣]+/g, "");
  const result = new Set<string>();
  for (let i = 0; i + size <= compact.length; i += 1) result.add(compact.slice(i, i + size));
  if (compact.length > 0 && compact.length < size) result.add(compact);
  return result;
}

type Indexed = { doc: Document; chunk: Document["chunks"][number]; grams: Set<string> };
const indexes = new WeakMap<Corpus, { chunks: Indexed[]; idf: Map<string, number> }>();

function indexOf(corpus: Corpus) {
  let index = indexes.get(corpus);
  if (!index) {
    const chunks = corpus.documents.flatMap((doc) => doc.chunks.map((chunk) => ({
      doc, chunk, grams: grams(`${doc.title} ${chunk.heading} ${chunk.text}`),
    })));
    const df = new Map<string, number>();
    for (const item of chunks) for (const gram of item.grams) df.set(gram, (df.get(gram) ?? 0) + 1);
    const idf = new Map([...df].map(([gram, count]) => [gram, Math.log(1 + chunks.length / count)]));
    index = { chunks, idf };
    indexes.set(corpus, index);
  }
  return index;
}

// Weighted share of the query's n-grams found in the chunk (0..1).
function score(query: Set<string>, chunk: Set<string>, idf: Map<string, number>): number {
  let total = 0;
  let found = 0;
  for (const gram of query) {
    // N-grams absent from the corpus (endings, small talk) carry no evidence either way.
    const weight = idf.get(gram) ?? 0;
    total += weight;
    if (chunk.has(gram)) found += weight;
  }
  return total ? found / total : 0;
}

function appliesTo(doc: Document, district: string | null): boolean {
  const place = doc.jurisdiction;
  if (place.scope === "city" || place.scope === "national" || place.scope === "organization") return true;
  return place.scope === "district" && district !== null &&
    (place.districtName === district || place.applicableDistricts.includes(district));
}

function inEffect(doc: Pick<Document, "effectiveFrom" | "effectiveUntil">, businessDate: string): boolean {
  return (doc.effectiveFrom === null || doc.effectiveFrom <= businessDate) &&
    (doc.effectiveUntil === null || businessDate < doc.effectiveUntil);
}

/**
 * Filters by verification, jurisdiction and validity first, then ranks by Korean character n-grams.
 * Ranking never decides eligibility: a high score on an ineligible chunk is never returned.
 */
export function search(corpus: Corpus, query: SearchQuery, thresholds = RETRIEVAL_THRESHOLDS): SearchResult {
  const { chunks, idf } = indexOf(corpus);
  const queryGrams = grams(query.text, thresholds.ngram);
  const matched = chunks
    .map((item) => ({ ...item, score: score(queryGrams, item.grams, idf) }))
    .filter((item) => item.score >= thresholds.minScore)
    .sort((a, b) => b.score - a.score || a.chunk.chunkId.localeCompare(b.chunk.chunkId));

  const hits: SearchHit[] = [];
  const perDoc = new Map<string, number>();
  for (const { doc, chunk, score: value } of matched) {
    if (doc.verificationStatus !== "verified" || !appliesTo(doc, query.district)) continue;
    if (chunk.conflicts.length || (!chunk.answerEligible && !chunk.routingEligible)) continue;
    const evidence = corpus.citations
      .filter((citation) => citation.chunkId === chunk.chunkId && chunk.verifiedClaims.includes(citation.claimKey))
      .map((citation) => {
        // Validity is decided per claim: a replaced claim uses its replacement window (T039).
        const claimDoc = claimScopedDocument(corpus.replacements, doc, citation.claimKey);
        const valid = inEffect(claimDoc, query.businessDate);
        return {
          chunkId: chunk.chunkId,
          claimKey: citation.claimKey,
          quote: citation.quote,
          answerEligible: valid && chunk.answerEligible &&
            isEligibleEvidence(claimDoc, chunk.chunkId, citation.claimKey, query.district, query.businessDate, citation),
          // Routing shows a missing basis date as 미확인 instead of hiding the channel (spec edge case).
          routingEligible: valid && chunk.routingEligible && citation.claimKey.startsWith("routing."),
          basisDate: citation.basisDate,
          basisDateType: citation.basisDateType,
          replaces: governingReplacements(corpus.replacements, doc.docId, citation.claimKey),
        };
      })
      .filter((item) => item.answerEligible || item.routingEligible);
    if (!evidence.length || (perDoc.get(doc.docId) ?? 0) >= thresholds.maxPerDoc) continue;
    perDoc.set(doc.docId, (perDoc.get(doc.docId) ?? 0) + 1);
    hits.push({
      chunkId: chunk.chunkId,
      docId: doc.docId,
      title: doc.title,
      heading: chunk.heading,
      sourceUrl: doc.sourceUrl,
      jurisdiction: doc.jurisdiction,
      verificationStatus: doc.verificationStatus,
      score: Math.round(value * 1000) / 1000,
      evidence,
    });
    if (hits.length >= thresholds.topK) break;
  }

  let unknownReason: SearchResult["unknownReason"] = null;
  if (!hits.length) {
    unknownReason = !matched.length ? "no_match"
      : query.district === null && matched.some(({ doc }) => doc.jurisdiction.scope === "district" && doc.verificationStatus === "verified")
        ? "jurisdiction_unconfirmed" : "no_eligible_evidence";
  }
  return { corpusVersion: corpus.corpusVersion, hits, unknownReason };
}
