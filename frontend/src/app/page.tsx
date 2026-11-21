import { LoginForm } from "./login/login-form";
import { Suspense } from "react";

async function HomeContent({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return <LoginForm role="citizen" initialError={!!(await searchParams).error} />;
}

export default function Home(props: { searchParams: Promise<{ error?: string }> }) {
  return <Suspense fallback={<p>로그인 화면을 불러오고 있습니다.</p>}><HomeContent {...props} /></Suspense>;
}
