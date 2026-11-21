import { z } from "zod";

export const issueFieldSchema = z.strictObject({
  value: z.string().min(1).nullable(),
  status: z.enum(["known", "unknown", "declined"]),
  originTurnId: z.uuid(),
  confirmed: z.boolean(),
}).refine((field) => (field.status === "known") === (field.value !== null));

export const issueSchema = z.strictObject({
  id: z.uuid(), sessionId: z.uuid(), order: z.int().nonnegative(),
  citizenRequest: z.string().min(1),
  intent: z.enum(["문의", "민원접수", "상담사요청", "기타"]),
  category: z.string().min(1), jurisdiction: z.string().min(1).nullable(),
  fields: z.record(z.string().min(1), issueFieldSchema),
  locations: z.array(z.strictObject({
    purpose: z.enum(["residence", "disposal", "incident", "other"]),
    district: z.string().min(1).nullable(), originTurnId: z.uuid(), confirmed: z.boolean(),
  })),
  questionCounts: z.record(z.string().min(1), z.int().min(0).max(2)),
  lowConfidenceStreak: z.int().nonnegative(), noEvidenceQuestionCount: z.int().min(0).max(1),
  status: z.enum(["pending", "active", "advised", "unresolved"]),
  sourceChunkIds: z.array(z.string().min(1)), alreadyTold: z.array(z.string().min(1)),
  candidateIds: z.array(z.uuid()),
}).superRefine((issue, ctx) => {
  if (new Set(issue.locations.map((location) => location.purpose)).size !== issue.locations.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate location purpose" });
  }
});

export type Issue = z.infer<typeof issueSchema>;
export type IssueField = z.infer<typeof issueFieldSchema>;

export const issueCollectionSchema = z.array(issueSchema).superRefine((issues, ctx) => {
  if (new Set(issues.map((issue) => issue.id)).size !== issues.length ||
      new Set(issues.map((issue) => issue.order)).size !== issues.length ||
      new Set(issues.map((issue) => issue.sessionId)).size > 1 ||
      issues.filter((issue) => issue.status === "active").length > 1) {
    ctx.addIssue({ code: "custom", message: "Issues must be unique, in one session, with at most one active issue" });
  }
});
