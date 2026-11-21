import { z } from "zod";

export const summarySchema = z.strictObject({
  id: z.uuid(), revision: z.int().nonnegative(), sessionRevision: z.int().nonnegative(),
  coreLines: z.array(z.string().min(1)).max(3),
  issueSummaries: z.array(z.strictObject({ issueId: z.uuid(), text: z.string().min(1) })),
  alreadyTold: z.array(z.string().min(1)), missingFields: z.array(z.string().min(1)),
  reason: z.string().min(1), sentiment: z.enum(["보통", "불만", "매우불만", "unknown"]),
  sentimentIsEstimate: z.literal(true), confirmation: z.enum(["pending", "confirmed", "unconfirmed"]),
  confirmedAt: z.iso.datetime({ offset: true }).nullable(), skipReason: z.string().min(1).nullable(),
  fieldConfirmations: z.array(z.strictObject({
    fieldKey: z.string().min(1), status: z.enum(["confirmed", "unconfirmed"]), value: z.string().nullable(),
  })),
}).superRefine((summary, ctx) => {
  const keys = summary.fieldConfirmations.map((field) => field.fieldKey);
  const ids = summary.issueSummaries.map((issue) => issue.issueId);
  if (new Set(keys).size !== keys.length || new Set(ids).size !== ids.length ||
      (summary.confirmation === "confirmed") !== (summary.confirmedAt !== null) ||
      (summary.confirmation === "unconfirmed") !== (summary.skipReason !== null)) {
    ctx.addIssue({ code: "custom", message: "Invalid summary confirmation or duplicate fields" });
  }
});
export type Summary = z.infer<typeof summarySchema>;
