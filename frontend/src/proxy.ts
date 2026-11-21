import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canAccess } from "@/lib/supabase/access";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const home = request.nextUrl.pathname === "/";
  if (!url || !key) return home ? response : new NextResponse("인증 서비스가 설정되지 않았습니다.", { status: 503 });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (home) {
    if (!canAccess(user, "citizen")) return response;
    const target = request.nextUrl.clone();
    target.pathname = canAccess(user, "counselor") ? "/counselor" : "/citizen";
    target.search = "";
    const redirect = NextResponse.redirect(target);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }
  const counselor = request.nextUrl.pathname.startsWith("/counselor");
  if (!canAccess(user, counselor ? "counselor" : "citizen")) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.search = counselor ? "?role=counselor" : "?role=citizen";
    const redirect = NextResponse.redirect(target);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }
  return response;
}

export const config = { matcher: ["/", "/citizen/:path*", "/counselor/:path*"] };
