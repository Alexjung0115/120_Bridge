"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { BridgeBrand } from "@/components/bridge-brand";
import { Button } from "@/components/ui/button";

export function LoginForm({ role, initialError = false }: { role: "citizen" | "counselor"; initialError?: boolean }) {
  const [email, setEmail] = useState("");
  const [sentEmail, setSentEmail] = useState("");
  const [error, setError] = useState(initialError ? "인증 링크가 만료되었거나 사용할 수 없습니다. 새 링크를 요청해 주세요." : "");
  const [busy, setBusy] = useState(false);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!url || !key) {
      setError("로그인 서비스를 사용할 수 없습니다.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createBrowserClient(url, key);
      const address = email.trim();
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set("role", role);
      const { error } = await supabase.auth.signInWithOtp({ email: address, options: {
        shouldCreateUser: role === "citizen", emailRedirectTo: callback.toString(),
      } });
      if (error) throw error;
      setSentEmail(address);
    } catch {
      setError("인증 메일을 보내지 못했습니다. 이메일과 계정 상태를 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col gap-8 px-6 py-10">
      <BridgeBrand />
      <section aria-labelledby="login-title" className="flex flex-col gap-5">
        <div>
          <h1 id="login-title" className="type-heading-large text-text-bolder">
            {role === "citizen" ? "시민 로그인" : "상담사 로그인"}
          </h1>
          <p className="mt-3 type-body-medium text-text-subtle">이메일로 받은 로그인 링크를 눌러 주세요.</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {!sentEmail ? (
            <>
              <label htmlFor="email" className="type-body-medium-bold">
                이메일
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="min-h-14 rounded-lg border border-border-gray px-4"
                placeholder="이메일 주소"
              />
            </>
          ) : (
            <>
              <p role="status" className="type-body-medium">{sentEmail}로 인증 메일을 보냈습니다. 같은 브라우저에서 이메일의 링크를 열어 주세요.</p>
              <button
                type="button"
                onClick={() => {
                  setSentEmail("");
                  setError("");
                }}
                className="self-start underline"
              >
                이메일 변경 또는 재발송
              </button>
            </>
          )}
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
          {!sentEmail && <Button disabled={busy}>{busy ? "처리 중..." : "인증 메일 받기"}</Button>}
        </form>
      </section>
      <Link href={role === "citizen" ? "/login?role=counselor" : "/"} className="text-text-primary underline w-full text-center">
        {role === "citizen" ? "상담사 로그인" : "시민 로그인"}
      </Link>
    </main>
  );
}
