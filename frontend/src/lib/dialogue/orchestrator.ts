import type { Corpus } from "../retrieval/search";
import { search } from "../retrieval/search";
import { validateAnswerUnit } from "../retrieval/validate-evidence";
import type { Issue } from "../schema/issue";
import type { Session, Turn } from "../schema/session";
import { answer } from "./answer";
import { interpret, type DialogueContext } from "./interpret";
import { createIssues, finishIssue, updateIssueFields } from "./issues";
import type { ResponsesClient } from "./model-client";

export type DialogueSnapshot = Session & { issues: Issue[] };

const noEvidence = "확인할 수 있는 근거가 부족합니다.";
export const unavailable = "지금은 안내를 준비할 수 없습니다.";

const locationQuestions: Record<string, string> = {
  "disposal.district": "배출 장소는 어느 자치구인가요?",
  "incident.district": "발생 장소는 어느 자치구인가요?",
  "residence.district": "거주하시는 자치구는 어디인가요?",
};

type Guidance = { text: string; citations: Turn["factCitations"] };

export async function guideTurn(
  session: DialogueSnapshot, turn: Turn, corpus: Corpus, model: ResponsesClient, signal: AbortSignal,
): Promise<{ issues: Issue[]; activeIssueId: string | null; guidance: Guidance[] }> {
  const active = session.issues.find((issue) => issue.id === session.activeIssueId);
  const context: DialogueContext = {
    recentTurns: session.transcript.filter((item) => item.id !== turn.id && item.outputStatus === "committed")
      .slice(-8).flatMap(({ role, text }) => role === "system" ? [] : [{ role, text }]),
    knownFields: Object.entries(active?.fields ?? {}).flatMap(([fieldKey, field]) =>
      field.value === null ? [] : [{ fieldKey, value: field.value }]),
  };
  const intake = await interpret(model, turn.text, context, signal);
  const proposal = intake.issues[0];
  if (!proposal || intake.intent === "상담사요청" || (active && active.category !== intake.category)) {
    return { issues: session.issues, activeIssueId: session.activeIssueId,
      guidance: [{ text: noEvidence, citations: [] }] };
  }

  const created = createIssues(session.id, turn.id, intake);
  const proposals = created.issues.map((item, index) => {
    // A district omitted by intake must never be inherited across different issues.
    const fields = { ...item.fields };
    for (const fieldKey of intake.issues[index].missingFields) {
      if (fieldKey.endsWith(".district")) {
        fields[fieldKey] = { value: null, status: "unknown", originTurnId: turn.id, confirmed: false };
      }
    }
    return updateIssueFields({ ...item, fields: {}, locations: [] }, fields);
  });
  let issues = [...session.issues, ...proposals.map((issue) => ({
    ...issue, order: issue.order + session.issues.length,
  }))];
  let issue = issues[session.issues.length];
  if (active) {
    const changes = Object.fromEntries(Object.entries(issue.fields).filter(([key, field]) =>
      field.status === "known" || !active.fields[key]));
    issue = updateIssueFields(active, changes);
    issues = [...session.issues.map((existing) => existing.id === issue.id ? issue : existing),
      ...proposals.slice(1).map((item, index) => ({ ...item, order: session.issues.length + index }))];
  }
  // Ambiguous location purposes leave district-specific material ineligible.
  if (issue.locations.length === 1) {
    issue = updateIssueFields(issue, {}, issue.locations[0].purpose);
    issues = issues.map((item) => item.id === issue.id ? issue : item);
  }
  const unresolvedField = [...proposal.missingFields, ...Object.keys(issue.fields)]
    .find((key) => issue.fields[key]?.status !== "known");
  const question = intake.proposedQuestion;
  if (question && question.fieldKey === unresolvedField) {
    const count = Object.hasOwn(issue.questionCounts, question.fieldKey) ? issue.questionCounts[question.fieldKey] : 0;
    if (count >= 2) return { issues, activeIssueId: issue.id, guidance: [{ text: noEvidence, citations: [] }] };
    const questionCounts = { ...issue.questionCounts, [question.fieldKey]: count + 1 };
    return { issues: issues.map((item) => item.id === issue.id ? { ...issue, questionCounts } : item),
      activeIssueId: issue.id, guidance: [{ text: Object.hasOwn(locationQuestions, question.fieldKey) ? locationQuestions[question.fieldKey] : "안내에 필요한 정보를 조금 더 알려주시겠어요?",
        citations: [] }] };
  }

  const query = { text: issue.citizenRequest, district: issue.jurisdiction, businessDate: session.businessDate };
  const result = corpus.corpusVersion === session.corpusVersion && !unresolvedField && !proposal.needsPersonalLookup
    ? search(corpus, query) : null;
  const evidence = result?.hits.flatMap((hit) => hit.evidence.filter((item) => item.answerEligible)
    .map(({ chunkId, claimKey, quote, answerEligible, routingEligible }) =>
      ({ chunkId, claimKey, quote, answerEligible, routingEligible }))) ?? [];
  const candidate = evidence.length ? await answer(model, turn.text, context, evidence, signal) : null;
  const guide = candidate?.confidence === "high" && candidate.intent === intake.intent &&
    candidate.issues.some((item) => item.localId === proposal.localId && !item.needsPersonalLookup)
    ? candidate.answerUnits.filter((unit) => unit.issueLocalId === proposal.localId) : [];
  const units = guide.slice(0, 3).flatMap((unit): Guidance[] => {
    // Bounded mode only publishes the full verified quote. A paraphrase needs a separate entailment check.
    if (!unit.citations.some(({ quote }) => quote.trim() === unit.text.trim()) ||
        unit.text.length > 500 || unit.text.split(/[.!?。！？](?=\s|$)|\n/).filter((part) => part.trim()).length > 2 ||
        !validateAnswerUnit(corpus, unit, query).ok) return [];
    const citations = unit.citations.flatMap((citation) => {
      const hit = result?.hits.find(({ chunkId }) => chunkId === citation.chunkId);
      const source = hit?.evidence.find(({ claimKey, quote }) =>
        claimKey === citation.claimKey && quote === citation.quote);
      return hit && source ? [{ ...citation, sourceUrl: hit.sourceUrl,
        basisDate: source.basisDate, basisDateType: source.basisDateType }] : [];
    });
    return [{ text: unit.text, citations }];
  });
  if (!units.length || units.length !== guide.length) {
    return { issues, activeIssueId: issue.id, guidance: [{ text: noEvidence, citations: [] }] };
  }

  const advised = { ...issue, alreadyTold: [...issue.alreadyTold, ...units.map(({ text }) => text)],
    sourceChunkIds: [...new Set(units.flatMap(({ citations }) => citations.map(({ chunkId }) => chunkId)))] };
  return { ...finishIssue(issues.map((item) => item.id === issue.id ? advised : item), issue.id, "advised"),
    guidance: units };
}
