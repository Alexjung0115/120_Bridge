import assert from "node:assert/strict";
import { test } from "node:test";

import {
  apiErrorEnvelopeSchema,
  commandEnvelopeSchema,
  consultationLimits,
  createSessionRequestSchema,
  successEnvelopeSchema,
  turnRequestSchema,
} from "../../src/lib/contracts";
import { sessionSchema, turnSchema } from "../../src/lib/schema/session";

const sessionId = "10000000-0000-4000-8000-000000000001";
const commandId = "10000000-0000-4000-8000-000000000002";
const timestamp = "2026-11-21T12:00:00+09:00";
const command = { commandId, baseRevision: 0 };
const turn = {
  id: commandId,
  sessionId,
  sequence: 1,
  role: "citizen",
  inputMode: "text",
  text: "냉장고를 버리고 싶어요",
  timestamp,
  issueIds: [],
  outputStatus: "committed",
  factCitations: [],
};
const session = {
  id: sessionId,
  revision: 0,
  createdAt: timestamp,
  updatedAt: timestamp,
  citizenTokenHash: "test-hash",
  state: "active",
  activeIssueId: null,
  issueIds: [],
  transcript: [turn],
  handoffId: null,
  pendingRequestId: null,
  corpusVersion: "demo",
  businessDate: "2026-11-21",
  outcome: "unknown",
  outcomeConfirmedAt: null,
};

test("commands require a UUID and an integer revision without coercion", () => {
  assert.deepEqual(commandEnvelopeSchema.parse(command), command);
  assert.ok(commandEnvelopeSchema.safeParse({ ...command, baseRevision: Number.MAX_SAFE_INTEGER }).success);
  for (const baseRevision of [-1, 0.5, "0", Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(commandEnvelopeSchema.safeParse({ ...command, baseRevision }).success, false);
  }
  assert.equal(commandEnvelopeSchema.safeParse({ ...command, commandId: "bad" }).success, false);
  assert.equal(commandEnvelopeSchema.safeParse({ ...command, revision: 0 }).success, false);
});

test("session creation accepts both input channels and rejects a blank key", () => {
  for (const inputMode of ["text", "voice"]) {
    assert.ok(createSessionRequestSchema.safeParse({ clientSessionKey: "retry-key", inputMode }).success);
  }
  assert.equal(createSessionRequestSchema.safeParse({ clientSessionKey: " ", inputMode: "text" }).success, false);
  assert.equal(createSessionRequestSchema.safeParse({ clientSessionKey: "key", inputMode: "button" }).success, false);
});

test("turn input preserves original text and enforces code point boundaries", () => {
  const input = { ...command, inputMode: "text", text: " 냉장고 " };
  assert.equal(turnRequestSchema.parse(input).text, input.text);
  assert.ok(turnRequestSchema.safeParse({ ...input, text: "가" }).success);
  const upperLimit = "😀".repeat(consultationLimits.turnCharacters);
  assert.ok(turnRequestSchema.safeParse({ ...input, text: upperLimit }).success);
  for (const text of ["", " \n", upperLimit + "😀"]) {
    assert.equal(turnRequestSchema.safeParse({ ...input, text }).success, false);
  }
  assert.equal(turnRequestSchema.safeParse({ ...input, inputMode: "key" }).success, false);
});

test("stored sessions validate dates, IDs and internal state fields", () => {
  assert.deepEqual(sessionSchema.parse(session), session);
  for (const change of [
    { state: "waiting" },
    { outcome: "resolved" },
    { activeIssueId: "" },
    { pendingRequestId: "not-an-id" },
    { businessDate: "2026-02-29" },
    { createdAt: "2026-11-21" },
    { updatedAt: "2026-11-21T12:00:00" },
    { outcomeConfirmedAt: "yesterday" },
    { citizenToken: "test-token" },
  ]) {
    assert.equal(sessionSchema.safeParse({ ...session, ...change }).success, false);
  }
  const history = Array.from({ length: consultationLimits.turnsPerSession }, (_, index) => ({
    ...turn,
    id: `10000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
    sequence: index + 1,
  }));
  assert.ok(sessionSchema.safeParse({ ...session, transcript: history }).success);
  assert.equal(sessionSchema.safeParse({ ...session, transcript: [...history, turn] }).success, false);
});

test("stored turns allow command modes and preserve discarded output", () => {
  assert.ok(turnSchema.safeParse({ ...turn, inputMode: "key", outputStatus: "discarded" }).success);
  for (const change of [{ role: "model" }, { outputStatus: "ready" }, { sequence: -1 }]) {
    assert.equal(turnSchema.safeParse({ ...turn, ...change }).success, false);
  }
});

test("API envelopes validate versions, errors and revision metadata", () => {
  const header = { schemaVersion: 1, requestId: commandId };
  const error = { code: "stale_revision", message: "Try again.", retryable: true };
  assert.ok(successEnvelopeSchema.safeParse({ ...header, data: null }).success);
  assert.equal(successEnvelopeSchema.safeParse(header).success, false);
  assert.equal(successEnvelopeSchema.safeParse({ ...header, data: undefined }).success, false);
  assert.equal(successEnvelopeSchema.safeParse({ ...header, data: { count: Infinity } }).success, false);
  assert.deepEqual(JSON.parse(JSON.stringify(successEnvelopeSchema.parse({ ...header, data: null }))), { ...header, data: null });
  assert.ok(apiErrorEnvelopeSchema.safeParse({ ...header, error, currentRevision: 0 }).success);
  assert.ok(apiErrorEnvelopeSchema.safeParse({ ...header, error }).success);
  assert.equal(apiErrorEnvelopeSchema.safeParse({ ...header, error, schemaVersion: 2 }).success, false);
  assert.equal(apiErrorEnvelopeSchema.safeParse({ ...header, error, currentRevision: -1 }).success, false);
  assert.equal(apiErrorEnvelopeSchema.safeParse({ ...header, error: { ...error, retryable: "yes" } }).success, false);
});

test("session rejects foreign turns and duplicate IDs or sequences", () => {
  const secondId = "10000000-0000-4000-8000-000000000003";
  for (const transcript of [
    [{ ...turn, sessionId: secondId }],
    [turn, { ...turn, sequence: 2 }],
    [turn, { ...turn, id: secondId }],
  ]) {
    assert.equal(sessionSchema.safeParse({ ...session, transcript }).success, false);
  }
  assert.ok(sessionSchema.safeParse({ ...session, transcript: [turn, { ...turn, id: secondId, sequence: 2 }] }).success);
});

test("citizen speech and text remain bounded when loaded from storage", () => {
  assert.equal(turnSchema.safeParse({ ...turn, text: "가".repeat(consultationLimits.turnCharacters + 1) }).success, false);
  assert.equal(turnSchema.safeParse({ ...turn, inputMode: "voice", text: " " }).success, false);
  assert.ok(turnSchema.safeParse({ ...turn, inputMode: "button", text: "" }).success);
  assert.ok(turnSchema.safeParse({ ...turn, role: "assistant", text: "", outputStatus: "pending" }).success);
});

test("stored fact citations retain valid source and date metadata", () => {
  const citation = {
    chunkId: "chunk-1",
    claimKey: "claim-1",
    quote: "가상 출처 발췌",
    sourceUrl: "https://example.org/policy",
    basisDate: "2024-02-29",
    basisDateType: "effective",
  };
  assert.ok(turnSchema.safeParse({ ...turn, factCitations: [citation] }).success);
  assert.ok(turnSchema.safeParse({ ...turn, factCitations: [{ ...citation, basisDate: null }] }).success);
  for (const invalid of [{ sourceUrl: "javascript:alert(1)" }, { basisDate: "2026-02-29" }, { claimKey: "" }]) {
    assert.equal(turnSchema.safeParse({ ...turn, factCitations: [{ ...citation, ...invalid }] }).success, false);
  }
});