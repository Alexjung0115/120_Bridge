// Builds data/normalized/corpus.json from rag-data/, data/claims.json, data/evidence-log.jsonl,
// data/replacements.json, data/source-manifest.json and data/audit-report.json (T013). Usage: npm run data:build
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  citationSchema,
  documentSchema,
  replacementSchema,
  type Chunk,
  type Citation,
  type Document,
  type Replacement,
} from "../src/lib/retrieval/document-schema";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const read = (path: string) => readFileSync(ROOT + path, "utf8").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const jsonLines = (text: string) => text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));

type IndexRecord = Record<string, string | boolean> & { path: string; verified: boolean };
type Claim = {
  claimKey: string; chunkId: string; docId: string; use: "answer" | "routing" | "conflict" | "superseded";
  quote: string; sourceUrl: string; jurisdiction: { scope: string; districtName?: string };
  basisDate: string | null; basisDateType: string; note?: string; reviewStatus: string;
};
type EvidenceEntry = {
  docId: string; result: string; verifiedFlag: boolean | null; approvedBy: string | null; approvedAt: string | null;
  excludedClaims?: string[];
};
export type Issue = { target: string; message: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// ponytail: one section = one chunk so claims.json chunk IDs (scripts/prepare_rag.py) stay stable.
// Tables stay whole with their header; split long sections only when chunk IDs can be remapped.
const LONG_CHUNK = 800;

export function normalizeJurisdiction(value: string): Document["jurisdiction"] {
  if (/^[가-힣]+구$/.test(value)) return { scope: "district", districtName: value, applicableDistricts: [value] };
  if (value === "서울시" || value === "서울특별시") return { scope: "city", districtName: null, applicableDistricts: [] };
  if (value.startsWith("전국")) return { scope: "national", districtName: null, applicableDistricts: [] };
  // An organization (e.g. 120다산콜재단) is a contact channel, not a district.
  return { scope: value && value !== "미확인" ? "organization" : "unknown", districtName: null, applicableDistricts: [] };
}

// Only the date named by date_basis is set. Publication/update dates never become effectiveFrom.
export function normalizeDates(effectiveDate: string, basis: string) {
  const dates: { publishedAt: string | null; updatedAt: string | null; effectiveFrom: string | null } =
    { publishedAt: null, updatedAt: null, effectiveFrom: null };
  const value = ISO_DATE.test(effectiveDate) ? effectiveDate : null;
  const field = basis.startsWith("시행일") ? "effectiveFrom"
    : basis.startsWith("게시일") ? "publishedAt"
      : /수정일|업데이트/.test(basis) ? "updatedAt" : null;
  if (value && field) dates[field] = value;
  const dateStatus = value && field ? `${field}: ${basis}` : `unknown: ${basis || "date_basis 없음"}`;
  return { ...dates, dateStatus };
}

function parseMarkdown(text: string) {
  const [, frontMatter = "", ...rest] = text.split(/^---[ \t]*$/m);
  const meta: Record<string, string> = {};
  for (const line of frontMatter.split("\n")) {
    const at = line.indexOf(": ");
    if (at > 0) meta[line.slice(0, at)] = line.slice(at + 2).trim().replace(/^"(.*)"$/, "$1");
  }
  const parts = rest.join("---").trim().split(/^#{1,6}[ \t]+(.+)$/m);
  const sections: [string | null, string][] = [[null, parts[0]]];
  for (let i = 1; i < parts.length; i += 2) sections.push([parts[i], parts[i + 1] ?? ""]);
  return { meta, sections };
}

export function buildCorpus() {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const excluded: Issue[] = [];
  const inputs = {
    index: read("rag-data/index.json"),
    claims: read("data/claims.json"),
    evidenceLog: read("data/evidence-log.jsonl"),
    replacements: read("data/replacements.json"),
    audit: read("data/audit-report.json"),
    manifest: read("data/source-manifest.json"),
    welfare: read("data/normalized/seoul-welfare.jsonl"),
  };
  const index: IndexRecord[] = JSON.parse(inputs.index);
  const claims: Claim[] = JSON.parse(inputs.claims);
  const evidence: EvidenceEntry[] = jsonLines(inputs.evidenceLog);
  const audit = JSON.parse(inputs.audit) as { duplicateUrlGroups: { url: string; docIds: string[] }[] };
  const manifest = JSON.parse(inputs.manifest) as { blockedCandidates: { docId: string; reason: string }[] };

  // The latest AI1 approval line per document decides verification; earlier lines stay as history.
  const approvals = new Map<string, EvidenceEntry>();
  for (const entry of evidence) {
    if (entry.result === "approved" && entry.verifiedFlag === true && entry.approvedBy === "AI1") approvals.set(entry.docId, entry);
  }
  const blocked = new Map(manifest.blockedCandidates.map((item) => [item.docId, item.reason]));

  const documents: Document[] = [];
  for (const record of index) {
    const docId = record.path;
    const sourcePath = `rag-data/${docId}`;
    let text: string;
    try {
      text = read(sourcePath);
    } catch {
      errors.push({ target: docId, message: `${sourcePath} 파일이 없다.` });
      continue;
    }
    const { meta, sections } = parseMarkdown(text);
    for (const [key, value] of Object.entries(record)) {
      if (key === "path" || key === "verified") continue;
      if (meta[key] !== String(value)) errors.push({ target: docId, message: `front matter와 index의 ${key} 값이 다르다: ${JSON.stringify(meta[key])} / ${JSON.stringify(value)}` });
    }
    for (const key of Object.keys(meta)) {
      if (!(key in record)) errors.push({ target: docId, message: `front matter의 ${key}가 index에 없다.` });
    }

    const approval = approvals.get(docId);
    const blockReason = blocked.get(docId);
    const priorReview = String(record.source_verified ?? "").match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
    const verificationStatus: Document["verificationStatus"] = blockReason
      ? (blockReason.includes("상충") ? "conflict" : "blocked")
      : approval ? "verified" : record.verified ? "historical" : "unverified";
    if (blockReason) excluded.push({ target: docId, message: blockReason });

    const chunks: Chunk[] = sections
      .map(([heading, body], number) => ({ heading: heading ?? String(record.title), body: body.trim(), number: number + 1 }))
      .filter((section) => section.body)
      .map(({ heading, body, number }) => ({
        chunkId: `${docId}/section-${number}`,
        docId,
        heading: heading.trim(),
        text: body,
        claimKeys: [],
        verifiedClaims: [],
        answerEligible: false,
        routingEligible: false,
        conflicts: [],
      }));
    for (const chunk of chunks) {
      if (chunk.text.length > LONG_CHUNK) warnings.push({ target: chunk.chunkId, message: `${chunk.text.length}자 청크. 표·소제목 단위 보존을 위해 분할하지 않았다.` });
    }

    const dates = normalizeDates(String(record.effective_date ?? ""), String(record.date_basis ?? ""));
    documents.push({
      docId,
      sourcePath,
      title: String(record.title),
      category: String(record.category),
      jurisdiction: normalizeJurisdiction(String(record.jurisdiction)),
      sourceUrl: String(record.source_url),
      retrievedAt: String(record.retrieved_at),
      publishedAt: dates.publishedAt,
      updatedAt: dates.updatedAt,
      effectiveFrom: dates.effectiveFrom,
      effectiveUntil: null,
      dateStatus: dates.dateStatus,
      sourceVerifiedAt: approval ? approval.approvedAt : priorReview,
      verificationStatus,
      sourceHash: sha256(text),
      chunks,
    });
  }

  // Claims decide eligibility per claim, never per document.
  const byDoc = new Map(documents.map((doc) => [doc.docId, doc]));
  const citations: Citation[] = [];
  for (const claim of claims) {
    const doc = byDoc.get(claim.docId);
    const chunk = doc?.chunks.find((item) => item.chunkId === claim.chunkId);
    const target = `${claim.claimKey} @ ${claim.chunkId}`;
    if (!doc || !chunk) { errors.push({ target, message: "claim이 가리키는 청크가 없다." }); continue; }
    if (!chunk.text.includes(claim.quote)) { errors.push({ target, message: "quote가 청크 본문에 없다." }); continue; }
    if (claim.sourceUrl !== doc.sourceUrl) errors.push({ target, message: "claim sourceUrl이 문서 sourceUrl과 다르다." });
    if (claim.jurisdiction.scope !== doc.jurisdiction.scope || (claim.jurisdiction.districtName ?? null) !== doc.jurisdiction.districtName) {
      errors.push({ target, message: "claim 관할이 정규화된 문서 관할과 다르다." });
    }
    if (!chunk.claimKeys.includes(claim.claimKey)) chunk.claimKeys.push(claim.claimKey);

    if (claim.use === "conflict") {
      chunk.conflicts.push(`${claim.claimKey}: ${claim.note ?? "상충"}`);
      excluded.push({ target, message: "상충 claim" });
      continue;
    }
    if (claim.use === "superseded") {
      excluded.push({ target, message: "대체된 claim. 대체 관계(data/replacements.json)로만 참조한다." });
      continue;
    }
    const approval = approvals.get(claim.docId);
    if (doc.verificationStatus !== "verified" || claim.reviewStatus !== "approved" || approval?.excludedClaims?.includes(claim.claimKey)) {
      excluded.push({ target, message: `검증 승인 없음 (${doc.verificationStatus})` });
      continue;
    }
    chunk.verifiedClaims.push(claim.claimKey);
    if (claim.use === "answer") chunk.answerEligible = true;
    if (claim.use === "routing") chunk.routingEligible = true;
    citations.push({
      chunkId: chunk.chunkId,
      claimKey: claim.claimKey,
      quote: claim.quote,
      sourceUrl: claim.sourceUrl,
      basisDate: claim.basisDate,
      basisDateType: claim.basisDateType,
    });
  }
  // A conflict anywhere in a chunk removes the whole chunk from answers and routing.
  for (const chunk of documents.flatMap((doc) => doc.chunks)) {
    if (chunk.conflicts.length) chunk.answerEligible = chunk.routingEligible = false;
  }

  const chunkIds = new Set<string>();
  for (const doc of documents) {
    const parsed = documentSchema.safeParse(doc);
    if (!parsed.success) errors.push({ target: doc.docId, message: parsed.error.message });
    for (const chunk of doc.chunks) {
      if (chunkIds.has(chunk.chunkId)) errors.push({ target: chunk.chunkId, message: "중복 chunkId" });
      chunkIds.add(chunk.chunkId);
    }
  }
  for (const citation of citations) {
    const parsed = citationSchema.safeParse(citation);
    if (!parsed.success) errors.push({ target: `${citation.claimKey} citation`, message: parsed.error.message });
  }
  const replacements: Replacement[] = JSON.parse(inputs.replacements);
  for (const replacement of replacements) {
    const parsed = replacementSchema.safeParse(replacement);
    if (!parsed.success) errors.push({ target: replacement.id, message: parsed.error.message });
    for (const id of replacement.evidenceChunkIds) {
      if (!chunkIds.has(id)) errors.push({ target: replacement.id, message: `없는 근거 청크 ${id}` });
    }
  }

  // Same URL = one source. Records stay separate documents, but count once and point at one canonical doc.
  const byUrl = new Map<string, string[]>();
  for (const doc of documents) byUrl.set(doc.sourceUrl, [...(byUrl.get(doc.sourceUrl) ?? []), doc.docId]);
  const rank = { verified: 0, historical: 1, unverified: 2, conflict: 3, blocked: 4 };
  const sourceGroups = [...byUrl].filter(([, ids]) => ids.length > 1).map(([sourceUrl, docIds]) => ({
    sourceUrl,
    docIds,
    canonicalDocId: [...docIds].sort((a, b) => rank[byDoc.get(a)!.verificationStatus] - rank[byDoc.get(b)!.verificationStatus])[0],
  }));
  for (const group of audit.duplicateUrlGroups) {
    if (!sourceGroups.some((item) => item.sourceUrl === group.url)) warnings.push({ target: group.url, message: "audit-report의 중복 URL 그룹이 index에 더 이상 없다." });
  }

  // Welfare records are unverified program candidates with their own shape; they stay a separate dataset.
  const welfareRecords = jsonLines(inputs.welfare).length;
  const externalDatasets = [{
    path: "data/normalized/seoul-welfare.jsonl",
    sha256: sha256(inputs.welfare),
    records: welfareRecords,
    includedInCorpus: false,
    reason: "사업별 최신 공고 대조 전 unverified 후보 자료다. 답변·라우팅 근거가 아니므로 시연 corpus에 섞지 않고 버전만 고정한다.",
  }];

  const inputHashes = Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, sha256(value)]));
  const body = { schemaVersion: 1, documents, citations, replacements, sourceGroups, externalDatasets, inputHashes };
  const corpusHash = sha256(JSON.stringify(body));
  const corpusVersion = `corpus-${corpusHash.slice(0, 12)}`;
  const chunks = documents.flatMap((doc) => doc.chunks);
  const counts = {
    records: documents.length,
    uniqueSourceUrls: byUrl.size,
    chunks: chunks.length,
    answerEligibleChunks: chunks.filter((chunk) => chunk.answerEligible).length,
    routingEligibleChunks: chunks.filter((chunk) => chunk.routingEligible).length,
    citations: citations.length,
    replacements: replacements.length,
    byVerificationStatus: Object.fromEntries(Object.keys(rank).map((status) => [status, documents.filter((doc) => doc.verificationStatus === status).length])),
    externalWelfareRecords: welfareRecords,
  };
  return { corpus: { corpusVersion, corpusHash, ...body }, report: { corpusVersion, corpusHash, ok: errors.length === 0, counts, errors, warnings, excluded } };
}

export function writeJson(path: string, value: unknown) {
  writeFileSync(ROOT + path, JSON.stringify(value, null, 2) + "\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { corpus, report } = buildCorpus();
  writeJson("data/validation-report.json", report);
  if (!report.ok) {
    console.error(report.errors.map((issue) => `${issue.target}: ${issue.message}`).join("\n"));
    process.exit(1);
  }
  writeJson("data/normalized/corpus.json", corpus);
  console.log(`${corpus.corpusVersion}: ${JSON.stringify(report.counts)}`);
}
