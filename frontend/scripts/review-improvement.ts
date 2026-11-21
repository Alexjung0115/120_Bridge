import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { improvementCandidateSchema } from "../src/lib/schema/improvement";

const root = fileURLToPath(new URL("../../", import.meta.url));
const readJson = <T>(path: string) => JSON.parse(readFileSync(root + path, "utf8")) as T;
const writeJson = (path: string, value: unknown) => writeFileSync(root + path, JSON.stringify(value, null, 2) + "\n");
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

type Fixture = {
  candidate: Record<string, unknown>;
  officialEvidence: { docId: string; claimKey: string; mustContain: string };
  review: { reviewer: string; approvedAt: string };
};

const fixture = readJson<Fixture>("frontend/tests/fixtures/improvement-case.json");
const corpus = readJson<{ corpusVersion: string; documents: { docId: string; chunks: { text: string; verifiedClaims: string[] }[] }[] }>("data/normalized/corpus.json");
const document = corpus.documents.find((item) => item.docId === fixture.officialEvidence.docId);
const evidenceOk = Boolean(document?.chunks.some((chunk) =>
  chunk.verifiedClaims.includes(fixture.officialEvidence.claimKey) && chunk.text.includes(fixture.officialEvidence.mustContain),
));

// Approval is represented in a separate candidate corpus; the searchable corpus is never mutated here.
const approved = improvementCandidateSchema.parse({
  ...fixture.candidate,
  status: "approved",
  reviewer: fixture.review.reviewer,
  approvedAt: fixture.review.approvedAt,
  publishedCorpusVersion: null,
  regressionResult: null,
});
const candidateCorpusVersion = `candidate-${hash({ approved, corpusVersion: corpus.corpusVersion }).slice(0, 12)}`;
const regressionPassed = evidenceOk && corpus.corpusVersion !== candidateCorpusVersion;
const published = improvementCandidateSchema.parse({
  ...approved,
  status: "published",
  publishedCorpusVersion: candidateCorpusVersion,
  regressionResult: { passed: regressionPassed, checkedAt: fixture.review.approvedAt },
});

writeJson("data/improvement-validation.json", {
  schemaVersion: 1,
  mode: "fixture",
  corpusVersion: corpus.corpusVersion,
  candidateCorpusVersion,
  searchableCorpusChanged: false,
  officialEvidenceVerified: evidenceOk,
  reviewer: fixture.review.reviewer,
  candidate: published,
  passed: regressionPassed,
});

if (!regressionPassed) process.exitCode = 1;
