export type ConsultationSummary = { business: string; region: string; date: string; summary: string };

export const summaryKey = "120bridge:confirmed-summary";
export const defaultSummary: ConsultationSummary = {
  business: "",
  region: "",
  date: "",
  summary: "",
};

export const summaryFields = [
  ["business", "사업"], ["region", "지역"], ["date", "신청일"], ["summary", "민원 요약"],
] as const;

export function parseSummary(value: string | null): ConsultationSummary {
  if (!value) return defaultSummary;
  try {
    const data: unknown = JSON.parse(value);
    if (typeof data === "object" && data !== null && summaryFields.every(([key]) => typeof (data as Record<string, unknown>)[key] === "string")) return data as ConsultationSummary;
  } catch {
    return { ...defaultSummary, summary: value };
  }
  return defaultSummary;
}
