import { createCounselorCasesApi } from "@/lib/server/counselor-cases";
import { createSupabaseClient } from "@/lib/store/snapshot";

export async function GET(request: Request) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ error: { message: "상담 목록을 불러오지 못했습니다." } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const client = createSupabaseClient(url, key);
  return createCounselorCasesApi(async (status, cursor) => {
    const result = await client.rpc("bridge_console_cases", { p_status: status, p_after: cursor }).retry(false).abortSignal(AbortSignal.timeout(5_000));
    if (!result.error) return { rows: result.data, allStatuses: true };
    if (result.error.code !== "PGRST202" || (status !== "all" && status !== "queued")) throw result.error;
    const queue = await client.rpc("bridge_console_queue", { p_after: cursor }).retry(false).abortSignal(AbortSignal.timeout(5_000));
    if (queue.error) throw queue.error;
    const data = queue.data as { items: { sessionId: string; status: string; receivedAt: string }[]; nextCursor: string | null };
    const rows = data.items.map((item) => ({ session_id: item.sessionId, payload: { status: item.status, receivedAt: item.receivedAt } }));
    // The existing queue RPC returns 50 rows plus a cursor; fetch one more to keep pagination consistent.
    if (data.nextCursor) {
      const next = await client.rpc("bridge_console_queue", { p_after: data.nextCursor }).retry(false).abortSignal(AbortSignal.timeout(5_000));
      if (next.error) throw next.error;
      const first = (next.data as typeof data).items[0];
      if (first) rows.push({ session_id: first.sessionId, payload: { status: first.status, receivedAt: first.receivedAt } });
    }
    return { rows, allStatuses: false };
  })(request);
}
