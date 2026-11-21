import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const readJson = <T>(path: string) => JSON.parse(readFileSync(root + path, "utf8")) as T;
const writeJson = (path: string, value: unknown) => writeFileSync(root + path, JSON.stringify(value, null, 2) + "\n");
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

type Case = { id: string; expected: { action: string; documents?: string[] }; coverage?: { unavailableDomain?: string; district?: string } };
const fixture = readJson<{ cases: Case[] }>("frontend/tests/fixtures/generalization.json");
const corpusText = readFileSync(root + "data/normalized/corpus.json", "utf8");
const corpus = JSON.parse(corpusText) as { corpusVersion: string; corpusHash: string; documents: { docId: string }[] };
const t025Ready = existsSync(root + "frontend/tests/integration/us2-handoff.test.ts");
const docs = new Set(corpus.documents.map((item) => item.docId));
const documentChecks = fixture.cases.filter((item) => item.expected.documents?.every((doc) => docs.has(doc))).length;
const unavailableDomains = new Set(fixture.cases.map((item) => item.coverage?.unavailableDomain).filter(Boolean));
const districts = new Set(fixture.cases.map((item) => item.coverage?.district).filter(Boolean));
const fixtureReady = fixture.cases.length === 15 && unavailableDomains.size >= 3 && districts.size >= 3 && documentChecks === fixture.cases.filter((item) => item.expected.documents).length;
const passed = fixtureReady && t025Ready;

writeJson("data/generalization-report.json", {
  schemaVersion: 1,
  corpusVersion: corpus.corpusVersion,
  fixtureCases: fixture.cases.length,
  unavailableDomains: unavailableDomains.size,
  districts: districts.size,
  documentChecks,
  t025Ready,
  passed,
  blockedBy: t025Ready ? [] : ["T025 integration test is not present"],
});
if (passed) writeJson("data/corpus-freeze.json", { corpusVersion: corpus.corpusVersion, corpusHash: corpus.corpusHash, fileSha256: sha256(corpusText), frozenOn: "2026-11-21" });
if (!passed) process.exitCode = 1;
