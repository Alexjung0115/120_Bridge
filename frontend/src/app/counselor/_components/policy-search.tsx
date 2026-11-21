import { Card } from "@/components/ui/card";

export function PolicySearch() {
  return (
    <Card as="section" tone="console" aria-labelledby="policy-title" className="p-5 sm:p-7">
      <h2 id="policy-title" className="text-2xl font-bold">정책 검색</h2>
      <p className="mt-4 text-sm text-text-subtle">정책 검색은 아직 연결되지 않았습니다.</p>
    </Card>
  );
}
