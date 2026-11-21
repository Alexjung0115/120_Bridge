import { randomUUID } from "node:crypto";
import { z } from "zod";
import { commandEnvelopeSchema, consultationLimits, schemaVersion, turnRequestSchema } from "../contracts";
import type { Corpus } from "../retrieval/search";
import { issueCollectionSchema } from "../schema/issue";
import { sessionSchema, type Turn } from "../schema/session";
import { canAccessCitizenSession, readBearerToken } from "../server/auth";
import { noStoreJson } from "../server/limits";
import { sessionError } from "../server/session-api";
import { sessionReadMetadata } from "../server/session-response";
import { createSessionStore } from "../store/session-store";
import type { SavedCommand, SessionPersistence } from "../store/snapshot";
import { guideTurn, unavailable, type DialogueSnapshot } from "./orchestrator";
import type { ResponsesClient } from "./model-client";

const receiptData = z.looseObject({ completionId: z.uuid().optional() });
const outcomeRequest = commandEnvelopeSchema.extend({ decision: z.enum(["resolved", "need_more"]) });

export function parseDialogueSnapshot(input: unknown): DialogueSnapshot {
  const { issues, ...session } = z.looseObject({ issues: issueCollectionSchema.default([]) }).parse(input);
  const snapshot = sessionSchema.parse(session);
  if (issues.length !== snapshot.issueIds.length ||
      issues.some(({ id, sessionId }) => sessionId !== snapshot.id || !snapshot.issueIds.includes(id)) ||
      (issues.find(({ status }) => status === "active")?.id ?? null) !== snapshot.activeIssueId) {
    throw new Error("Dialogue issues do not match session");
  }
  return { ...snapshot, issues };
}

export function createDialogueApi({ persistence, corpus, model, responseWaitMs = 10_000, retainWork }: {
  persistence: SessionPersistence;
  corpus: Corpus;
  model: ResponsesClient;
  responseWaitMs?: number;
  retainWork?: (work: Promise<unknown>) => void;
}) {
  const store = createSessionStore(persistence, parseDialogueSnapshot);

  function snapshot(session: Readonly<DialogueSnapshot>) {
    const metadata = sessionReadMetadata(session);
    const visible = metadata.presentationState !== "connection_complete";
    const transcript = visible ? session.transcript.filter(({ outputStatus }) => outputStatus === "committed") : [];
    const utterances = transcript.filter(({ role }) => role === "assistant")
      .map(({ id, text }) => ({ id, text, maxSentences: 2 }));
    const cards = transcript.filter(({ factCitations }) => factCitations.length > 0)
      .map(({ id, text, factCitations }) => ({ id, type: "evidence", text, basisDate: factCitations[0].basisDate,
        citations: factCitations.map((citation) => ({ ...citation, title: corpus.documents.find(({ chunks }) =>
          chunks.some(({ chunkId }) => chunkId === citation.chunkId))?.title ?? citation.sourceUrl })) }));
    return { ...metadata, transcript, utterances, cards,
      issues: visible ? session.issues.map(({ id, citizenRequest, status }) => ({ id, request: citizenRequest, status })) : [] };
  }

  function success(requestId: string, data: unknown, status = 200) {
    return noStoreJson({ schemaVersion, requestId, data }, { status });
  }

  function receipt(requestId: string, result: SavedCommand | { status: "skipped"; revision: number }) {
    if (result.status === "not_found") return sessionError(requestId, 404, "not_found");
    if (result.status === "skipped" || result.status === "conflict") {
      return noStoreJson({ schemaVersion, requestId, currentRevision: result.revision,
        error: { code: "session_conflict", message: "최신 상담 상태를 확인해 주세요.", retryable: false } },
      { status: 409 });
    }
    const { result: data, revision } = result;
    const processing = data !== null && typeof data === "object" && "processing" in data && data.processing;
    const publicData = receiptData.parse(data);
    delete publicData.completionId;
    return success(requestId, { ...publicData, revision }, processing ? 202 : 200);
  }

  async function authorized(request: Request, id: string, run: (
    session: DialogueSnapshot, requestId: string,
  ) => Promise<Response>) {
    const requestId = randomUUID();
    if (!readBearerToken(request.headers)) return sessionError(requestId, 401, "unauthorized");
    if (!z.uuid().safeParse(id).success) return sessionError(requestId, 400, "invalid_request");
    try {
      const session = await store.load(id);
      if (!session) return sessionError(requestId, 404, "not_found");
      if (session.id !== id || !canAccessCitizenSession(request.headers, session.citizenTokenHash)) {
        return sessionError(requestId, 403, "forbidden");
      }
      return await run(session, requestId);
    } catch {
      return sessionError(requestId, 503, "storage_unavailable");
    }
  }

  async function complete(session: DialogueSnapshot, turn: Turn, completionId: string) {
    const output = await guideTurn(session, turn, corpus, model, AbortSignal.timeout(25_000)).catch(() => ({
      issues: session.issues, activeIssueId: session.activeIssueId, guidance: [{ text: unavailable, citations: [] }],
    }));
    return store.execute(session.id, { commandId: completionId, baseRevision: session.revision }, (state) => {
      if (state.state !== "active" || state.pendingRequestId !== turn.id) return null;
      const replies = output.guidance.slice(0, consultationLimits.turnsPerSession - state.transcript.length)
        .map(({ text, citations }, index): Turn => ({
          id: randomUUID(), sessionId: state.id, sequence: turn.sequence + index + 1, role: "assistant",
          text, timestamp: new Date().toISOString(), inputMode: turn.inputMode,
          issueIds: output.issues.filter(({ status }) => status === "advised")
            .filter(({ id }) => !state.issues.some((issue) => issue.id === id && issue.status === "advised"))
            .map(({ id }) => id),
          outputStatus: "committed", factCitations: citations,
        }));
      const next = { ...state, issues: output.issues, activeIssueId: output.activeIssueId,
        issueIds: output.issues.map(({ id }) => id), pendingRequestId: null,
        transcript: [...state.transcript, ...replies] };
      return { state: next, result: { ...snapshot(next), turnId: turn.id } };
    });
  }

  async function close(request: Request, id: string, explicit: boolean) {
    return authorized(request, id, async (_session, requestId) => {
      const input = await request.json().catch(() => null);
      const parsed = (explicit ? outcomeRequest : commandEnvelopeSchema).safeParse(input);
      if (!parsed.success) return sessionError(requestId, 400, "invalid_request");
      const decision = "decision" in parsed.data ? parsed.data.decision : null;
      const result = await store.execute(id, parsed.data, (state) => {
        if (state.state !== "active" || (decision && state.pendingRequestId)) return null;
        const resolved = decision === "resolved";
        if (resolved && (!state.transcript.at(-1)?.factCitations.length ||
            !state.issues.length || state.issues.some(({ status }) => status !== "advised"))) return null;
        const next: DialogueSnapshot = { ...state, pendingRequestId: null,
          state: decision === "need_more" ? "active" : "ended",
          outcome: resolved ? "ai_confirmed" : "unknown",
          outcomeConfirmedAt: resolved ? new Date().toISOString() : null };
        return { state: next, result: snapshot(next) };
      });
      return receipt(requestId, result);
    });
  }

  return {
    read: (request: Request, id: string) => authorized(request, id,
      async (session, requestId) => success(requestId, snapshot(session))),
    end: (request: Request, id: string) => close(request, id, false),
    outcome: (request: Request, id: string) => close(request, id, true),
    turn: (request: Request, id: string) => authorized(request, id, async (session, requestId) => {
      const parsed = turnRequestSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) return sessionError(requestId, 400, "invalid_request");
      const { text, inputMode } = parsed.data;
      const turn: Turn = {
        id: randomUUID(), sessionId: id, sequence: Math.max(-1, ...session.transcript.map(({ sequence }) => sequence)) + 1,
        role: "citizen", text, inputMode, timestamp: new Date().toISOString(),
        issueIds: [], outputStatus: "committed", factCitations: [],
      };
      const completionId = randomUUID();
      // Reserve space for the citizen turn and up to three verified reply units.
      const replay = await persistence.replay(id, parsed.data.commandId);
      if (!replay && session.revision === parsed.data.baseRevision && session.state === "active" &&
          !session.pendingRequestId && session.transcript.length > consultationLimits.turnsPerSession - 4) {
        return noStoreJson({ schemaVersion, requestId,
          error: { code: "turn_limit", message: "상담을 종료해 주세요.", retryable: false } }, { status: 429 });
      }
      const accepted = replay ?? await store.execute(id, parsed.data, (state) => {
        if (state.revision !== session.revision || state.state !== "active" || state.pendingRequestId) return null;
        const next = { ...state, pendingRequestId: turn.id, transcript: [...state.transcript, turn] };
        return { state: next, result: { ...snapshot(next), turnId: turn.id, completionId } };
      });
      if (accepted.status === "replayed") {
        const original = receiptData.parse(accepted.result);
        return receipt(requestId, original.completionId
          ? await persistence.replay(id, original.completionId) ?? accepted : accepted);
      }
      if (accepted.status !== "committed") return receipt(requestId, accepted);
      const work = complete({ ...session, revision: accepted.revision }, turn, completionId);
      // Observe failures even after the response deadline; only the worker that won the receipt runs.
      const finished = work.then((result) => receipt(requestId, result),
        () => sessionError(requestId, 503, "storage_unavailable"));
      retainWork?.(finished);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([finished, new Promise<Response>((resolve) => {
          timer = setTimeout(() => resolve(receipt(requestId, accepted)), responseWaitMs);
        })]);
      } finally {
        clearTimeout(timer);
      }
    }),
  };
}
