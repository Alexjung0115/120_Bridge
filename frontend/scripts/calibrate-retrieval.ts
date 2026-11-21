// Runs the development sample in data/retrieval-calibration.json against the current corpus and
// records results next to the fixed thresholds (T014). Usage: npx tsx scripts/calibrate-retrieval.ts
// The independent evaluation fixture (tests/fixtures/generalization.json) is never read here.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { RETRIEVAL_THRESHOLDS, search, type Corpus } from "../src/lib/retrieval/search";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
type Sample = {
  id: string; text: string; district: string | null; businessDate: string;
  expect: { chunkIds?: string[]; use?: "answer" | "routing"; unknownReason?: string; none?: boolean };
};

export function loadCorpus(): Corpus {
  return JSON.parse(readFileSync(ROOT + "data/normalized/corpus.json", "utf8"));
}

export function runSamples(corpus: Corpus, samples: Sample[]) {
  return samples.map((sample) => {
    const result = search(corpus, sample);
    const top = result.hits.map((hit) => hit.chunkId);
    const use = sample.expect.use;
    const found = (sample.expect.chunkIds ?? []).every((id) => result.hits.some((hit) => hit.chunkId === id &&
      (!use || hit.evidence.some((item) => (use === "answer" ? item.answerEligible : item.routingEligible)))));
    const pass = sample.expect.none ? !top.length
      : sample.expect.unknownReason ? result.unknownReason === sample.expect.unknownReason && !top.length : found;
    return { id: sample.id, pass, top, scores: result.hits.map((hit) => hit.score), unknownReason: result.unknownReason };
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const path = ROOT + "data/retrieval-calibration.json";
  const calibration = JSON.parse(readFileSync(path, "utf8"));
  const corpus = loadCorpus();
  const results = runSamples(corpus, calibration.devSamples);
  writeFileSync(path, JSON.stringify({ ...calibration, corpusVersion: corpus.corpusVersion, thresholds: RETRIEVAL_THRESHOLDS, results }, null, 2) + "\n");
  for (const result of results) console.log(`${result.pass ? "PASS" : "FAIL"} ${result.id} ${result.top.join(", ") || result.unknownReason}`);
  if (results.some((result) => !result.pass)) process.exit(1);
}
