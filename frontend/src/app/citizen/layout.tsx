import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { Suspense, type ReactNode } from "react";
import { canAccess } from "@/lib/supabase/access";
import { connection } from "next/server";

export const metadata: Metadata = { title: "시민 화면 | 120Bridge" };

async function CitizenGuard({ children }: { children: ReactNode }) {
  await connection();
  const { data: { user } } = await (await serverSupabase()).auth.getUser();
  if (!canAccess(user, "citizen")) redirect("/login?role=citizen");
  return children;
}

export default function CitizenLayout({ children }: LayoutProps<"/citizen">) {
  return <Suspense fallback={<p>로그인 상태를 확인하고 있습니다.</p>}><CitizenGuard>{children}</CitizenGuard></Suspense>;
}
