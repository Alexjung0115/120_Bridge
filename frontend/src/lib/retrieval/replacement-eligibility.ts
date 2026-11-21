import type { Replacement } from "./document-schema";

export function activeReplacement(
  replacements: Replacement[],
  claimKey: string,
  businessDate: string,
): Replacement | null {
  return replacements.find((item) => item.claimKey === claimKey &&
    (item.validFrom === null || item.validFrom <= businessDate) &&
    (item.validUntil === null || businessDate < item.validUntil)) ?? null;
}

export function supportedRoutingName(name: string, evidenceChunkIds: string[]): string | null {
  return name.trim() && evidenceChunkIds.length > 0 ? name : null;
}
