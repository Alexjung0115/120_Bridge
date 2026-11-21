import { NextResponse, type NextRequest } from "next/server";

export function GET(request: NextRequest) {
  const role = request.nextUrl.searchParams.get("role");
  return NextResponse.redirect(new URL(role === "counselor" ? "/counselor" : "/citizen", request.url));
}
