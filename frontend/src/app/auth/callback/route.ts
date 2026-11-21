import { NextResponse, type NextRequest } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";
import { canAccess } from "@/lib/supabase/access";

export async function GET(request: NextRequest) {
  const role = request.nextUrl.searchParams.get("role") === "counselor" ? "counselor" : "citizen";
  const code = request.nextUrl.searchParams.get("code");
  const fail = () => NextResponse.redirect(new URL(`/login?role=${role}&error=auth`, request.url));
  if (!code) return fail();
  try {
    const supabase = await serverSupabase();
    const flowId = request.nextUrl.searchParams.get("sb_flow_id");
    const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (error) return fail();
    const { data: { user } } = await supabase.auth.getUser();
    if (!canAccess(user, role)) {
      await supabase.auth.signOut();
      return fail();
    }
    return NextResponse.redirect(new URL(role === "counselor" ? "/counselor" : "/citizen", request.url));
  } catch {
    return fail();
  }
}
