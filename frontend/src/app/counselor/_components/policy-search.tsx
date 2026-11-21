import { Card } from "@/components/ui/card";

export function PolicySearch() {
  return (
    <Card as="section" tone="console" aria-labelledby="policy-title" className="min-w-0 p-5 sm:p-7 lg:col-span-2 xl:col-span-1">
      <h2 id="policy-title" className="text-2xl font-bold">정책 검색</h2>
      <label className="sr-only" htmlFor="policy-search">정책 검색어</label>
      <input id="policy-search" disabled placeholder="정책 검색 준비 중" className="mt-6 w-full rounded-full border border-border-gray px-5 py-3 text-base disabled:bg-background-gray-subtler" />
      <div className="mt-8 border-b border-border-gray pb-2"><h3 className="text-lg font-bold">검색 결과</h3></div>
      <p className="py-6 text-sm text-text-subtle">정책 검색은 아직 연결되지 않았습니다.</p>
    </Card>
  );
}
