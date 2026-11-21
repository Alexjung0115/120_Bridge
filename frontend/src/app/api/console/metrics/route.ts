import { z } from "zod";
import { schemaVersion } from "../../../../lib/contracts";
import { aggregateMetrics } from "../../../../lib/metrics/aggregate";
import { getConsoleAgentId } from "../../../../lib/server/auth";
import { noStoreJson } from "../../../../lib/server/limits";
import { createRequestContext } from "../../../../lib/server/request-log";
import { sessionError } from "../../../../lib/server/session-api";
import { createSupabaseRpc } from "../../../../lib/store/snapshot";

export async function GET(request: Request) {
  const { requestId } = createRequestContext("console");
  if (!getConsoleAgentId(request.headers, { CONSOLE_TOKEN: process.env.CONSOLE_TOKEN, CONSOLE_AGENT_ID: process.env.CONSOLE_AGENT_ID })) return sessionError(requestId, 401, "unauthorized");
  const query = new URL(request.url).searchParams;
  const now = Date.now();
  const windowEnd = query.get("windowEnd") ?? new Date(now).toISOString();
  const windowStart = query.get("windowStart") ?? new Date(now - 86_400_000).toISOString();
  const time = z.iso.datetime({ offset: true });
  if (!time.safeParse(windowStart).success || !time.safeParse(windowEnd).success ||
      Date.parse(windowStart) > Date.parse(windowEnd)) {
    return sessionError(requestId, 400, "invalid_request");
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return sessionError(requestId, 503, "storage_unavailable");
  try {
    const rpc = createSupabaseRpc(url, key);
    const input = await rpc<Pick<Parameters<typeof aggregateMetrics>[0], "sessions" | "events">>(
      "bridge_console_metrics_input", { p_end: windowEnd });
    return noStoreJson({ schemaVersion, requestId, data: aggregateMetrics({ ...input, windowStart, windowEnd }) });
  } catch {
    return sessionError(requestId, 503, "storage_unavailable");
  }
}