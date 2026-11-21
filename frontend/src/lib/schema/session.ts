import { z } from "zod";

import {
  citizenTextSchema,
  consultationLimits,
  inputModeSchema,
  revisionSchema,
} from "../contracts";

import { issueCollectionSchema } from "./issue";

const timestampSchema = z.iso.datetime({ offset: true });
const nullableIdSchema = z.uuid().nullable();

export const sessionStateSchema = z.enum([
  "active",
  "handoff_offered",
  "summary_confirm",
  "sending",
  "queued",
  "serving",
  "transferred_demo",
  "completed_demo",
  "ended",
  "delivery_failed",
]);

const citationSchema = z.strictObject({
  chunkId: z.string().min(1),
  claimKey: z.string().min(1),
  quote: z.string().min(1),
  sourceUrl: z.url({ protocol: /^https?$/ }),
  basisDate: z.iso.date().nullable(),
  basisDateType: z.string().min(1),
});

export const turnSchema = z.strictObject({
  id: z.uuid(),
  sessionId: z.uuid(),
  sequence: z.int().nonnegative(),
  role: z.enum(["citizen", "assistant", "system"]),
  inputMode: inputModeSchema,
  text: z.string(),
  timestamp: timestampSchema,
  issueIds: z.array(z.uuid()),
  outputStatus: z.enum(["pending", "committed", "discarded"]),
  factCitations: z.array(citationSchema),
}).refine(
  (turn) => turn.role !== "citizen" ||
    (turn.inputMode !== "text" && turn.inputMode !== "voice") ||
    citizenTextSchema.safeParse(turn.text).success,
  { path: ["text"], message: "Invalid citizen text." },
);

export const sessionSchema = z.strictObject({
  id: z.uuid(),
  revision: revisionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  citizenTokenHash: z.string().min(1),
  state: sessionStateSchema,
  activeIssueId: nullableIdSchema,
  issueIds: z.array(z.uuid()),
  issues: issueCollectionSchema.optional(),
  transcript: z.array(turnSchema).max(consultationLimits.turnsPerSession),
  handoffId: nullableIdSchema,
  pendingRequestId: nullableIdSchema,
  corpusVersion: z.string().min(1),
  businessDate: z.iso.date(),
  outcome: z.enum(["ai_confirmed", "handoff", "unknown"]),
  outcomeConfirmedAt: timestampSchema.nullable(),
}).superRefine((session, context) => {
  const ids = new Set<string>();
  const sequences = new Set<number>();
  for (const [index, turn] of session.transcript.entries()) {
    if (turn.sessionId !== session.id || ids.has(turn.id) || sequences.has(turn.sequence)) {
      context.addIssue({
        code: "custom",
        path: ["transcript", index],
        message: "Turn must belong to this session and have a unique ID and sequence.",
      });
    }
    ids.add(turn.id);
    sequences.add(turn.sequence);
  }
});

export type Session = z.infer<typeof sessionSchema>;
export type Turn = z.infer<typeof turnSchema>;