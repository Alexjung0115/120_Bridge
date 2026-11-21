"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, MessageCircleMore, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GovernmentIcon } from "@/app/citizen/_components/government-icon";
import { settleHandoff, useHandoff } from "../citizen/_lib/handoff";

type Case = { id: string; title: string; time: string; status: "대기" | "완료"; subject: string; region: string; type: string; summary: string; messages: string[] };
const examples: Case[] = [
  { id: "120-1109-024", title: "지원사업 처리 결과", time: "방금 전", status: "대기", subject: "1인가구 안심 생활 키트 수령 문의", region: "마포구", type: "지원 사업 문의", summary: "마포구 안심생활 키트를 신청한 후 처리 결과를 안내받지 못했습니다. 진행 상황과 담당 부서를 알고 싶습니다.", messages: ["마포구 안심생활 키트를 신청했는데 아직 처리 결과를 못 받았어요.", "10월 15일 신청이시군요. 변경된 정책을 기준으로 확인해보겠습니다."] },
  { id: "120-1109-025", title: "상담사 즉시 연결 요청", time: "3분 전", status: "대기", subject: "상담사 연결 요청", region: "미확인", type: "상담사 연결", summary: "시민이 상담사와 직접 연결을 요청했습니다.", messages: ["상담사와 연결해 주세요."] },
  { id: "120-1109-026", title: "생활 불편 신고", time: "12분 전", status: "완료", subject: "생활 불편 신고", region: "미확인", type: "생활 불편", summary: "생활 불편 신고에 관한 상담입니다.", messages: ["생활 불편을 신고하고 싶습니다."] },
];
const policies = [
  { title: "마포구 1인 안심생활 키트", date: "2026.10.01", source: "마포구청", description: "마포구 내 1인 가구의 안전한 생활 여건 보장 및 치안 사업 안내" },
  { title: "안심생활 키트 정책 개정안", date: "2026.10.01", source: "서울특별시", description: "안심 키트 지원사업 운영 기준, 신청자격, 지원 내용 안내" },
];

export default function CounselorPage() {
  const request = useHandoff();
  const [selected, setSelected] = useState("120-1109-024");
  const [filter, setFilter] = useState("전체 상태");
  const [sort, setSort] = useState("최신순");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState("");
  const live: Case | null = request?.status === "waiting" ? { id: request.id, title: "시민 상담 연결 요청", time: "방금 전", status: "대기", subject: "상담사 연결 요청", region: "미확인", type: request.channel === "voice" ? "음성 상담" : "텍스트 상담", summary: "시민이 상담사 연결을 요청했습니다. 상세 내용은 아직 전달되지 않았습니다.", messages: [] } : null;
  const all = useMemo(() => live ? [live, ...examples] : examples, [request?.id, request?.status, request?.channel]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = all.filter((item) => filter === "전체 상태" || item.status === filter);
  const ordered = sort === "오래된순" ? [...list].reverse() : list;
  const current = ordered.find((item) => item.id === selected) ?? ordered[0] ?? null;
  const results = policies.filter((policy) => `${policy.title} ${policy.source} ${policy.description}`.includes(query.trim()));

  return <div className="min-h-screen bg-[#f3f4f6] text-[#24282e]">
    <header className="flex min-h-20 flex-wrap items-center gap-x-8 gap-y-2 bg-white px-5 py-4 lg:px-10">
      <Link href="/" className="flex items-center gap-2 whitespace-nowrap" aria-label="120 Bridge 홈"><GovernmentIcon /><strong className="text-3xl font-bold text-[#286af1]">120</strong><span className="text-xl tracking-wide">BRIDGE</span></Link>
      <span className="hidden h-8 w-px bg-slate-200 sm:block" />
      <p className="font-bold">통합민원상담시스템 (담당자 콘솔)</p>
      <div className="ml-auto flex items-center gap-6 text-sm"><a href="https://www.korea.kr/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-semibold">정책 자료실 <ExternalLink size={16} /></a><span className="flex items-center gap-2"><span className="rounded-xl bg-blue-100 px-3 py-2 font-bold text-blue-600">김</span>김가현 상담사</span></div>
    </header>
    <main className="mx-auto grid max-w-[2000px] gap-5 px-4 py-8 lg:grid-cols-[280px_minmax(0,1.3fr)] xl:grid-cols-[minmax(250px,0.55fr)_minmax(0,1.3fr)_minmax(0,1fr)] xl:gap-7 xl:px-8 xl:py-20">
      <section aria-labelledby="queue-title" className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-2"><h1 id="queue-title" className="text-2xl font-bold">상담 대기</h1><span className="rounded-lg bg-gray-100 px-3 py-1 text-sm">대기 {all.filter((item) => item.status === "대기").length}건</span></div>
        <div className="my-4 flex justify-between gap-2 text-sm"><label><span className="sr-only">상태 필터</span><select value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-full bg-white py-1"><option>전체 상태</option><option>대기</option><option>완료</option></select></label><label><span className="sr-only">상담 정렬</span><select value={sort} onChange={(e) => setSort(e.target.value)} className="bg-white py-1"><option>최신순</option><option>오래된순</option></select></label></div>
        <div className="space-y-3">{ordered.map((item) => <button key={item.id} type="button" onClick={() => { setSelected(item.id); setError(""); }} aria-pressed={current?.id === item.id} className={`w-full rounded-2xl border p-4 text-left ${current?.id === item.id ? "border-2 border-blue-600 bg-blue-50" : "border-slate-300 bg-white"}`}><span className="flex justify-between gap-2 text-sm text-slate-500"><span className="truncate">{item.id === request?.id ? "새 연결 요청" : item.id}</span><span className="shrink-0">{item.time}</span></span><span className="mt-3 flex items-center justify-between gap-2"><span className="font-medium">{item.title}</span><span className={`shrink-0 rounded px-2 py-1 text-xs font-bold ${item.status === "대기" ? "bg-amber-50 text-amber-600" : "bg-blue-600 text-white"}`}>{item.status}</span></span></button>)}{ordered.length === 0 && <p className="py-4 text-sm text-slate-500">해당 상태의 상담이 없습니다.</p>}</div>
      </section>
      <section aria-labelledby="detail-title" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
        <h2 id="detail-title" className="text-2xl font-bold">상담 상세</h2>
        {current ? <>
        <div className="mt-6 flex flex-wrap justify-between gap-2 text-lg"><strong>상담번호 {current.id === request?.id ? "새 연결 요청" : current.id}</strong><span>접수 일시 {current.id === request?.id ? "방금 전" : "2026-10-26"}</span></div>
        <dl className="mt-5 grid grid-cols-[100px_1fr] overflow-hidden rounded border border-slate-300 text-sm sm:text-base">{[["민원 제목", current.subject], ["민원 지역", current.region], ["처리상태", current.status === "완료" ? "완료" : "접수 완료"], ["상담 유형", current.type]].map(([label, value]) => <div key={label} className="contents"><dt className="border-b border-white/30 bg-[#0873c4] px-3 py-2 text-center font-bold text-white">{label}</dt><dd className="border-b border-slate-200 px-3 py-2">{value}</dd></div>)}</dl>
        <div className="my-5 border-t border-slate-300" />
        <div className="rounded border border-slate-300 bg-gray-100 p-3"><h3 className="flex items-center gap-2 text-lg font-bold"><MessageCircleMore size={23} /> AI 요약</h3><p className="mt-3 whitespace-pre-wrap">{current.summary || "요약 정보가 없습니다."}</p></div>
        <div className="mt-5 rounded border border-slate-300 p-3"><button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)} className="flex w-full items-center justify-between border-b border-slate-300 pb-3 text-left font-medium text-[#173e70]">전체 대화 기록 {expanded ? "접기" : "펼치기"}<ChevronDown className={expanded ? "rotate-180" : ""} /></button>{expanded && <div className="flex min-h-48 flex-col justify-end gap-3 pt-4">{current.messages.length ? current.messages.map((message, index) => <p key={index} className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${index % 2 ? "self-end bg-gray-100" : "self-start border border-blue-400 bg-blue-50"}`}>{message}</p>) : <p className="text-sm text-slate-500">전달된 대화 기록이 없습니다.</p>}</div>}</div>
        {current.id === request?.id && request.status === "waiting" ? <Button className="mt-5 w-full rounded-xl bg-[#286af1]" onClick={() => setError(settleHandoff(request.id, "connected") ? "" : "요청이 만료되었거나 처리하지 못했습니다.")}><Phone size={20} /> 상담 수락</Button> : null}
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        {request?.status === "connected" && current.id === request.id && <p role="status" className="mt-3 text-sm text-blue-700">상담 연결 요청을 수락했습니다.</p>}
        </> : <div role="status" className="flex min-h-64 flex-col items-center justify-center text-center text-slate-500"><p>표시할 상담이 없습니다.</p><p className="mt-2 text-sm">상담이 접수되면 이곳에서 상세 내용을 확인할 수 있습니다.</p></div>}
      </section>
      <section id="policies" aria-labelledby="policy-title" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-2 xl:col-span-1 sm:p-7"><h2 id="policy-title" className="text-2xl font-bold">정책 검색</h2><label className="sr-only" htmlFor="policy-search">정책 검색어</label><input id="policy-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="검색어를 입력해주세요." className="mt-4 w-full rounded-full border border-slate-400 px-5 py-3 text-sm" /><h3 className="mt-7 border-b border-slate-400 pb-2 text-lg font-bold">검색 결과 ({results.length}건)</h3>{results.map((policy) => <article key={policy.title} className="border-b border-slate-300 py-6"><h4 className="text-lg font-bold text-blue-700">{policy.title}</h4><div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm"><span><span className="mr-2 rounded bg-gray-200 px-2 py-1">시행일</span>{policy.date}</span><span><span className="mr-2 rounded bg-gray-200 px-2 py-1">출처</span>{policy.source}</span></div><p className="mt-4 text-sm">{policy.description}</p></article>)}{results.length === 0 && <p className="py-6 text-sm text-slate-500">{query.trim() ? "검색 결과가 없습니다. 다른 검색어로 다시 검색해주세요." : "표시할 정책 자료가 없습니다."}</p>}</section>
    </main>
  </div>;
}
