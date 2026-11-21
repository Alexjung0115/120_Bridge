import { z } from "zod";
import { apiErrorEnvelopeSchema, revisionSchema, successEnvelopeSchema } from "../../../lib/contracts";

const sessionSchema = z.object({
  sessionId: z.uuid(),
  citizenToken: z.string().min(1),
  revision: revisionSchema,
});

const progressSchema = z.object({
  revision: revisionSchema,
  processing: z.boolean(),
  utterances: z.array(z.object({ id: z.string().min(1), text: z.string() })),
});

const turnSchema = progressSchema.extend({ turnId: z.uuid() });

class SessionRequestError extends Error {
  constructor(readonly status: number, readonly body: z.infer<typeof apiErrorEnvelopeSchema> | undefined) {
    super(body?.error.message ?? "상담 서버에 연결하지 못했습니다. 다시 시도해 주세요.");
  }
}

async function request(path: string, signal: AbortSignal, body?: object, token?: string) {
  signal.throwIfAborted();
  const headers = new Headers();
  if (body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new SessionRequestError(response.status, apiErrorEnvelopeSchema.safeParse(payload).data);
  }
  return successEnvelopeSchema.parse(payload).data;
}

export function createTextSession() {
  let clientSessionKey: string | undefined;
  let session: z.infer<typeof sessionSchema> | undefined;
  let pending: { commandId: string; baseRevision: number; text: string } | undefined;
  const displayedUtterances = new Set<string>();

  return async function sendTurn(text: string, signal: AbortSignal) {
    clientSessionKey ??= crypto.randomUUID();
    session ??= sessionSchema.parse(await request("/api/sessions", signal, { clientSessionKey, inputMode: "text" }));

    if (pending?.text !== text) {
      pending = { commandId: crypto.randomUUID(), baseRevision: session.revision, text };
    }

    const path = `/api/sessions/${session.sessionId}`;
    let turn;
    try {
      turn = turnSchema.parse(await request(`${path}/turns`, signal, { ...pending, inputMode: "text" }, session.citizenToken));
    } catch (error) {
      if (error instanceof SessionRequestError && error.status === 409 && error.body?.currentRevision !== undefined) {
        session.revision = error.body.currentRevision;
        pending = undefined;
      }
      throw error;
    }

    let progress: z.infer<typeof progressSchema> = turn;
    const replies = new Map<string, string>();
    while (true) {
      session.revision = Math.max(session.revision, progress.revision);
      for (const { id, text } of progress.utterances) {
        if (text.trim() && !displayedUtterances.has(id)) replies.set(id, text);
      }
      if (!progress.processing) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
      progress = progressSchema.parse(await request(path, signal, undefined, session.citizenToken));
    }

    pending = undefined;
    for (const id of replies.keys()) displayedUtterances.add(id);
    return [...replies.values()];
  };
}

export function turnErrorMessage(error: unknown) {
  return error instanceof SessionRequestError ? error.message : "전송 결과를 확인하지 못했습니다. 다시 시도해 주세요.";
}
