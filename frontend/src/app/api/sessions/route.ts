import { randomUUID } from "node:crypto";
import { configuredSessionApi } from "../../../lib/server/session-runtime";
import { sessionError } from "../../../lib/server/session-api";

export async function POST(request: Request) {
  try {
    return await configuredSessionApi().create(request);
  } catch {
    return sessionError(randomUUID(), 503, "storage_unavailable");
  }
}