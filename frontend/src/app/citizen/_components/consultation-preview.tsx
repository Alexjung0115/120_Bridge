import Link from "next/link";

type ConsultationPreviewProps = {
  mode: "voice" | "text";
};

export function ConsultationPreview({ mode }: ConsultationPreviewProps) {
  const isVoice = mode === "voice";
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col bg-background-white px-6 pb-6 pt-8">
      <header className="flex items-center justify-between guide-gap-5">
        <Link href="/citizen" className="type-body-small text-text-primary underline underline-offset-4">
          이전 화면
        </Link>
        <p className="type-body-small-bold text-text-bolder">
          {isVoice ? "음성 상담" : "텍스트 상담"}
        </p>
      </header>

      <section aria-labelledby="consultation-title" className="mt-10 flex flex-1 flex-col">
        <h1 id="consultation-title" className="mt-3 type-heading-large text-text-bolder">
          {isVoice ? "음성 상담" : "텍스트 상담"}
        </h1>
        <div className="mt-6 rounded-guide-xlarge bg-element-gray-lighter guide-p-8">
          <p className="type-body-medium text-text-basic">상담 화면을 준비하고 있습니다.</p>
          <p className="mt-2 type-body-small text-text-subtle">
            {isVoice ? "음성 입력과 상담 기능은 아직 연결되지 않았습니다." : "문자 입력과 상담 기능은 아직 연결되지 않았습니다."}
          </p>
        </div>
      </section>

      <nav aria-label="상담 방식 변경" className="mt-8 flex flex-col guide-gap-4">
        <Link
          href={isVoice ? "/citizen/text" : "/citizen/voice"}
          className="flex min-h-14 items-center justify-center rounded-guide-xlarge border border-border-primary px-4 type-body-small-bold text-text-primary"
        >
          {isVoice ? "텍스트 상담으로 변경" : "음성 상담으로 변경"}
        </Link>
        <Link href="/citizen" className="flex min-h-12 items-center justify-center type-body-small text-text-subtle underline underline-offset-4">
          처음으로 돌아가기
        </Link>
      </nav>
    </main>
  );
}
