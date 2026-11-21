import { z } from "zod";

export const fieldSchema = z.strictObject({
  fieldKey: z.string().min(1).max(160),
  value: z.string().min(1).max(300),
});
export const citationSchema = z.strictObject({
  chunkId: z.string().min(1), claimKey: z.string().min(1), quote: z.string().min(1),
});
const issueSchema = z.strictObject({
  localId: z.string().min(1), request: z.string().min(1),
  knownFields: z.array(fieldSchema), missingFields: z.array(z.string().min(1)),
  needsPersonalLookup: z.boolean(),
});
export const candidateSchema = z.strictObject({
  intent: z.enum(["문의", "민원접수", "상담사요청", "기타"]),
  category: z.string().min(1),
  sentiment: z.enum(["보통", "불만", "매우불만", "unknown"]),
  issues: z.array(issueSchema),
  proposedQuestion: z.strictObject({ fieldKey: z.string().min(1), text: z.string().min(1) }).nullable(),
  confidence: z.enum(["high", "low"]),
  answerUnits: z.array(z.strictObject({
    issueLocalId: z.string().min(1), text: z.string().min(1),
    citations: z.array(citationSchema).min(1),
  })),
  summaryProposal: z.strictObject({
    coreLines: z.array(z.string().min(1)).max(3),
    issueSummaries: z.array(z.strictObject({
      issueLocalId: z.string().min(1), text: z.string().min(1),
    })),
  }).nullable(),
  routingEvidence: z.array(citationSchema.extend({ issueLocalId: z.string().min(1) })),
}).superRefine((candidate, ctx) => {
  const ids = new Set(candidate.issues.map((issue) => issue.localId));
  if (ids.size !== candidate.issues.length) ctx.addIssue({ code: "custom", message: "Duplicate issue ID" });
  for (const issue of candidate.issues) {
    const known = issue.knownFields.map((field) => field.fieldKey);
    if (new Set(known).size !== known.length || known.some((key) => issue.missingFields.includes(key))) {
      ctx.addIssue({ code: "custom", message: "Conflicting issue fields" });
    }
  }
  const referenced = [
    ...candidate.answerUnits.map((unit) => unit.issueLocalId),
    ...candidate.routingEvidence.map((item) => item.issueLocalId),
    ...(candidate.summaryProposal?.issueSummaries.map((item) => item.issueLocalId) ?? []),
  ];
  if (referenced.some((id) => !ids.has(id))) ctx.addIssue({ code: "custom", message: "Unknown issue" });
  if (candidate.proposedQuestion &&
      !candidate.issues[0]?.missingFields.includes(candidate.proposedQuestion.fieldKey)) {
    ctx.addIssue({ code: "custom", message: "Question is not a missing field" });
  }
  if (candidate.intent === "상담사요청" && (candidate.proposedQuestion || candidate.answerUnits.length)) {
    ctx.addIssue({ code: "custom", message: "Human request cannot continue AI guidance" });
  }
});
export type DialogueCandidate = z.infer<typeof candidateSchema>;
