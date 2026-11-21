import { z } from "zod";
import { commandEnvelopeSchema, schemaVersion } from "../contracts";
import { getConsoleAgentId } from "./auth";
import { noStoreJson } from "./limits";
import { createRequestContext } from "./request-log";
import { sessionError } from "./session-api";

const outcomeSchema = z.strictObject({
  resolutionNote: z.string().max(2_000).nullable(),
  repeatExplanationCount: z.int().min(0).max(2_147_483_647).nullable(),
  gapReason: z.string().max(2_000).nullable(),
  proposedSourceUrls: z.array(z.url({ protocol: /^https?$/ })),
});

const actionSchema = z.discriminatedUnion("action", [
  commandEnvelopeSchema.extend({ action: z.literal("claim") }),
  commandEnvelopeSchema.extend({ action: z.literal("transfer_demo"), candidateId: z.uuid() }),
  commandEnvelopeSchema.extend({ action: z.literal("complete_case"), outcome: outcomeSchema.optional() }),
]);

type Command = z.infer<typeof actionSchema>;
type Result = { status: "committed" | "replayed"; data: unknown } |
  { status: "conflict"; revision: number } | { status: "not_found" | "invalid_candidate" };

export function createConsoleActionApi(
  apply: (sessionId: string, agent: string, command: Command) => Promise<unknown>,
  config: Parameters<typeof getConsoleAgentId>[1],
) {
  return async (request: Request, sessionId: string) => {
    const { requestId } = createRequestContext("console");
    const agent = getConsoleAgentId(request.headers, config);
    if (!agent) return sessionError(requestId, 401, "unauthorized");
    if (!z.uuid().safeParse(sessionId).success) return sessionError(requestId, 400, "invalid_request");
    let body: unknown;
    try { body = await request.json(); } catch { return sessionError(requestId, 400, "invalid_request"); }
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) return sessionError(requestId, 400, "invalid_request");

    try {
      const result = await apply(sessionId, agent, parsed.data) as Result;
      if (result.status === "not_found") return sessionError(requestId, 404, "not_found");
      if (result.status === "invalid_candidate") return sessionError(requestId, 400, "invalid_request");
      if (result.status === "conflict") {
        return noStoreJson({ schemaVersion, requestId, currentRevision: result.revision,
          error: { code: "session_conflict", message: "최신 상담 상태를 확인해 주세요.", retryable: false },
        }, { status: 409 });
      }
      if (result.status === "committed" || result.status === "replayed") {
        return noStoreJson({ schemaVersion, requestId, data: result.data });
      }
      return sessionError(requestId, 503, "storage_unavailable");
    } catch {
      return sessionError(requestId, 503, "storage_unavailable");
    }
  };
}