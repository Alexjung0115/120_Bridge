import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function HandoffPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="type-heading-large">상담사 연결</h1>
      <p>텍스트 상담 화면에서 상담사 연결을 요청할 수 있습니다.</p>
      <Link href="/citizen/text" className={buttonVariants()}>텍스트 상담으로 이동</Link>
    </main>
  );
}
