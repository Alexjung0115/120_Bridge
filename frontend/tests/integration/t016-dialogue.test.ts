import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { loadCorpus } from "../../scripts/calibrate-retrieval";
import { createDialogueApi, parseDialogueSnapshot } from "../../src/lib/dialogue/dialogue-api";
import type { DialogueCandidate } from "../../src/lib/dialogue/candidate-schema";
import { ResponsesClient } from "../../src/lib/dialogue/model-client";
import { issueCitizenToken } from "../../src/lib/server/auth";
import type { SavedCommand, SessionPersistence } from "../../src/lib/store/snapshot";

const corpus = loadCorpus();
const text = "소파 버리는 수수료가 얼마예요?";
const proposal = {
  localId: "fee", request: text,
  knownFields: [{ fieldKey: "disposal.district", value: "마포구" }],
  missingFields: [], needsPersonalLookup: false,
};
const intake: DialogueCandidate = {
  intent: "문의", category: "대형폐기물", sentiment: "보통", confidence: "high",
  issues: [proposal], answerUnits: [], proposedQuestion: null, routingEvidence: [], summaryProposal: null,
};

function setup({
  extracted = intake,
  waitForAnswer = Promise.resolve(),
  responseWaitMs = 1_000,
  rewrite = (quote: string) => quote,
} = {}) {
  const { token, tokenHash } = issueCitizenToken();
  const id = randomUUID();
  const day = "2026-11-21";
  const timestamp = day + "T00:00:00.000Z";
  let stored = parseDialogueSnapshot({
    id, revision: 0, createdAt: timestamp, updatedAt: timestamp, businessDate: day,
    citizenTokenHash: tokenHash, state: "active", activeIssueId: null, issueIds: [], issues: [], transcript: [],
    handoffId: null, pendingRequestId: null, corpusVersion: corpus.corpusVersion, outcome: "unknown",
    outcomeConfirmedAt: null,
  });
  const receipts = new Map<string, SavedCommand>();
  const persistence: SessionPersistence = {
    load: async (key) => key === id ? structuredClone(stored) : null,
    initialize: async () => assert.fail("already seeded"),
    replay: async (_key, command) => receipts.get(command) ?? null,
    commit: async (_key, command, revision, next, result) => {
      const existing = receipts.get(command);
      if (existing) return existing;
      if (revision !== stored.revision) return { status: "conflict", revision: stored.revision };
      stored = parseDialogueSnapshot(structuredClone(next));
      receipts.set(command, { status: "replayed", revision: stored.revision, result });
      return { status: "committed", revision: stored.revision, result };
    },
  };

  let calls = 0;
  const model = new ResponsesClient("https://dialogue.invalid/responses", "fixture-key", "fixture", async (_url, init) => {
    calls += 1;
    const input = JSON.parse(JSON.parse(String(init?.body)).input);
    let candidate = extracted;
    if (input.evidence) {
      await waitForAnswer;
      const source = input.evidence.find(({ claimKey }: { claimKey: string }) => claimKey === "waste.mapo.sofa.fee");
      if (!source) throw new Error("Expected district evidence");
      const { chunkId, claimKey, quote } = source;
      candidate = { ...extracted, answerUnits: [{ issueLocalId: "fee", text: rewrite(quote),
        citations: [{ chunkId, claimKey, quote }] }] };
    }
    return Response.json({ status: "completed", output: [{ type: "message", content: [{
      type: "output_text", text: JSON.stringify(candidate),
    }] }] });
  });
  const api = createDialogueApi({ persistence, corpus, model, responseWaitMs });
  const request = (path: string, body?: object, bearer = token) => new Request("https://bridge.invalid/api/sessions/" + id + path, {
    method: body ? "POST" : "GET", headers: { Authorization: "Bearer " + bearer },
    body: body ? JSON.stringify(body) : undefined,
  });
  const turnCommand = { commandId: randomUUID(), baseRevision: 0, text, inputMode: "text" };
  return { api, id, request, turnCommand, calls: () => calls, stored: () => stored };
}

test("T016 saves verified guidance, replays without model work, and requires explicit resolution", async () => {
  const { api, id, request, turnCommand, calls, stored } = setup();
  const response = await api.turn(request("/turns", turnCommand), id);
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.processing, false);
  assert.equal(data.issues[0].status, "advised");
  assert.equal(data.cards[0].citations[0].claimKey, "waste.mapo.sofa.fee");
  assert.ok(data.cards[0].basisDate);
  assert.equal(data.citizenTokenHash, undefined);
  assert.equal(stored().outcome, "unknown");
  const replay = await api.turn(request("/turns", turnCommand), id);
  assert.equal(replay.status, 200);
  assert.deepEqual((await replay.json()).data, data);
  assert.equal(calls(), 2);
  const more = await api.outcome(request("/outcome", {
    commandId: randomUUID(), baseRevision: data.revision, decision: "need_more",
  }), id);
  assert.equal(more.status, 200);
  assert.equal(stored().state, "active");
  const confirmed = await api.outcome(request("/outcome", {
    commandId: randomUUID(), baseRevision: stored().revision, decision: "resolved",
  }), id);
  assert.equal(confirmed.status, 200);
  assert.equal(stored().state, "ended");
  assert.equal(stored().outcome, "ai_confirmed");
  assert.ok(stored().outcomeConfirmedAt);
});

test("T016 returns 202, deduplicates pending work and publishes the result via authenticated polling", async () => {
  const gate = Promise.withResolvers<void>();
  const { api, id, request, turnCommand, calls } = setup({ waitForAnswer: gate.promise, responseWaitMs: 0 });
  try {
    const accepted = await api.turn(request("/turns", turnCommand), id);
    assert.equal(accepted.status, 202);
    const { data } = await accepted.json();
    assert.equal(data.processing, true);
    assert.equal((await api.turn(request("/turns", turnCommand), id)).status, 202);
    assert.equal((await api.read(request("", undefined, issueCitizenToken().token), id)).status, 403);
    assert.equal((await (await api.read(request(""), id)).json()).data.processing, true);
  } finally {
    gate.resolve();
  }
  for (let attempt = 0; attempt < 100; attempt++) {
    const { data } = await (await api.read(request(""), id)).json();
    if (!data.processing) {
      assert.equal(data.cards.length, 1);
      assert.equal(data.utterances.length, 1);
      assert.equal(calls(), 2);
      return;
    }
    await delay(5);
  }
  assert.fail("polling never observed committed guidance");
});

test("T016 rejects unsupported claims, personal lookup and incomplete issue sets", async () => {
  for (const options of [
    { rewrite: (quote: string) => quote + " 모든 품목에 적용됩니다." },
    { extracted: { ...intake, issues: [{ ...proposal, needsPersonalLookup: true }] } },
    { extracted: { ...intake, issues: [{ ...proposal, knownFields: [
      { fieldKey: "residence.district", value: "마포구" }, { fieldKey: "disposal.district", value: "강남구" },
    ] }] } },
    { extracted: { ...intake, issues: [proposal, { ...proposal, localId: "other", request: "별도 문의" }] } },
  ]) {
    const { api, id, request, turnCommand, stored, calls } = setup(options);
    const response = await api.turn(request("/turns", turnCommand), id);
    assert.equal(response.status, 200);
    const multiple = options.extracted?.issues.length === 2;
    assert.equal((await response.json()).data.cards.length, multiple ? 1 : 0);
    if (options.extracted?.issues[0].needsPersonalLookup) assert.equal(calls(), 1);
    assert.equal((await api.outcome(request("/outcome", {
      commandId: randomUUID(), baseRevision: stored().revision, decision: "resolved",
    }), id)).status, 409);
  }
});

test("T016 simple end preserves unknown and suppresses a late model result", async () => {
  const gate = Promise.withResolvers<void>();
  const { api, id, request, turnCommand, stored } = setup({ waitForAnswer: gate.promise, responseWaitMs: 0 });
  try {
    assert.equal((await api.turn(request("/turns", turnCommand), id)).status, 202);
    assert.equal((await api.end(request("/end", { commandId: randomUUID(), baseRevision: stored().revision }), id)).status, 200);
  } finally {
    gate.resolve();
  }
  await delay(10);
  assert.equal(stored().state, "ended");
  assert.equal(stored().outcome, "unknown");
  assert.equal(stored().outcomeConfirmedAt, null);
  assert.equal(stored().transcript.length, 1);
  assert.equal(stored().pendingRequestId, null);
});

test("T016 asks for the disposal district without borrowing the residence district", async () => {
  const extracted = {
    ...intake,
    issues: [{ ...proposal, knownFields: [{ fieldKey: "residence.district", value: "마포구" }],
      missingFields: ["disposal.district"] }],
    proposedQuestion: { fieldKey: "disposal.district", text: "어느 자치구에 버리세요?" },
  };
  const { api, id, request, turnCommand, calls, stored } = setup({ extracted });
  const response = await api.turn(request("/turns", turnCommand), id);
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.utterances[0].text, "배출 장소는 어느 자치구인가요?");
  assert.deepEqual(data.cards, []);
  assert.equal(calls(), 1);
  assert.equal(stored().issues[0].jurisdiction, null);
  assert.equal(stored().issues[0].questionCounts["disposal.district"], 1);
});
