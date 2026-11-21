import { z } from "zod";
import { commandEnvelopeSchema, schemaVersion, turnRequestSchema } from "../contracts";
import { sessionSchema } from "../schema/session";
import { createSupabaseRpc } from "../store/snapshot";
import { canAccessCitizenSession, readBearerToken } from "./auth";
import { noStoreJson } from "./limits";
import { createRequestContext } from "./request-log";
import { sessionError } from "./session-api";

const directHandoff = commandEnvelopeSchema.extend({ trigger: z.literal("button"), skipConfirmation: z.literal(true) });

export async function mvpCitizenCommand(request: Request, id: string, kind: "turn" | "direct_handoff") {
  const { requestId } = createRequestContext(kind === "turn" ? "session_turn" : "handoff");
  if (!readBearerToken(request.headers)) return sessionError(requestId, 401, "unauthorized");
  if (!z.uuid().safeParse(id).success) return sessionError(requestId, 400, "invalid_request");
  const input = await request.json().catch(() => null);
  const parsed = (kind === "turn"
    ? turnRequestSchema.extend({ inputMode: z.literal("text") })
    : directHandoff).safeParse(input);
  if (!parsed.success) return sessionError(requestId, 400, "invalid_request");

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return sessionError(requestId, 503, "storage_unavailable");
  try {
    const rpc = createSupabaseRpc(url, key);
    const raw = await rpc("bridge_load_session", { p_session: id });
    if (raw === null) return sessionError(requestId, 404, "not_found");
    const session = sessionSchema.parse(raw);
    if (session.id !== id || !canAccessCitizenSession(request.headers, session.citizenTokenHash)) {
      return sessionError(requestId, 403, "forbidden");
    }
    const { commandId, baseRevision } = parsed.data;
    const result = await rpc<{ status: string; data?: unknown; revision?: number }>("bridge_mvp_citizen_command", {
      p_session: id, p_command: commandId, p_base: baseRevision, p_hash: session.citizenTokenHash,
      p_kind: kind, p_text: "text" in parsed.data ? parsed.data.text : null,
    });
    if (result.status === "committed" || result.status === "replayed") {
      return noStoreJson({ schemaVersion, requestId, data: result.data });
    }
    if (result.status === "conflict") {
      return noStoreJson({ schemaVersion, requestId, currentRevision: result.revision,
        error: { code: "session_conflict", message: "최신 상담 상태를 확인해 주세요.", retryable: false },
      }, { status: 409 });
    }
    if (result.status === "forbidden") return sessionError(requestId, 403, "forbidden");
    if (result.status === "not_found") return sessionError(requestId, 404, "not_found");
    if (result.status === "limit") {
      return noStoreJson({ schemaVersion, requestId,
        error: { code: "turn_limit", message: "상담사 연결을 요청하거나 상담을 종료해 주세요.", retryable: false },
      }, { status: 429 });
    }
  } catch {
    return sessionError(requestId, 503, "storage_unavailable");
  }
  return sessionError(requestId, 503, "storage_unavailable");
}