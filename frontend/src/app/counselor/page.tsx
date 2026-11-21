import { BridgeBrand } from "@/components/bridge-brand";
import { LiveQueue } from "./_components/live-queue";
import { PolicySearch } from "./_components/policy-search";
import { ExternalLink } from "lucide-react";

export default function CounselorPage() {
  return (
    <div className="min-h-screen bg-[#f3f4f6] text-[#24282e]">
      <header className="flex min-h-20 flex-wrap items-center gap-x-8 gap-y-2 bg-white px-5 py-4 lg:px-10">
        <BridgeBrand variant="counselor" />
        <span className="hidden h-8 w-px bg-slate-200 sm:block" />
        <p className="font-bold">통합민원상담시스템 (담당자 콘솔)</p>
        <a href="https://www.korea.kr/" target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-1 text-sm font-semibold">정책 자료실 <ExternalLink size={16} /></a>
      </header>
      <main className="mx-auto grid max-w-[2000px] gap-5 px-4 py-8 lg:grid-cols-[280px_minmax(0,1.3fr)] xl:grid-cols-[minmax(250px,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] xl:gap-7 xl:px-8 xl:py-20">
        <LiveQueue />
        <PolicySearch />
      </main>
    </div>
  );
}
