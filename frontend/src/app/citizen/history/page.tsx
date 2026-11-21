"use client";

import { Card } from "@/components/ui/card";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { BridgeBrand } from "@/components/bridge-brand";
import { historyDateFormat, parseHistory, readHistorySnapshot, statusLabel, subscribeHistory } from "../_lib/history";

export default function HistoryPage() {
  const raw = useSyncExternalStore(subscribeHistory, readHistorySnapshot, () => null);
  const entries = parseHistory(raw).sort((a, b) => b.createdAt - a.createdAt);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 bg-background-white px-6 py-8 sm:px-10">
      <header aria-label="120Bridge" className="flex items-center gap-3">
        <BridgeBrand />
      </header>
      <h1 className="type-heading-large text-text-bolder">상담 내역</h1>
      {entries.length === 0 ? (
        <Card as="p" className="p-6 text-center type-body-small text-text-subtle">아직 상담 내역이 없습니다.</Card>
      ) : (
        <ul aria-label="최근 상담부터" className="flex flex-col gap-4">
          {entries.map((entry) => (
            <Card as="li" key={entry.id} className="min-w-0 p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-md px-2 py-1 type-body-xsmall ${entry.status === "unresolved" ? "bg-element-warning-lighter text-text-warning" : "bg-element-success-lighter text-text-success"}`}>
                  {statusLabel[entry.status]}
                </span>
                <time dateTime={new Date(entry.createdAt).toISOString()} className="type-body-xsmall text-text-subtle">{historyDateFormat.format(entry.createdAt)}</time>
              </div>
              <h2 className="mt-3 break-words type-body-medium-bold">{entry.title}</h2>
              <Link href={`/citizen/history/${encodeURIComponent(entry.id)}`} className={buttonVariants({ variant: "outline", size: "compact", className: "mt-4 w-full sm:w-auto" })}>
                상담 상세 보기
              </Link>
            </Card>
          ))}
        </ul>
      )}
      <Link href="/citizen" className={buttonVariants({ variant: entries.length ? "outline" : "default" })}>새 상담 시작</Link>
    </main>
  );
}
