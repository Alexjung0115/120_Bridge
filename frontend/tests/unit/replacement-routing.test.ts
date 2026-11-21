import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { replacementSchema } from "../../src/lib/retrieval/document-schema";
import { activeReplacement, supportedRoutingName } from "../../src/lib/retrieval/replacement-eligibility";

const replacements = JSON.parse(
  readFileSync(new URL("../../../data/replacements.json", import.meta.url), "utf8"),
) as unknown[];

test("policy replacement records preserve claim-specific evidence and dates", () => {
  const parsed = replacements.map((replacement) => replacementSchema.parse(replacement));
  assert.ok(parsed.some((replacement) => replacement.claimKey === "policy.climate-card.prepaid-30day.end"));
  assert.ok(parsed.some((replacement) => replacement.claimKey === "policy.climate-card.postpaid.end"));
  assert.ok(parsed.every((replacement) => replacement.evidenceChunkIds.length > 0));
  assert.ok(parsed.every((replacement) => replacement.predecessorDocId !== replacement.successorDocId));
});

test("replacement records keep separate prepaid, postpaid and payback claims", () => {
  const claimKeys = replacements.map((replacement) => replacementSchema.parse(replacement).claimKey);
  assert.equal(new Set(claimKeys).has("policy.climate-card.prepaid-30day.end"), true);
  assert.equal(new Set(claimKeys).has("policy.climate-card.postpaid.end"), true);
  assert.equal(new Set(claimKeys).has("policy.climate-card.payback.application-period"), true);
});

const parsed = replacements.map((replacement) => replacementSchema.parse(replacement));

test("replaces only the requested claim and leaves unrelated routing claims unchanged", () => {
  assert.equal(activeReplacement(parsed, "policy.climate-card.postpaid.end", "2026-11-21")?.claimKey,
    "policy.climate-card.postpaid.end");
  assert.equal(activeReplacement(parsed, "routing.climate-card.owner", "2026-11-21"), null);
});

test("keeps prepaid and postpaid end dates independent", () => {
  assert.notEqual(
    activeReplacement(parsed, "policy.climate-card.prepaid-30day.end", "2026-11-21")?.after,
    activeReplacement(parsed, "policy.climate-card.postpaid.end", "2026-11-21")?.after,
  );
});

test("excludes future-effective replacement claims", () => {
  assert.equal(activeReplacement(parsed, "policy.climate-card.payback.application-period", "2026-09-16"), null);
  assert.ok(activeReplacement(parsed, "policy.climate-card.payback.application-period", "2026-09-17"));
});

test("does not name a department without routing evidence", () => {
  assert.equal(supportedRoutingName("정책과", []), null);
  assert.equal(supportedRoutingName("티머니", ["routing/chunk-1"]), "티머니");
});
