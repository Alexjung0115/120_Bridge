import { z } from "zod";
import { schemaVersion } from "../contracts";
import { correctHandoffSchema } from "../schema/citizen-handoff";
import { sessionSchema } from "../schema/session";
import { canAccessCitizenSession, readBearerToken } from "./auth";
import { noStoreJson } from "./limits";
import { createRequestContext } from "./request-log";
import { sessionError } from "./session-api";

type Dependencies = {
  load(id: string): Promise<unknown>;
  submit(id: string, command: z.infer<typeof correctHandoffSchema>, tokenHash: string): Promise<unknown>;
};

const receiptSchema = z.object({
  status: z.enum(["pending_confirmation", "replayed", "conflict", "not_found", "forbidden"]),
  handoffId: z.uuid().optional(),
  revision: z.int().nonnegative().optional(),
  deliveryRevision: z.int().positive().optional(),
});

export function createCitizenCorrectionApi(connect: () => Dependencies) {
  return async (request: Request, id: string) => {
    const { requestId } = createRequestContext("handoff");
    if (!readBearerToken(request.headers)) return sessionError(requestId, 401, "unauthorized");
    if (!z.uuid().safeParse(id).success) return sessionError(requestId, 400, "invalid_request");
    const command = correctHandoffSchema.safeParse(await request.json().catch(() => null));
    if (!command.success) return sessionError(requestId, 400, "invalid_request");

    try {
      const storage = connect();
      const raw = await storage.load(id);
      if (raw === null) return sessionError(requestId, 404, "not_found");
      const session = sessionSchema.parse(raw);
      if (session.id !== id || !canAccessCitizenSession(request.headers, session.citizenTokenHash)) {
        return sessionError(requestId, 403, "forbidden");
      }

      const result = receiptSchema.parse(await storage.submit(id, command.data, session.citizenTokenHash));
      if (result.status === "forbidden") return sessionError(requestId, 403, "forbidden");
      if (result.status === "not_found") return sessionError(requestId, 404, "not_found");
      if (result.status === "conflict") {
        return noStoreJson({ schemaVersion, requestId, currentRevision: result.revision,
          error: { code: "session_conflict", message: "최신 상담 상태를 확인해 주세요.", retryable: false },
        }, { status: 409 });
      }
      return noStoreJson({ schemaVersion, requestId, data: {
        handoffId: result.handoffId, revision: result.revision, deliveryRevision: result.deliveryRevision,
        correctionStatus: result.status === "replayed" ? "received" : "pending_confirmation",
      } });
    } catch {
      return sessionError(requestId, 503, "storage_unavailable");
    }
  };
}