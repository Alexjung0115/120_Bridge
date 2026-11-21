import { z } from "zod";
import { commandEnvelopeSchema, revisionSchema } from "../contracts";

export const requestHandoffSchema = commandEnvelopeSchema.extend({
  trigger: z.enum(["voice", "button", "key"]),
});

export const handoffDecisionSchema = commandEnvelopeSchema.extend({
  decision: z.enum(["accept", "decline"]),
});

const correctionText = z.string().refine(
  (text) => text.trim().length > 0 && Array.from(text).length <= 2_000,
  "Correction must contain 1 to 2000 characters.",
);
const summaryCommand = commandEnvelopeSchema.extend({ summaryRevision: revisionSchema });

export const summaryDecisionSchema = z.discriminatedUnion("action", [
  summaryCommand.extend({ action: z.literal("confirm") }),
  summaryCommand.extend({ action: z.literal("skip") }),
  summaryCommand.extend({
    action: z.literal("edit"),
    correctionText: correctionText.optional(),
    changes: z.array(z.strictObject({ fieldKey: z.string().min(1), value: z.string().nullable() })).min(1).optional(),
  }).refine((value) => (value.correctionText !== undefined) !== (value.changes !== undefined),
    "Provide a correction or a list of field changes."),
]);

export const retryHandoffSchema = commandEnvelopeSchema.extend({ handoffId: z.uuid() });
export const correctHandoffSchema = summaryCommand.extend({ handoffId: z.uuid(), correctionText });