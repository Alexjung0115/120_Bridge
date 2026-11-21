import type { ReactNode } from "react";

export function SummaryRow({
  label, children, inputId, compact = false,
}: { label: string; children: ReactNode; inputId?: string; compact?: boolean }) {
  return (
    <div className={compact ? "grid grid-cols-[4rem_minmax(0,1fr)] items-start gap-3" : "grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3"}>
      <dt className="text-text-subtle">{inputId ? <label htmlFor={inputId}>{label}</label> : label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
