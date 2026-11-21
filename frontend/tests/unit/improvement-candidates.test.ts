import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import {
  containsPersonalData,
  createImprovementCandidate,
  createImprovementsApi,
  exportCandidates,
  redactPersonalData,
  withImprovementCandidates,
} from "../../src/lib/improvements/candidates";
import { improvementCandidateSchema, type ImprovementCandidate } from "../../src/lib/schema/improvement";

const sessionId = randomUUID();
const outcome = {
  resolutionNote: "김민수님(010-1234-5678, minsu@example.com) 주민번호 900101-1234567 확인 후 마포구 폐가전 무상수거 안내",
  repeatExplanationCount: 0,
  gapReason: "폐가전 무상수거 기준이 자료에 없음. 회신 번호 02 123 4567",
  proposedSourceUrls: ["https://www.mapo.go.kr/site/main/content/mapo04010301"],
};

test("redacts phone numbers, emails, resident numbers and long digit runs", () => {
  const text = redactPersonalData(outcome.resolutionNote);
  assert.ok(!/010-1234-5678|minsu@example\.com|900101-1234567/.test(text));
  assert.equal(containsPersonalData(text), false);
  assert.equal(containsPersonalData(redactPersonalData("계좌 110-123-456789 카드 1234 5678 9012 3456")), false);
  assert.ok(text.includes("마포구 폐가전 무상수거 안내"), "keeps the non-personal resolution");
  assert.equal(redactPersonalData("대형폐기물 수수료 8,000원, 2026-11-21 기준"), "대형폐기물 수수료 8,000원, 2026-11-21 기준");
});

test("creates an open, redacted candidate only when the agent recorded a gap", () => {
  const candidate = createImprovementCandidate(sessionId, outcome)!;
  improvementCandidateSchema.parse(candidate);
  assert.equal(candidate.sessionId, sessionId);
  assert.equal(candidate.status, "open");
  assert.equal(candidate.reviewer, null);
  assert.equal(candidate.publishedCorpusVersion, null);
  assert.equal(containsPersonalData(candidate.redactedResolution + candidate.gapReason), false);
  assert.deepEqual(candidate.proposedSourceUrls, outcome.proposedSourceUrls);
  assert.equal(createImprovementCandidate(sessionId, { ...outcome, gapReason: null }), null);
  assert.equal(createImprovementCandidate(sessionId, { ...outcome, gapReason: "  " }), null);
});

test("publishing requires approval and a passing regression", () => {
  const open = createImprovementCandidate(sessionId, outcome)!;
  const approved = { ...open, status: "approved", reviewer: "ai2-reviewer", approvedAt: "2026-11-21T09:00:00+09:00" };
  assert.ok(improvementCandidateSchema.safeParse(approved).success);
  assert.ok(!improvementCandidateSchema.safeParse({ ...open, status: "approved" }).success);
  const published = { ...approved, status: "published", publishedCorpusVersion: "corpus-abc123" };
  assert.ok(!improvementCandidateSchema.safeParse(published).success, "no regression result");
  assert.ok(!improvementCandidateSchema.safeParse({ ...published, regressionResult: { passed: false, checkedAt: "2026-11-21T10:00:00+09:00" } }).success);
  assert.ok(improvementCandidateSchema.safeParse({ ...published, regressionResult: { passed: true, checkedAt: "2026-11-21T10:00:00+09:00" } }).success);
});

test("export drops the session reference and blocks personal data", () => {
  const candidate = createImprovementCandidate(sessionId, outcome)!;
  const [exported] = exportCandidates([candidate]);
  assert.equal("sessionId" in exported, false);
  assert.equal(exported.id, candidate.id);
  const leaked: ImprovementCandidate = { ...candidate, redactedResolution: "연락처 010-9999-8888" };
  assert.throws(() => exportCandidates([leaked]), /개인정보/);
});

test("records a candidate after complete_case commits or replays, and only then", async () => {
  const recorded: ImprovementCandidate[] = [];
  const complete = { commandId: randomUUID(), baseRevision: 3, action: "complete_case" as const, outcome };
  const apply = withImprovementCandidates(
    async (_session, _agent, command) => ({ status: command.baseRevision === 3 ? "committed" : "conflict", data: {} }),
    async (candidate) => { recorded.push(candidate); },
  );
  await apply(sessionId, "demo-agent-1", complete);
  await apply(sessionId, "demo-agent-1", { ...complete, baseRevision: 2 });
  await apply(sessionId, "demo-agent-1", { commandId: randomUUID(), baseRevision: 3, action: "claim" });
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].sessionId, sessionId);
});

test("the improvements list requires the console token", async () => {
  const config = { CONSOLE_TOKEN: "console-secret", CONSOLE_AGENT_ID: "demo-agent-1" };
  const candidate = createImprovementCandidate(sessionId, outcome)!;
  const api = createImprovementsApi(async () => [candidate], config);
  const denied = await api(new Request("http://localhost/api/console/improvements"));
  assert.equal(denied.status, 401);
  const citizen = await api(new Request("http://localhost/api/console/improvements", { headers: { Authorization: "Bearer cit_abc" } }));
  assert.equal(citizen.status, 401);
  const ok = await api(new Request("http://localhost/api/console/improvements", { headers: { Authorization: "Bearer console-secret" } }));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("Cache-Control"), "no-store");
  assert.deepEqual((await ok.json()).data, [candidate]);
  const failing = createImprovementsApi(async () => { throw new Error("down"); }, config);
  assert.equal((await failing(new Request("http://localhost/x", { headers: { Authorization: "Bearer console-secret" } }))).status, 503);
});
