import type { Document, Replacement } from "./document-schema";

/** Replacements whose successor is this document for this claim (several predecessors may share one). */
export function governingReplacements(
  replacements: Replacement[] | undefined,
  docId: string,
  claimKey: string,
): Replacement[] {
  return (replacements ?? []).filter((item) => item.successorDocId === docId && item.claimKey === claimKey);
}

/**
 * A replaced claim is valid in its replacement window [validFrom, validUntil), not the successor
 * document's window. Other claims of the same document keep the document dates (no propagation).
 * Build validation guarantees replacements sharing a successor and claim share one window.
 */
export function claimScopedDocument(replacements: Replacement[] | undefined, doc: Document, claimKey: string): Document {
  const [governing] = governingReplacements(replacements, doc.docId, claimKey);
  return governing ? { ...doc, effectiveFrom: governing.validFrom, effectiveUntil: governing.validUntil } : doc;
}
