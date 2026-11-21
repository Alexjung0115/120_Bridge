import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { answer } from "../../src/lib/dialogue/answer.ts";
import { interpret } from "../../src/lib/dialogue/interpret.ts";
import { InvalidModelOutput, ResponsesClient } from "../../src/lib/dialogue/model-client.ts";

const cases = JSON.parse(readFileSync(
  new URL("../fixtures/temporary-ai-contract.json", import.meta.url), "utf8",
)).cases;
const grounded = cases[0];
const personal = cases[1];

function clientWith(candidate: unknown, onInput?: (input: Record<string, unknown>) => void) {
  return new ResponsesClient("https://example.invalid", "test", "test", async (_url, options) => {
    const payload = JSON.parse(String(options?.body));
    onInput?.(JSON.parse(payload.input));
    return new Response(JSON.stringify({
      status: "completed",
      output: [{ type: "message", content: [
        { type: "output_text", text: JSON.stringify(candidate) },
      ] }],
    }));
  });
}

test("extracts a personal lookup without answering from memory", async () => {
  const result = await interpret(
    clientWith(personal.sampleCandidate),
    personal.request.text,
    { recentTurns: personal.request.recentTurns, knownFields: personal.request.knownFields },
  );
  assert.equal(result.issues[0].needsPersonalLookup, true);
  assert.deepEqual(result.answerUnits, []);
});

test("keeps two independent requests in order and defers the second question", async () => {
  const second = {
    ...personal.sampleCandidate.issues[0],
    localId: "issue-2",
    missingFields: ["residence.district"],
  };
  const candidate = {
    ...grounded.sampleCandidate,
    issues: [grounded.sampleCandidate.issues[0], second],
    answerUnits: [],
    proposedQuestion: null,
  };
  const context = { recentTurns: [], knownFields: grounded.request.knownFields };
  const result = await interpret(clientWith(candidate), "냉장고와 수도요금 문의", context);
  assert.deepEqual(result.issues.map((issue) => issue.localId), ["issue-1", "issue-2"]);
  await assert.rejects(
    interpret(clientWith({
      ...candidate,
      proposedQuestion: { fieldKey: "residence.district", text: "거주지를 알려주세요." },
    }), "냉장고와 수도요금 문의", context),
    InvalidModelOutput,
  );
});

test("keeps known district and evidence in the model input", async () => {
  let supplied: Record<string, unknown> | undefined;
  const result = await answer(
    clientWith(grounded.sampleCandidate, (input) => { supplied = input; }),
    grounded.request.text,
    { recentTurns: grounded.request.recentTurns, knownFields: grounded.request.knownFields },
    grounded.evidence.map((item: { excerpt: unknown }) => item.excerpt),
  );
  assert.equal(result.answerUnits[0].issueLocalId, "issue-1");
  assert.deepEqual(supplied?.knownFields, grounded.request.knownFields);
  assert.deepEqual(supplied?.evidence, grounded.evidence.map((item: { excerpt: unknown }) => item.excerpt));
});

test("rejects an invented or ineligible citation", async () => {
  const context = { recentTurns: grounded.request.recentTurns, knownFields: grounded.request.knownFields };
  await assert.rejects(
    answer(clientWith(grounded.sampleCandidate), grounded.request.text, context, []),
    InvalidModelOutput,
  );
  await assert.rejects(
    answer(clientWith(grounded.sampleCandidate), grounded.request.text, context,
      grounded.evidence.map((item: { excerpt: object }) => ({ ...item.excerpt, answerEligible: false }))),
    InvalidModelOutput,
  );
});

test("allows a general answer while personal lookup remains unresolved", async () => {
  const candidate = {
    ...grounded.sampleCandidate,
    issues: [{ ...grounded.sampleCandidate.issues[0], needsPersonalLookup: true }],
  };
  const result = await answer(clientWith(candidate), grounded.request.text,
    { recentTurns: grounded.request.recentTurns, knownFields: grounded.request.knownFields },
    grounded.evidence.map((item: { excerpt: unknown }) => item.excerpt));
  assert.equal(result.issues[0].needsPersonalLookup, true);
  assert.equal(result.answerUnits.length, 1);
});
