// Checks data/claims.json: each quote is inside its chunk (scripts/prepare_rag.py chunking),
// each sourceQuote is inside the dated source snapshot, and every replacement has a current claim.
// Usage: node scripts/check-claims.mjs
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/^﻿/, "");
const norm = (s) => s.replace(/\s+/g, " ").trim();
const index = JSON.parse(read("rag-data/index.json"));
const claims = JSON.parse(read("data/claims.json"));
const replacements = JSON.parse(read("data/replacements.json"));
const snapshots = Object.fromEntries(read("data/evidence-log.jsonl").trim().split("\n").map(JSON.parse)
  .map((l) => [l.docId, norm(read(l.snapshot.replace(/raw\.html$/, "text.txt")))]));

function chunks(docId) {
  const contents = read(`rag-data/${docId}`).replace(/\r\n?/g, "\n");
  const body = contents.split(/^---[ \t]*$/m).slice(2).join("---");
  const parts = body.trim().split(/^#{1,6}[ \t]+(.+)$/m);
  const sections = [[index.find((r) => r.path === docId).title, parts[0]]];
  for (let i = 1; i < parts.length; i += 2) sections.push([parts[i], parts[i + 1]]);
  return Object.fromEntries(sections.map(([, text], i) => [`${docId}/section-${i + 1}`, (text ?? "").trim()]));
}

const errors = [];
for (const c of claims) {
  const text = chunks(c.docId)[c.chunkId];
  if (!text) errors.push(`${c.claimKey}: no chunk ${c.chunkId}`);
  else if (!text.includes(c.quote)) errors.push(`${c.claimKey}: quote not in ${c.chunkId}`);
  if (!snapshots[c.docId]?.includes(norm(c.sourceQuote))) errors.push(`${c.claimKey}: sourceQuote not in snapshot of ${c.docId}`);
}
for (const r of replacements) {
  if (!claims.some((c) => c.claimKey === r.claimKey && c.docId === r.successorDocId && c.use === "answer"))
    errors.push(`${r.id}: no current claim in successor`);
  if (!claims.some((c) => c.claimKey === r.claimKey && c.docId === r.predecessorDocId && c.use === "superseded"))
    errors.push(`${r.id}: predecessor claim not marked superseded`);
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`${claims.length} claims, ${replacements.length} replacements OK`);
