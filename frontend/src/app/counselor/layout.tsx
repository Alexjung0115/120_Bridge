import { redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { Suspense, type ReactNode } from "react";
import { canAccess } from "@/lib/supabase/access";
import { connection } from "next/server";

async function CounselorGuard({ children }: { children: ReactNode }) {
  await connection();
  const { data: { user } } = await (await serverSupabase()).auth.getUser();
  if (!canAccess(user, "counselor")) redirect("/login?role=counselor");
  return children;
}

export default function CounselorLayout({ children }: LayoutProps<"/counselor">) {
  return <Suspense fallback={<p>로그인 상태를 확인하고 있습니다.</p>}><CounselorGuard>{children}</CounselorGuard></Suspense>;
}
