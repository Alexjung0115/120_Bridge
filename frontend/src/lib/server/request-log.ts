import { randomUUID } from "node:crypto";

type Endpoint = "session_create" | "session_read" | "session_turn" | "handoff" | "console";

export function createRequestContext(endpoint: Endpoint) {
  const requestId = randomUUID();

  return {
    requestId,
    logFields(status: number) {
      return { requestId, endpoint, status };
    },
  };
}