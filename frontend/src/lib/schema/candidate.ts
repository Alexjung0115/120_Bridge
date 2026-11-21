import { z } from "zod";

export const routingCitationSchema = z.strictObject({
  chunkId: z.string().min(1),
  claimKey: z.string().min(1),
  quote: z.string().min(1),
  sourceUrl: z.url({ protocol: /^https?$/ }),
  basisDate: z.iso.date().nullable(),
  basisDateType: z.string().min(1),
});

export const candidateSchema = z.strictObject({
  id: z.uuid(),
  issueIds: z.array(z.uuid()).min(1),
  rank: z.union([z.literal(1), z.literal(2)]),
  name: z.string().min(1),
  purpose: z.string().min(1),
  reason: z.string().min(1),
  evidence: z.array(routingCitationSchema).min(1),
  confidence: z.enum(["high", "low"]),
  selectedByAgent: z.boolean(),
});

export const routingResultSchema = z.strictObject({
  candidates: z.array(candidateSchema).max(2),
  unknownReason: z.string().min(1).nullable(),
}).superRefine((result, context) => {
  if ((result.candidates.length === 0) !== (result.unknownReason !== null)) {
    context.addIssue({ code: "custom", message: "Empty candidates require a reason" });
  }
  if (result.candidates.some((candidate, index) => candidate.rank !== index + 1)) {
    context.addIssue({ code: "custom", message: "Candidate ranks must be ordered" });
  }
  if (new Set(result.candidates.map((candidate) => candidate.id)).size !== result.candidates.length) {
    context.addIssue({ code: "custom", message: "Candidate IDs must be unique" });
  }
});

export type Candidate = z.infer<typeof candidateSchema>;
export type RoutingResult = z.infer<typeof routingResultSchema>;
export type RoutingCitation = z.infer<typeof routingCitationSchema>;
