import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import { commandEnvelopeSchema, createSessionRequestSchema, schemaVersion } from "../contracts";
import { sessionSchema, type Session } from "../schema/session";
import { canAccessCitizenSession, readBearerToken } from "./auth";
import { noStoreJson } from "./limits";
import { createRequestContext } from "./request-log";
import { sessionCreated, sessionReadMetadata } from "./session-response";

type OpenResult = { status: "created" | "existing"; snapshot: unknown } |
  { status: "limit" | "conflict" };

export function createSessionApi(storage: {
  open(mode: "voice" | "text", session: Session, request: Request): Promise<OpenResult>;
  load(id: string): Promise<unknown>;
  loadSummary?(id: string, revision: number): Promise<unknown>;
  end(id: string, commandId: string, base: number, hash: string): Promise<
    { status: "committed" | "replayed"; data: unknown } |
    { status: "conflict"; revision: number } | { status: "not_found" } | { status: "forbidden" }
  >;
}, secret: string, corpusVersion: string) {
  if (Buffer.byteLength(secret) < 32) throw new Error("Session signing secret is not configured.");

  return {
    async create(request: Request) {
      const { requestId } = createRequestContext("session_create");
      let input: unknown;
      try { input = await request.json(); } catch { return sessionError(requestId, 400, "invalid_request"); }
      // A retry key is a client-generated random UUID. It also protects token replay.
      const parsed = createSessionRequestSchema.safeParse(input);
      if (!parsed.success) return sessionError(requestId, 400, "invalid_request");

      const key = parsed.data.clientSessionKey.toLowerCase();
      const bytes = createHmac("sha256", secret).update("session-id:" + key).digest().subarray(0, 16);
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const hex = bytes.toString("hex");
      const id = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
      const token = "cit_" + createHmac("sha256", secret).update("citizen-token:" + key).digest("base64url");
      const citizenTokenHash = createHash("sha256").update(token).digest("hex");
      const now = new Date();
      const timestamp = now.toISOString();
      const businessDate = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const session: Session = {
        id, revision: 0, createdAt: timestamp, updatedAt: timestamp, businessDate,
        citizenTokenHash, state: "active", activeIssueId: null, issueIds: [], transcript: [],
        handoffId: null, pendingRequestId: null, corpusVersion, outcome: "unknown", outcomeConfirmedAt: null,
      };
      try {
        const result = await storage.open(parsed.data.inputMode, session, request);
        if (result.status === "limit") return sessionError(requestId, 429, "session_limit");
        if (result.status !== "created" && result.status !== "existing") return sessionError(requestId, 409, "session_conflict");
        const stored = sessionSchema.parse(result.snapshot);
        if (stored.id !== id || stored.citizenTokenHash !== citizenTokenHash) return sessionError(requestId, 409, "session_conflict");
        return noStoreJson({ schemaVersion, requestId, data: sessionCreated(stored, token) },
          { status: result.status === "created" ? 201 : 200 });
      } catch {
        return sessionError(requestId, 503, "storage_unavailable");
      }
    },
    async end(request: Request, id: string) {
      const { requestId } = createRequestContext("session_end");
      if (!z.uuid().safeParse(id).success) return sessionError(requestId, 400, "invalid_request");
      const token = readBearerToken(request.headers);
      if (!token) return sessionError(requestId, 401, "unauthorized");
      let input: unknown;
      try { input = await request.json(); } catch { return sessionError(requestId, 400, "invalid_request"); }
      const parsed = commandEnvelopeSchema.safeParse(input);
      if (!parsed.success) return sessionError(requestId, 400, "invalid_request");
      try {
        const raw = await storage.load(id);
        if (raw === null) return sessionError(requestId, 404, "not_found");
        const session = sessionSchema.parse(raw);
        if (session.id !== id || !canAccessCitizenSession(request.headers, session.citizenTokenHash)) {
          return sessionError(requestId, 403, "forbidden");
        }
        const result = await storage.end(id, parsed.data.commandId, parsed.data.baseRevision, session.citizenTokenHash);
        if (result.status === "conflict") {
          return noStoreJson({ schemaVersion, requestId, currentRevision: result.revision,
            error: { code: "session_conflict", message: "최신 상담 상태를 확인해 주세요.", retryable: false },
          }, { status: 409 });
        }
        if (result.status === "not_found") return sessionError(requestId, 404, "not_found");
        if (result.status === "forbidden") return sessionError(requestId, 403, "forbidden");
        return noStoreJson({ schemaVersion, requestId, data: result.data });
      } catch {
        return sessionError(requestId, 503, "storage_unavailable");
      }
    },
    async read(request: Request, id: string) {
      const { requestId } = createRequestContext("session_read");
      if (!z.uuid().safeParse(id).success) return sessionError(requestId, 400, "invalid_request");
      if (!readBearerToken(request.headers)) return sessionError(requestId, 401, "unauthorized");
      try {
        const raw = await storage.load(id);
        if (raw === null) return sessionError(requestId, 404, "not_found");
        const session = sessionSchema.parse(raw);
        if (session.id !== id || !canAccessCitizenSession(request.headers, session.citizenTokenHash)) {
          return sessionError(requestId, 403, "forbidden");
        }
        const metadata = sessionReadMetadata(session);
        const transcript = metadata.presentationState === "connection_complete" ? [] :
          session.transcript.filter((turn) => turn.outputStatus === "committed");
        return noStoreJson({ schemaVersion, requestId, data: {
          ...metadata, transcript, cards: [],
          issues: metadata.presentationState === "connection_complete" ? [] :
            (session.issues ?? []).map(({ id, citizenRequest, status }) => ({ id, request: citizenRequest, status })),
          utterances: transcript.filter(({ role }) => role === "assistant")
            .map(({ id, text }) => ({ id, text, maxSentences: 2 })),
          ...(session.state === "summary_confirm" && storage.loadSummary
            ? { summary: await storage.loadSummary(id, session.revision) } : {}),
        } });
      } catch {
        return sessionError(requestId, 503, "storage_unavailable");
      }
    },
  };
}

export function sessionError(requestId: string, status: number, code: string) {
  const messages: Record<string, string> = {
    invalid_request: "요청 형식을 확인해 주세요.", session_limit: "동시 상담이 가득 찼습니다.",
    session_conflict: "이미 사용한 상담 요청입니다.", unauthorized: "상담 인증이 필요합니다.",
    forbidden: "이 상담을 조회할 수 없습니다.", not_found: "상담을 찾을 수 없습니다.",
    storage_unavailable: "상담을 저장하거나 불러올 수 없습니다.",
  };
  return noStoreJson({ schemaVersion, requestId, error: {
    code, message: messages[code], retryable: status === 429 || status === 503,
  } }, { status });
}