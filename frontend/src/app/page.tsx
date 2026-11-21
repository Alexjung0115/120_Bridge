import Link from "next/link";
import { BridgeBrand } from "@/components/bridge-brand";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col bg-background-white px-6 pb-6 pt-8 sm:max-w-xl sm:px-10">
      <header aria-label="120Bridge"><BridgeBrand href="/" /></header>
      <section aria-labelledby="welcome-title" className="mt-10 flex flex-1 flex-col">
        <h1 id="welcome-title" className="type-heading-xlarge text-text-bolder">이용하실 화면을<br />선택해주세요</h1>
        <p className="mt-4 type-body-small text-text-subtle">상담을 시작하거나 상담사 화면으로 이동할 수 있습니다.</p>
      </section>
      <nav aria-label="화면 선택" className="flex flex-col guide-gap-4">
        <Link href="/citizen" className={buttonVariants({ className: "w-full" })}>시민 상담</Link>
        <Link href="/counselor" className={buttonVariants({ variant: "outline", className: "w-full" })}>상담사 화면</Link>
      </nav>
    </main>
  );
}
