import { z } from "zod";

export const schemaVersion = 1;
export const consultationLimits = {
  turnCharacters: 2_000,
  turnsPerSession: 100,
  concurrentSessions: 5,
} as const;

export const revisionSchema = z.int().nonnegative();
export const inputModeSchema = z.enum(["voice", "text", "button", "key"]);
export const consultationInputModeSchema = inputModeSchema.extract(["voice", "text"]);

export const commandEnvelopeSchema = z.strictObject({
  commandId: z.uuid(),
  baseRevision: revisionSchema,
});

export const createSessionRequestSchema = z.strictObject({
  clientSessionKey: z.string().refine((value) => value.trim().length > 0),
  inputMode: consultationInputModeSchema,
});

export const citizenTextSchema = z.string().refine(
  (text) => text.trim().length > 0 && Array.from(text).length <= consultationLimits.turnCharacters,
  "A turn must contain 1 to 2000 characters.",
);

export const turnRequestSchema = commandEnvelopeSchema.extend({
  text: citizenTextSchema,
  inputMode: consultationInputModeSchema,
});

const responseEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(schemaVersion),
  requestId: z.uuid(),
});

export const successEnvelopeSchema = responseEnvelopeSchema.extend({ data: z.json() });

export const apiErrorEnvelopeSchema = responseEnvelopeSchema.extend({
  error: z.strictObject({
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean(),
  }),
  currentRevision: revisionSchema.optional(),
});

export type CommandEnvelope = z.infer<typeof commandEnvelopeSchema>;
export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;