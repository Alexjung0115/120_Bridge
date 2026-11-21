"use client";

import { useSyncExternalStore } from "react";
import { parseSummary, summaryFields, summaryKey } from "../_lib/summary";
import { readStorage } from "../_lib/storage";
import { SummaryRow } from "./summary-row";

const subscribe = () => () => {};

export function ConfirmedSummary() {
  const saved = useSyncExternalStore(subscribe, () => readStorage("session", summaryKey), () => null);
  if (!saved) return <div className="text-sm text-text-subtle">확인된 민원 내역이 없습니다. 이전 화면에서 내용을 확인해주세요.</div>;
  const summary = parseSummary(saved);
  return summaryFields.map(([key, label]) => (
    <SummaryRow key={key} label={label}>
      <span className="whitespace-pre-wrap break-words">{summary[key]}</span>
    </SummaryRow>
  ));
}
