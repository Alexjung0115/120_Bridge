import { randomUUID } from "node:crypto";
import { configuredSessionApi } from "../../../../lib/server/session-runtime";
import { sessionError } from "../../../../lib/server/session-api";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    return await configuredSessionApi().read(request, (await context.params).id);
  } catch {
    return sessionError(randomUUID(), 503, "storage_unavailable");
  }
}