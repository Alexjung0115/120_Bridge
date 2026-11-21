import { z } from "zod";

const timestampSchema = z.iso.datetime({ offset: true });

// data-model.md ImprovementCandidate. Status moves open → verified → approved → published, or rejected.
export const improvementCandidateSchema = z.strictObject({
  id: z.uuid(),
  sessionId: z.uuid(), // restricted reference: console API only, never exported
  gapReason: z.string().trim().min(1).max(2_000),
  category: z.string().trim().min(1),
  jurisdiction: z.string().trim().min(1).nullable(),
  redactedResolution: z.string().max(2_000),
  proposedSourceUrls: z.array(z.url({ protocol: /^https?$/ })),
  status: z.enum(["open", "verified", "approved", "published", "rejected"]),
  reviewer: z.string().trim().min(1).nullable(),
  approvedAt: timestampSchema.nullable(),
  publishedCorpusVersion: z.string().trim().min(1).nullable(),
  regressionResult: z.strictObject({ passed: z.boolean(), checkedAt: timestampSchema }).nullable(),
}).superRefine((candidate, context) => {
  const approved = candidate.status === "approved" || candidate.status === "published";
  if (approved && (!candidate.reviewer || !candidate.approvedAt)) {
    context.addIssue({ code: "custom", path: ["approvedAt"], message: "Approval needs a reviewer and approvedAt." });
  }
  // Published only with approval AND a passing regression (data-model.md).
  if (candidate.status === "published" && (!candidate.publishedCorpusVersion || candidate.regressionResult?.passed !== true)) {
    context.addIssue({ code: "custom", path: ["regressionResult"], message: "Publishing needs a corpus version and a passing regression." });
  }
  if (candidate.status !== "published" && candidate.publishedCorpusVersion !== null) {
    context.addIssue({ code: "custom", path: ["publishedCorpusVersion"], message: "Only published candidates have a corpus version." });
  }
});

export type ImprovementCandidate = z.infer<typeof improvementCandidateSchema>;
