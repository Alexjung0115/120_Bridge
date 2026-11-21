import type { DialogueCandidate } from "./candidate-schema.ts";
import {
  routingResultSchema,
  type RoutingCitation,
  type RoutingResult,
} from "../schema/candidate.ts";

type LocationPurpose = "residence" | "disposal" | "incident" | "other";
type UnresolvedIssue = { id: string; localId: string; purpose: LocationPurpose };

export type VerifiedRoutingSource = {
  id: string;
  name: string;
  purpose: string;
  reason: string;
  supportedPurposes: LocationPurpose[];
  generalFallback: boolean;
  verified: boolean;
  routingEligible: boolean;
  evidence: RoutingCitation[];
};

function reference(value: { chunkId: string; claimKey: string; quote: string }): string {
  return JSON.stringify([value.chunkId, value.claimKey, value.quote]);
}

export function recommendRouting(
  unresolved: UnresolvedIssue[],
  proposed: DialogueCandidate["routingEvidence"],
  sources: VerifiedRoutingSource[],
): RoutingResult {
  if (unresolved.length === 0) {
    return { candidates: [], unknownReason: "미해결 문의가 없습니다." };
  }
  const seen = new Set<string>();
  const matches = sources.flatMap((source) => {
    if (seen.has(source.id)) throw new Error("Duplicate routing source ID");
    seen.add(source.id);
    if (!source.verified || !source.routingEligible) return [];

    const citations = new Map(source.evidence.map((item) => [reference(item), item]));
    const issueIds: string[] = [];
    const evidence = new Map<string, RoutingCitation>();
    for (const issue of unresolved) {
      if (!source.supportedPurposes.includes(issue.purpose)) continue;
      const references = proposed.filter((item) => item.issueLocalId === issue.localId);
      for (const proposal of references) {
        const key = reference(proposal);
        const citation = citations.get(key);
        if (citation) {
          if (!issueIds.includes(issue.id)) issueIds.push(issue.id);
          evidence.set(key, citation);
        }
      }
    }
    if (issueIds.length === 0) return [];
    return [{ source, issueIds, evidence: [...evidence.values()] }];
  });
  matches.sort((left, right) =>
    right.issueIds.length - left.issueIds.length ||
    Number(left.source.generalFallback) - Number(right.source.generalFallback) ||
    left.source.id.localeCompare(right.source.id),
  );
  const candidates = matches.slice(0, 2).map(({ source, issueIds, evidence }, index) => ({
    id: crypto.randomUUID(),
    issueIds,
    rank: (index + 1) as 1 | 2,
    name: source.name,
    purpose: source.purpose,
    reason: source.reason,
    evidence,
    confidence: source.generalFallback ? "low" as const : "high" as const,
    selectedByAgent: false,
  }));
  return routingResultSchema.parse({
    candidates,
    unknownReason: candidates.length === 0 ? "검증된 창구 근거가 없습니다." : null,
  });
}
