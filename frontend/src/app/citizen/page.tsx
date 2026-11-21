import { buttonVariants } from "@/components/ui/button";
import { BridgeBrand } from "@/components/bridge-brand";
import Link from "next/link";
import Image from "next/image";
import inquiryIcon from "@/assets/icon/inquiry.svg";

function VoiceIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none">
      <rect x="9" y="3" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3m-3 0h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function TextIcon({ className }: { className?: string }) {
  return <Image src={inquiryIcon} alt="" aria-hidden="true" className={className} />;
}

function SoundWave() {
  return (
    <div aria-hidden="true" className="flex size-26 items-center justify-center rounded-[2rem] bg-element-primary-lighter">
      <div className="flex size-19 items-center justify-center rounded-3xl bg-element-primary text-icon-inverse">
        <svg className="size-icon-40" viewBox="0 0 40 40" fill="none">
          <path d="M3 18v4M10 12v16M17 6v28M23 13v14M30 10v20M37 17v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

export default function CitizenPage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col sm:max-w-xl sm:px-10 bg-background-white px-6 pb-6 pt-8">
      <header aria-label="120Bridge" className="flex items-center justify-between guide-gap-3">
        <BridgeBrand />
        <Link href="/" className="type-body-small text-text-primary underline underline-offset-4">화면 선택</Link>
      </header>

      <section aria-labelledby="citizen-welcome" className="mt-10">
        <p className="type-body-xsmall text-text-primary">다산 콜센터 보이는 전화</p>
        <h1 id="citizen-welcome" className="mt-4 type-heading-xlarge text-text-bolder">
          아래 버튼을 눌러<br />상담을 시작해주세요
        </h1>
      </section>

      <div className="flex min-h-36 flex-1 items-center justify-center py-8">
        <SoundWave />
      </div>

      <section aria-label="상담 방식 선택" className="flex flex-col guide-gap-4">
        <Link href="/citizen/history" className={buttonVariants({ variant: "outline", className: "w-full" })}>상담 내역</Link>
        <Link href="/citizen/voice" className={buttonVariants({ className: "w-full" })}>
          <VoiceIcon className="size-icon-20" />
          음성 상담
        </Link>
        <Link href="/citizen/text" className={buttonVariants({ variant: "outline", className: "w-full" })}>
          <TextIcon className="size-icon-20" />
          텍스트 상담
        </Link>
        <p className="text-center type-body-xsmall text-text-subtle">
          음성 상담을 시작하면 마이크를 사용합니다.<br />
          주민등록번호 등 민감한 정보는 말씀하지 마세요.
        </p>
      </section>
    </main>
  );
}
