import { z } from "zod";

const isoDateSchema = z.iso.date();
const nullableDateSchema = isoDateSchema.nullable();
const identifierSchema = z.string().trim().min(1);

export const verificationStatusSchema = z.enum([
  "verified",
  "historical",
  "unverified",
  "blocked",
  "conflict",
]);

export const jurisdictionSchema = z.strictObject({
  scope: z.enum(["city", "district", "national", "organization", "unknown"]),
  districtName: z.string().trim().min(1).nullable(),
  applicableDistricts: z.array(z.string().trim().min(1)),
});

export const chunkSchema = z.strictObject({
  chunkId: identifierSchema,
  docId: identifierSchema,
  heading: z.string().trim().min(1),
  text: z.string().trim().min(1),
  claimKeys: z.array(identifierSchema),
  verifiedClaims: z.array(identifierSchema),
  answerEligible: z.boolean(),
  routingEligible: z.boolean(),
  conflicts: z.array(z.string().trim().min(1)),
}).superRefine((chunk, context) => {
  for (const claimKey of chunk.verifiedClaims) {
    if (!chunk.claimKeys.includes(claimKey)) {
      context.addIssue({
        code: "custom",
        path: ["verifiedClaims"],
        message: "A verified claim must be declared in claimKeys.",
      });
    }
  }
});

export const documentSchema = z.strictObject({
  docId: identifierSchema,
  sourcePath: identifierSchema,
  title: z.string().trim().min(1),
  category: z.string().trim().min(1),
  jurisdiction: jurisdictionSchema,
  sourceUrl: z.url({ protocol: /^https?$/ }),
  retrievedAt: isoDateSchema,
  publishedAt: nullableDateSchema,
  updatedAt: nullableDateSchema,
  effectiveFrom: nullableDateSchema,
  effectiveUntil: nullableDateSchema,
  dateStatus: z.string().trim().min(1),
  sourceVerifiedAt: nullableDateSchema,
  verificationStatus: verificationStatusSchema,
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/i),
  chunks: z.array(chunkSchema).min(1),
}).superRefine((document, context) => {
  if (document.effectiveFrom && document.effectiveUntil && document.effectiveFrom >= document.effectiveUntil) {
    context.addIssue({
      code: "custom",
      path: ["effectiveUntil"],
      message: "effectiveUntil must be after effectiveFrom.",
    });
  }
  for (const [index, chunk] of document.chunks.entries()) {
    if (chunk.docId !== document.docId) {
      context.addIssue({
        code: "custom",
        path: ["chunks", index, "docId"],
        message: "A chunk must belong to its containing document.",
      });
    }
  }
});

export const citationSchema = z.strictObject({
  chunkId: identifierSchema,
  claimKey: identifierSchema,
  quote: z.string().trim().min(1),
  sourceUrl: z.url({ protocol: /^https?$/ }),
  basisDate: nullableDateSchema,
  basisDateType: z.string().trim().min(1),
});

export const replacementSchema = z.strictObject({
  id: identifierSchema,
  predecessorDocId: identifierSchema,
  successorDocId: identifierSchema,
  claimKey: identifierSchema,
  before: z.string().trim().min(1),
  after: z.string().trim().min(1),
  validFrom: nullableDateSchema,
  validUntil: nullableDateSchema,
  evidenceChunkIds: z.array(identifierSchema).min(1),
}).superRefine((replacement, context) => {
  if (replacement.validFrom && replacement.validUntil && replacement.validFrom >= replacement.validUntil) {
    context.addIssue({
      code: "custom",
      path: ["validUntil"],
      message: "validUntil must be after validFrom.",
    });
  }
});

export type Document = z.infer<typeof documentSchema>;
export type Chunk = z.infer<typeof chunkSchema>;
export type Citation = z.infer<typeof citationSchema>;
export type Replacement = z.infer<typeof replacementSchema>;
