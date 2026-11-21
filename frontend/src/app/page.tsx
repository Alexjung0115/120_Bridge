import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center guide-gap-7 guide-p-8">
      <div>
        <h1 className="type-heading-xlarge text-text-bolder">120Bridge</h1>
        <p className="mt-3 type-body-medium text-text-subtle">
          화면을 선택해 주세요.
        </p>
      </div>
      <nav aria-label="화면 선택" className="flex flex-wrap guide-gap-4">
        <Link
          href="/citizen"
          className="rounded-guide-medium-1 bg-element-primary px-6 py-3 type-body-medium-bold text-text-inverse-static"
        >
          시민 화면
        </Link>
        <Link
          href="/counselor"
          className="rounded-guide-medium-1 border border-border-gray bg-background-white px-6 py-3 type-body-medium-bold text-text-basic"
        >
          상담사 화면
        </Link>
      </nav>
    </main>
  );
}
