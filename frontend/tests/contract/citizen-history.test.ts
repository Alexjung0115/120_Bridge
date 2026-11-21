import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { createCitizenHistoryApi } from "../../src/lib/server/citizen-history";

test("history requires the matching session credential and returns committed turns after handoff", async () => {
  const id = "10000000-0000-4000-8000-000000000001";
  const token = `cit_${"a".repeat(43)}`;
  const timestamp = "2026-11-21T00:00:00.000Z";
  const turn = { id: "10000000-0000-4000-8000-000000000002", sessionId: id, sequence: 1,
    role: "citizen", inputMode: "text", text: "문의합니다", timestamp, issueIds: [], outputStatus: "committed", factCitations: [] };
  const snapshot = { id, revision: 2, createdAt: timestamp, updatedAt: timestamp, businessDate: "2026-11-21",
    citizenTokenHash: createHash("sha256").update(token).digest("hex"), state: "serving", activeIssueId: null,
    issueIds: [], transcript: [turn, { ...turn, id: "10000000-0000-4000-8000-000000000003", sequence: 2, outputStatus: "discarded" }],
    handoffId: null, pendingRequestId: null, corpusVersion: "test", outcome: "handoff", outcomeConfirmedAt: null };
  const api = createCitizenHistoryApi(async () => snapshot);
  const request = (value?: string) => new Request("https://example.test/history", { headers: value ? { Authorization: `Bearer ${value}` } : {} });
  assert.equal((await api(request(), id)).status, 401);
  assert.equal((await api(request(`cit_${"b".repeat(43)}`), id)).status, 403);
  const response = await api(request(token), id);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const result = await response.json();
  assert.deepEqual(result.data.transcript.map((item: { text: string }) => item.text), ["문의합니다"]);
  assert.equal(JSON.stringify(result).includes(token), false);
  assert.equal(JSON.stringify(result).includes("citizenTokenHash"), false);
});
