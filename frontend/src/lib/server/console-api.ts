import { z } from "zod";
import { getConsoleAgentId } from "./auth";
import { noStoreJson } from "./limits";
import { createRequestContext } from "./request-log";
import { sessionError } from "./session-api";

type Readers = { queue(cursor: string | null): Promise<unknown>; detail(id: string): Promise<unknown> };

export function createConsoleApi(makeStore: () => Readers, config: Parameters<typeof getConsoleAgentId>[1]) {
  async function read(request: Request, operation: (store: Readers) => Promise<unknown>, key: string | null) {
    const { requestId } = createRequestContext("console");
    if (!getConsoleAgentId(request.headers, config)) return sessionError(requestId, 401, "unauthorized");
    if (key !== null && !z.uuid().safeParse(key).success) return sessionError(requestId, 400, "invalid_request");
    try {
      const data = await operation(makeStore());
      return data === null
        ? sessionError(requestId, 404, "not_found")
        : noStoreJson({ schemaVersion: 1, requestId, data });
    } catch {
      return sessionError(requestId, 503, "storage_unavailable");
    }
  }

  return {
    queue(request: Request) {
      const cursor = new URL(request.url).searchParams.get("cursor");
      return read(request, (store) => store.queue(cursor), cursor);
    },
    detail(request: Request, id: string) {
      return read(request, (store) => store.detail(id), id);
    },
  };
}