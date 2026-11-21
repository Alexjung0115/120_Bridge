import { z } from "zod";
import { commandEnvelopeSchema, schemaVersion, turnRequestSchema } from "../contracts";
import { requestHandoffSchema } from "../schema/citizen-handoff";
import { decideHandoff } from "../policy/handoff";
import { sessionSchema } from "../schema/session";
import { createSupabaseRpc } from "../store/snapshot";
import { canAccessCitizenSession, readBearerToken } from "./auth";
import { noStoreJson } from "./limits";
import { createRequestContext } from "./request-log";
import { sessionError } from "./session-api";

const directHandoff = commandEnvelopeSchema.extend({ trigger: z.literal("button"), skipConfirmation: z.literal(true) });

const confirmSummary = commandEnvelopeSchema.extend({ action: z.literal("confirm"), summaryRevision: z.int().nonnegative() });

export async function mvpCitizenCommand(request: Request, id: string, kind: "turn" | "direct_handoff" | "confirm_summary") {
  const { requestId } = createRequestContext(kind === "turn" ? "session_turn" : "handoff");
  if (!readBearerToken(request.headers)) return sessionError(requestId, 401, "unauthorized");
  if (!z.uuid().safeParse(id).success) return sessionError(requestId, 400, "invalid_request");
  const input = await request.json().catch(() => null);
  const parsed = (kind === "turn"
    ? turnRequestSchema
    : kind === "confirm_summary" ? confirmSummary : z.union([directHandoff, requestHandoffSchema])).safeParse(input);
  if (!parsed.success) return sessionError(requestId, 400, "invalid_request");
  const skips = "skipConfirmation" in parsed.data && parsed.data.skipConfirmation === true;
  if (kind === "direct_handoff" && skips) {
    const decision = decideHandoff({
      explicitHumanRequest: true,
      skipConfirmation: "skipConfirmation" in parsed.data && parsed.data.skipConfirmation,
    });
    if (decision.action !== "send_unconfirmed") return sessionError(requestId, 400, "invalid_request");
  }

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
    type Receipt = { status: string; data?: unknown; revision?: number };
    const result = kind === "confirm_summary" || (kind === "direct_handoff" && !skips)
      ? await rpc<Receipt>("bridge_citizen_summary_command", {
        p_session: id, p_command: commandId, p_base: baseRevision, p_hash: session.citizenTokenHash,
        p_summary_revision: "summaryRevision" in parsed.data ? parsed.data.summaryRevision : null,
      })
      : await rpc<Receipt>("bridge_mvp_citizen_command", {
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