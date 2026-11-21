import { LoginForm } from "./login-form";
import { Suspense } from "react";

async function LoginContent({ searchParams }: { searchParams: Promise<{ role?: string; error?: string }> }) {
  const params = await searchParams;
  const role = params.role === "counselor" ? "counselor" : "citizen";
  return <LoginForm role={role} initialError={!!params.error} />;
}

export default function LoginPage(props: { searchParams: Promise<{ role?: string; error?: string }> }) {
  return <Suspense fallback={<p>로그인 화면을 불러오고 있습니다.</p>}><LoginContent {...props} /></Suspense>;
}
