import { z } from "zod";
import { sessionSchema } from "../schema/session";
import { canAccessCitizenSession, readBearerToken } from "./auth";
import { noStoreJson } from "./limits";
import { sessionError } from "./session-api";
import { createRequestContext } from "./request-log";

export function createCitizenHistoryApi(load: (id: string) => Promise<unknown>) {
  return async (request: Request, id: string) => {
    const { requestId } = createRequestContext("session_read");
    if (!readBearerToken(request.headers)) return sessionError(requestId, 401, "unauthorized");
    if (!z.uuid().safeParse(id).success) return sessionError(requestId, 400, "invalid_request");
    try {
      const raw = await load(id);
      if (raw === null) return sessionError(requestId, 404, "not_found");
      const session = sessionSchema.parse(raw);
      if (session.id !== id || !canAccessCitizenSession(request.headers, session.citizenTokenHash)) {
        return sessionError(requestId, 403, "forbidden");
      }
      return noStoreJson({ data: {
        id: session.id, createdAt: session.createdAt, state: session.state, outcome: session.outcome,
        transcript: session.transcript.filter((turn) => turn.outputStatus === "committed").map(
          ({ id: turnId, role, text, sequence, inputMode }) => ({ id: turnId, role, text, sequence, inputMode }),
        ),
      } });
    } catch {
      return sessionError(requestId, 503, "storage_unavailable");
    }
  };
}
