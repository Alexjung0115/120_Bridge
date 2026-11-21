import { createCitizenHistoryApi } from "@/lib/server/citizen-history";
import { createSupabaseRpc } from "@/lib/store/snapshot";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ error: { message: "상담 내역을 불러올 수 없습니다." } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const rpc = createSupabaseRpc(url, key);
  return createCitizenHistoryApi((id) => rpc("bridge_load_session", { p_session: id }))(request, (await context.params).id);
}
