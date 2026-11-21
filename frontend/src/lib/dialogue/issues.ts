import { randomUUID } from "node:crypto";
import { candidateSchema, type DialogueCandidate } from "./candidate-schema.ts";
import { issueCollectionSchema, issueSchema, type Issue, type IssueField } from "../schema/issue.ts";

export function selectActiveIssue(input: Issue[]) {
  const issues = issueCollectionSchema.parse(input).sort((a, b) => a.order - b.order);
  const active = issues.find((issue) => issue.status === "active") ??
    issues.find((issue) => issue.status === "pending");
  return {
    issues: issues.map((issue) => issue.id === active?.id ? { ...issue, status: "active" as const } : issue),
    activeIssueId: active?.id ?? null,
  };
}

export function createIssues(
  sessionId: string, originTurnId: string, input: DialogueCandidate,
  knownFields: Record<string, IssueField> = {},
) {
  const candidate = candidateSchema.parse(input);
  const availableFields = { ...knownFields };
  const issues = candidate.issues.map((proposal, order) => {
    const fields: Record<string, IssueField> = {};
    for (const fieldKey of proposal.missingFields) {
      fields[fieldKey] = availableFields[fieldKey] ?? { value: null, status: "unknown", originTurnId, confirmed: false };
    }
    for (const field of proposal.knownFields) {
      const previous = availableFields[field.fieldKey];
      fields[field.fieldKey] = previous?.value === field.value ? previous :
        { value: field.value, status: "known", originTurnId, confirmed: false };
    }
    Object.assign(availableFields, fields);
    return issueSchema.parse({
      id: randomUUID(), sessionId, order, citizenRequest: proposal.request,
      intent: candidate.intent, category: candidate.category, jurisdiction: null,
      fields, locations: [], questionCounts: {}, lowConfidenceStreak: 0,
      noEvidenceQuestionCount: 0, status: "pending", sourceChunkIds: [], alreadyTold: [], candidateIds: [],
    });
  });
  return {
    ...selectActiveIssue(issues.map((issue) => updateIssueFields(issue, issue.fields))),
    issueIdsByLocalId: Object.fromEntries(candidate.issues.map((proposal, index) => [proposal.localId, issues[index].id])),
  };
}

export function updateIssueFields(input: Issue, changes: Record<string, IssueField>, purpose?: Issue["locations"][number]["purpose"]) {
  const issue = issueSchema.parse(input);
  const fields = { ...issue.fields, ...changes };
  const locations = issue.locations.map((location) => ({ ...location }));
  let locationChanged = false;
  for (const locationPurpose of ["residence", "disposal", "incident", "other"] as const) {
    const key = `${locationPurpose}.district`;
    const field = fields[key];
    if (!field) continue;
    const location = { purpose: locationPurpose, district: field.value, originTurnId: field.originTurnId, confirmed: field.confirmed };
    const index = locations.findIndex((item) => item.purpose === locationPurpose);
    locationChanged ||= locations[index]?.district !== field.value;
    if (index < 0) locations.push(location);
    else locations[index] = location;
  }
  return issueSchema.parse({
    ...issue, fields, locations,
    jurisdiction: purpose ? locations.find((location) => location.purpose === purpose)?.district ?? null :
      locationChanged ? null : issue.jurisdiction,
    sourceChunkIds: locationChanged ? [] : issue.sourceChunkIds,
    candidateIds: locationChanged ? [] : issue.candidateIds,
  });
}

export function finishIssue(input: Issue[], issueId: string, status: "advised" | "unresolved") {
  const issues = issueCollectionSchema.parse(input);
  if (!issues.some((issue) => issue.id === issueId && issue.status === "active")) {
    throw new Error("Only the active issue can finish");
  }
  return selectActiveIssue(issues.map((issue) => issue.id === issueId ? { ...issue, status } : issue));
}

export function handoffIssues(input: Issue[]) {
  const issues = issueCollectionSchema.parse(input);
  return {
    resolvedContextIds: issues.filter((issue) => issue.status === "advised").map((issue) => issue.id),
    unresolvedIssueIds: issues.filter((issue) => issue.status !== "advised").map((issue) => issue.id),
  };
}
