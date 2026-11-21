import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { issueSchema } from "../../src/lib/schema/issue.ts";
import { decideSummary, draftSummary, editSummary, generateSummary } from "../../src/lib/dialogue/summary.ts";
import { ResponsesClient } from "../../src/lib/dialogue/model-client.ts";

function input() {
  return { sessionRevision: 3, citizenTurns: ["마포구에서 냉장고 배출하고 입금도 확인해주세요"], reason: "personal_lookup",
    issues: [issueSchema.parse({ id: randomUUID(), sessionId: randomUUID(), order: 0,
      citizenRequest: "마포구 배출 및 입금 확인", intent: "문의", category: "복합", jurisdiction: null,
      fields: {
        "disposal.district": { value: "마포구", status: "known", originTurnId: randomUUID(), confirmed: true },
        item: { value: "냉장고", status: "known", originTurnId: randomUUID(), confirmed: false },
      }, locations: [], questionCounts: {}, noEvidenceQuestionCount: 0, lowConfidenceStreak: 0,
      status: "unresolved", sourceChunkIds: [], alreadyTold: ["일반 배출 안내"], candidateIds: [],
    })] };
}

test("fallback preserves original requests, individual confirmation and unresolved needs", async () => {
  const source = input();
  const client = new ResponsesClient("https://example.invalid", "test", "test", async () => new Response("", { status: 401 }));
  const summary = await generateSummary(client, source);
  assert.deepEqual(summary.coreLines, source.citizenTurns);
  assert.match(summary.issueSummaries[0].text, /입금/);
  assert.equal(summary.confirmation, "pending");
  assert.equal(summary.fieldConfirmations[0].status, "confirmed");
  assert.equal(summary.sentimentIsEstimate, true);
});

test("partial edit resets only changed fields and rejects stale approval", () => {
  const draft = draftSummary(input());
  const confirmed = decideSummary(draft, 0, { action: "confirm", confirmedAt: new Date().toISOString() });
  const changed = editSummary(confirmed, 0, 4, [{ fieldKey: draft.fieldConfirmations[1].fieldKey, value: "세탁기" }]);
  assert.equal(changed.confirmation, "pending");
  assert.equal(changed.confirmedAt, null);
  assert.equal(changed.fieldConfirmations[0].status, "confirmed");
  assert.equal(changed.fieldConfirmations[1].status, "unconfirmed");
  assert.match(changed.coreLines[0], /세탁기/);
  assert.throws(() => decideSummary(changed, 0, { action: "confirm", confirmedAt: new Date().toISOString() }));
  assert.throws(() => editSummary(changed, 1, 5, [{ fieldKey: "invented", value: "값" }]));
  const skipped = decideSummary(changed, 1, { action: "skip", reason: "시민이 확인 생략 요청" });
  assert.equal(skipped.confirmation, "unconfirmed");
  assert.equal(skipped.fieldConfirmations[0].status, "confirmed");
});

test("cancelled or stale summaries cannot fall back into the current session", async () => {
  const client = new ResponsesClient("https://example.invalid", "test", "test", async () => new Response("", { status: 401 }));
  await assert.rejects(generateSummary(client, input(), undefined, () => false), { name: "AbortError" });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(generateSummary(client, input(), controller.signal), { name: "AbortError" });
});
