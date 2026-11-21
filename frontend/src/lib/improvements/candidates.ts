import { randomUUID } from "node:crypto";

import { improvementCandidateSchema, type ImprovementCandidate } from "../schema/improvement";
import { getConsoleAgentId } from "../server/auth";
import type { ConsoleCommand } from "../server/console-actions";
import { noStoreJson } from "../server/limits";
import { createRequestContext } from "../server/request-log";
import { sessionError } from "../server/session-api";

type CompleteOutcome = NonNullable<Extract<ConsoleCommand, { action: "complete_case" }>["outcome"]>;

// ponytail: pattern-based redaction covers numbers and emails only; names and street addresses
// still need the human review step (T036) before anything leaves the protected store.
const PERSONAL_DATA: [RegExp, string][] = [
  [/(?<!\d)\d{6}\s*-\s*[1-4]\d{6}(?!\d)/g, "[주민번호]"],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[이메일]"],
  [/(?<!\d)0\d{1,2}[\s.-]?\d{3,4}[\s.-]?\d{4}(?!\d)/g, "[연락처]"],
  [/(?<!\d)\d(?:[\s-]?\d){9,}(?!\d)/g, "[번호]"], // account, card and other long identifiers
];

export function redactPersonalData(text: string): string {
  return PERSONAL_DATA.reduce((value, [pattern, label]) => value.replace(pattern, label), text);
}

export function containsPersonalData(text: string): boolean {
  return PERSONAL_DATA.some(([pattern]) => new RegExp(pattern.source).test(text));
}

/** A gap recorded at complete_case becomes an open candidate; the conversation itself is never copied. */
export function createImprovementCandidate(sessionId: string, outcome: CompleteOutcome): ImprovementCandidate | null {
  const gap = outcome.gapReason?.trim();
  if (!gap) return null;
  return improvementCandidateSchema.parse({
    id: randomUUID(),
    sessionId,
    gapReason: redactPersonalData(gap),
    // The console outcome carries no field or district; the reviewer sets them while verifying (T036).
    category: "미분류",
    jurisdiction: null,
    redactedResolution: redactPersonalData(outcome.resolutionNote ?? ""),
    proposedSourceUrls: outcome.proposedSourceUrls,
    status: "open",
    reviewer: null,
    approvedAt: null,
    publishedCorpusVersion: null,
    regressionResult: null,
  });
}

/** Records a candidate after complete_case commits. A replay records again; storage keeps one per session. */
export function withImprovementCandidates<Result>(
  apply: (sessionId: string, agent: string, command: ConsoleCommand) => Promise<Result>,
  record: (candidate: ImprovementCandidate) => Promise<unknown>,
) {
  return async (sessionId: string, agent: string, command: ConsoleCommand): Promise<Result> => {
    const result = await apply(sessionId, agent, command);
    const status = (result as { status?: string } | null)?.status;
    if (command.action === "complete_case" && command.outcome && (status === "committed" || status === "replayed")) {
      const candidate = createImprovementCandidate(sessionId, command.outcome);
      // A failure surfaces as 503; the client retries the same commandId, which replays and records again.
      if (candidate) await record(candidate);
    }
    return result;
  };
}

/** File export for data review: drops the session reference and refuses anything that still looks personal. */
export function exportCandidates(candidates: ImprovementCandidate[]): Omit<ImprovementCandidate, "sessionId">[] {
  return candidates.map((candidate) => {
    const { sessionId: _restricted, ...rest } = improvementCandidateSchema.parse(candidate);
    void _restricted;
    if (containsPersonalData(JSON.stringify(rest))) {
      throw new Error(`개선 후보 ${candidate.id}에 개인정보로 보이는 값이 있어 내보내기를 차단했다.`);
    }
    return rest;
  });
}

/** GET /api/console/improvements: console token only, no caching. */
export function createImprovementsApi(
  list: () => Promise<ImprovementCandidate[]>,
  config: Parameters<typeof getConsoleAgentId>[1],
) {
  return async (request: Request) => {
    const { requestId } = createRequestContext("console");
    if (!getConsoleAgentId(request.headers, config)) return sessionError(requestId, 401, "unauthorized");
    try {
      return noStoreJson({ schemaVersion: 1, requestId, data: await list() });
    } catch {
      return sessionError(requestId, 503, "storage_unavailable");
    }
  };
}
