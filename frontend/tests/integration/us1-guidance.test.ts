import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { z } from "zod";

const caseSchema = z.object({
  id: z.string(), group: z.enum(["new-grounded", "variation", "no-evidence"]),
  criteria: z.array(z.string()).optional(), turns: z.array(z.string().min(1)).min(1),
  coverage: z.object({ unavailableDomain: z.string(), district: z.string() }).optional(),
  expected: z.object({
    action: z.enum(["answer", "no_evidence", "needs_personal_lookup", "refresh_retrieval"]),
    documents: z.array(z.string()).optional(), district: z.string().optional(), fieldKey: z.string().optional(),
    mustInclude: z.array(z.string()).optional(), mustNotAsk: z.array(z.string()).optional(),
    forbiddenPatterns: z.array(z.string()), states: z.array(z.string()).min(1),
    forbidFactCards: z.boolean().optional(), invalidatePreviousEvidence: z.boolean().optional(),
  }),
});
const fixtureText = readFileSync(new URL("../fixtures/generalization.json", import.meta.url), "utf8");
const fixture = z.object({ businessDate: z.string(), sourceReview: z.string(), cases: z.array(caseSchema) })
  .parse(JSON.parse(fixtureText));
type EvaluationCase = z.infer<typeof caseSchema>;

const citationSchema = z.object({ chunkId: z.string().min(1), claimKey: z.string().min(1),
  quote: z.string().min(1), sourceUrl: z.url() });
const snapshotSchema = z.object({
  revision: z.number().int().nonnegative(), state: z.string(), processing: z.boolean().optional(),
  utterances: z.array(z.object({ text: z.string().min(1), fieldKey: z.string().optional() })).min(1),
  cards: z.array(z.object({ type: z.enum(["evidence", "information", "summary"]),
    citations: z.array(citationSchema).optional() })),
  issues: z.array(z.object({
    citizenRequest: z.string().min(1), jurisdiction: z.string().nullable(),
    fields: z.record(z.string(), z.object({ value: z.string().nullable() })),
    needsPersonalLookup: z.boolean().optional(),
  })).min(1),
});
type Snapshot = z.infer<typeof snapshotSchema>;

function sourceDocument(path: string) {
  const text = readFileSync(new URL(`../../../rag-data/${path}`, import.meta.url), "utf8");
  const sourceUrl = text.match(/^source_url:\s*(.+)$/m)?.[1].trim();
  assert.ok(sourceUrl, `Missing source URL in ${path}`);
  return { text, sourceUrl };
}

export function assertGuidance(scenario: EvaluationCase, payload: unknown) {
  const snapshot = snapshotSchema.parse(payload);
  assert.equal(snapshot.processing ?? false, false, "Guidance must finish processing");
  assert.ok(scenario.expected.states.includes(snapshot.state), `${scenario.id}: unexpected state ${snapshot.state}`);
  const speech = snapshot.utterances.map((item) => item.text).join("\n");
  for (const required of scenario.expected.mustInclude ?? []) assert.ok(speech.includes(required), `Missing ${required}`);
  for (const pattern of scenario.expected.forbiddenPatterns) assert.doesNotMatch(speech, new RegExp(pattern, "u"));
  for (const fieldKey of scenario.expected.mustNotAsk ?? []) {
    assert.ok(!snapshot.utterances.some((item) => item.fieldKey === fieldKey), `Repeated known field ${fieldKey}`);
  }
  if (scenario.expected.mustNotAsk?.length) {
    assert.doesNotMatch(speech, /(어느|어떤|어디).{0,12}(자치구|지역|구인가|구에)|자치구.{0,12}(알려|말씀)/u);
  }
  if (scenario.expected.fieldKey) {
    const key = scenario.expected.fieldKey;
    assert.ok(snapshot.issues.some((issue) => issue.fields[key]?.value === scenario.expected.district &&
      issue.jurisdiction === scenario.expected.district), "Purpose-specific district was lost");
  }
  const evidenceCards = snapshot.cards.filter((card) => card.type === "evidence");
  const citations = evidenceCards.flatMap((card) => card.citations ?? []);
  for (const card of evidenceCards) assert.ok(card.citations?.length, "Fact card without citations");
  if (scenario.expected.forbidFactCards) {
    assert.equal(evidenceCards.length, 0, "Unsupported factual guidance");
    assert.match(speech, /근거|자료|확인|상담사|조회/u, "Missing evidence-gap or lookup explanation");
  }
  if (scenario.expected.action === "answer") {
    assert.ok(citations.length, "Grounded answer requires citations");
    const documents = (scenario.expected.documents ?? []).map(sourceDocument);
    for (const citation of citations) {
      assert.ok(documents.some((doc) => doc.sourceUrl === citation.sourceUrl && doc.text.includes(citation.quote)),
        "Citation must quote an expected source document");
    }
  }
  if (scenario.expected.action === "needs_personal_lookup") {
    assert.match(speech, /상담사|개인.{0,12}조회|직접.{0,8}확인|조회.{0,8}(어렵|불가|없)/u);
  }
  return snapshot;
}

test("SC-013/015/025 evaluation set retains 15 cases and six unavailable-area samples", () => {
  console.info(`fixtureSha256=${createHash("sha256").update(fixtureText).digest("hex")}`);
  assert.equal(new Set(fixture.cases.map((scenario) => scenario.id)).size, 15);
  for (const group of ["new-grounded", "variation", "no-evidence"]) {
    assert.equal(fixture.cases.filter((scenario) => scenario.group === group).length, 5);
  }
  const outside = fixture.cases.filter((scenario) => scenario.criteria?.includes("SC-015"));
  assert.equal(outside.length, 6);
  assert.ok(outside.every((scenario) => scenario.coverage && scenario.expected.forbidFactCards));
  assert.ok(new Set(outside.map((scenario) => scenario.coverage!.unavailableDomain)).size >= 3);
  assert.ok(new Set(outside.map((scenario) => scenario.coverage!.district)).size >= 3);
  assert.equal(fixture.cases.filter((scenario) => scenario.criteria?.includes("SC-025")).length, 5);
  for (const scenario of fixture.cases) {
    for (const path of scenario.expected.documents ?? []) sourceDocument(path);
    for (const pattern of scenario.expected.forbiddenPatterns) new RegExp(pattern, "u");
  }
});

function emptySnapshot(): Snapshot {
  return { revision: 1, state: "active", processing: false, utterances: [{ text: "상담사에게 확인을 요청할 수 있습니다." }],
    cards: [], issues: [{ citizenRequest: "개인 조회 요청", jurisdiction: null, fields: {} }] };
}

test("evaluator catches fabricated lookup results, unsupported evidence and repeated questions", () => {
  const personal = fixture.cases.find((scenario) => scenario.id === "N02")!;
  assertGuidance(personal, emptySnapshot());
  assert.throws(() => assertGuidance(personal, { ...emptySnapshot(), utterances: [{ text: "선정되었습니다" }] }));
  assert.throws(() => assertGuidance(personal, { ...emptySnapshot(), cards: [{ type: "evidence", citations: [] }] }));
  const grounded = fixture.cases.find((scenario) => scenario.id === "G01")!;
  assert.throws(() => assertGuidance(grounded, emptySnapshot()));
  const known = fixture.cases.find((scenario) => scenario.id === "V01")!;
  assert.throws(() => assertGuidance(known, { ...emptySnapshot(), utterances: [{ text: "어느 자치구인가요?" }] }));
});

const apiBase = process.env.BRIDGE_US1_API_BASE;
async function request(path: string, token?: string, body?: unknown) {
  const response = await fetch(`${apiBase}${path}`, {
    method: body ? "POST" : "GET", redirect: "error",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000),
  });
  assert.ok([200, 202].includes(response.status), `API ${path} returned ${response.status}`);
  const envelope = z.object({ schemaVersion: z.literal(1), requestId: z.string(), data: z.unknown() })
    .parse(await response.json());
  return envelope.data;
}

for (const scenario of fixture.cases) {
  test(`live ${scenario.id}: ${scenario.expected.action}`, {
    skip: !apiBase ? "BRIDGE_US1_API_BASE is unset; T014/T016 integration required" : false,
    timeout: 180_000,
  }, async () => {
    if (scenario.expected.action === "answer") {
      assert.equal(fixture.sourceReview, "verified", "AI1 must review expected evidence before live acceptance");
    }
    const session = z.object({ sessionId: z.uuid(), citizenToken: z.string().min(1), revision: z.number().int() })
      .parse(await request("/sessions", undefined, { clientSessionKey: randomUUID(), inputMode: "text" }));
    let revision = session.revision;
    let snapshot: unknown;
    for (const text of scenario.turns) {
      snapshot = await request(`/sessions/${session.sessionId}/turns`, session.citizenToken, {
        commandId: randomUUID(), baseRevision: revision, text, inputMode: "text",
      });
      for (let poll = 0; z.object({ processing: z.boolean().optional() }).parse(snapshot).processing; poll++) {
        assert.ok(poll < 30, "Session processing timed out");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        snapshot = await request(`/sessions/${session.sessionId}`, session.citizenToken);
      }
      revision = z.object({ revision: z.number().int() }).parse(snapshot).revision;
    }
    assertGuidance(scenario, snapshot);
    console.info(`${scenario.id} fixtureSha256=${createHash("sha256").update(fixtureText).digest("hex")}`);
  });
}
