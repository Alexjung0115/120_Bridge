import { BridgeBrand } from "@/components/bridge-brand";
import { LiveQueue } from "./_components/live-queue";
import { PolicySearch } from "./_components/policy-search";

export default function CounselorPage() {
  return (
    <div className="min-h-screen bg-[#f3f4f6] text-[#24282e]">
      <header className="flex min-h-20 items-center gap-8 bg-white px-5 py-4 lg:px-10">
        <BridgeBrand variant="counselor" />
        <p className="font-bold">통합민원상담시스템 (담당자 콘솔)</p>
      </header>
      <main><LiveQueue /><div className="mx-auto max-w-[2000px] px-4 py-8"><PolicySearch /></div></main>
    </div>
  );
}
