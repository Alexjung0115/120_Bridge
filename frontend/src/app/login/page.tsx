import { redirect } from "next/navigation";
import { Suspense } from "react";

async function LoginRedirect({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await searchParams;
  return redirect(role === "counselor" ? "/counselor" : "/citizen");
}

export default function LoginPage(props: { searchParams: Promise<{ role?: string }> }) {
  return <Suspense fallback={<p>화면을 불러오는 중입니다.</p>}><LoginRedirect {...props} /></Suspense>;
}
