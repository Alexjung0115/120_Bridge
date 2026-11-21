import { z } from "zod";
import { revisionSchema } from "../contracts";

export const handoffSummarySchema = z.object({
  id: z.uuid(),
  revision: revisionSchema,
  sessionRevision: revisionSchema,
  coreLines: z.array(z.string()).max(3),
  confirmation: z.enum(["confirmed", "unconfirmed"]),
  confirmedAt: z.iso.datetime({ offset: true }).nullable(),
  skipReason: z.string().nullable(),
}).catchall(z.json());

export const handoffDeliverySchema = z.strictObject({
  id: z.uuid(),
  idempotencyKey: z.uuid(),
  summaryId: z.uuid(),
  summaryRevision: revisionSchema,
  summary: handoffSummarySchema,
  unresolvedIssueIds: z.array(z.uuid()),
  resolvedContextIds: z.array(z.uuid()),
  candidates: z.array(z.json()),
});