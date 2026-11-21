"use client";

import { Card } from "@/components/ui/card";
import { useState } from "react";
import Image from "next/image";
import openNewWindowIcon from "@/assets/icon/open-new-window.svg";
import { SortSelect } from "./sort-select";


const policies = [
  { title: "마포구 1인 안심생활 키트", date: "2026.10.01", source: "마포구청", description: "마포구 내 1인 가구의 안전한 생활 여건 보장 및 치안 사업 안내" },
  { title: "안심생활 키트 정책 개정안", date: "2026.10.01", source: "서울특별시", description: "안심 키트 지원사업 운영 기준, 신청자격, 지원 내용 안내" },
];

export function PolicySearch() {
  const [query, setQuery] = useState("");
  const [policySort, setPolicySort] = useState("최신순");
  const results = policies
    .filter((policy) => `${policy.title} ${policy.source} ${policy.description}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => policySort === "최신순" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));

  return (
    <Card as="section" tone="console" id="policies" aria-labelledby="policy-title" className="min-w-0 p-5 sm:p-7 lg:col-span-2 xl:col-span-1">
      <h2 id="policy-title" className="text-2xl font-bold">정책 검색</h2>
      <label className="sr-only" htmlFor="policy-search">정책 검색어</label>
      <input id="policy-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="검색어를 입력해주세요." className="mt-6 w-full rounded-full border border-border-gray px-5 py-3 text-base outline-offset-2" />
      <div className="mt-8 flex items-center justify-between gap-3 border-b border-border-gray pb-2">
        <h3 className="text-lg font-bold">검색 결과 ({results.length}건)</h3>
        <SortSelect label="정책 정렬" value={policySort} onChange={setPolicySort} />
      </div>
      {results.map((policy) => (
        <article key={policy.title} className="border-b border-border-gray py-6">
          <h4 className="flex items-center gap-2 text-lg font-bold text-text-primary">{policy.title}<Image src={openNewWindowIcon} alt="" width={18} height={18} color="" /></h4>
          <dl className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <div className="flex items-center gap-2"><dt className="rounded bg-element-gray-light px-2 py-1">시행일</dt><dd>{policy.date}</dd></div>
            <div className="flex items-center gap-2"><dt className="rounded bg-element-gray-light px-2 py-1">출처</dt><dd>{policy.source}</dd></div>
          </dl>
          <p className="mt-4 text-sm leading-relaxed">{policy.description}</p>
        </article>
      ))}
      {results.length === 0 && <p role="status" className="py-6 text-sm text-text-subtle">{query.trim() ? "검색 결과가 없습니다. 다른 검색어로 다시 검색해주세요." : "표시할 정책 자료가 없습니다."}</p>}
    </Card>
  );
}
