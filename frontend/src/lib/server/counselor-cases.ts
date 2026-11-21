import { z } from "zod";
import { noStoreJson } from "./limits";

const stateSchema = z.enum(["all", "queued", "serving", "completed"]);
const rowSchema = z.object({ session_id: z.uuid(), payload: z.object({
  status: z.enum(["queued", "serving", "transferred_demo", "completed_demo"]),
  receivedAt: z.iso.datetime({ offset: true }),
}) });

export type CaseFilter = z.infer<typeof stateSchema>;
export function createCounselorCasesApi(load: (status: CaseFilter, cursor: string | null) => Promise<{ rows: unknown; allStatuses: boolean }>) {
  return async (request: Request) => {
    const params = new URL(request.url).searchParams;
    const status = stateSchema.safeParse(params.get("status") ?? "all");
    const cursor = params.get("cursor");
    if (!status.success || (cursor !== null && !z.uuid().safeParse(cursor).success)) {
      return noStoreJson({ error: { message: "조회 조건을 확인해주세요." } }, { status: 400 });
    }
    try {
      const result = await load(status.data, cursor);
      const rows = z.array(rowSchema).max(51).parse(result.rows);
      const items = rows.slice(0, 50).map(({ session_id, payload }) => ({
        sessionId: session_id, status: payload.status, receivedAt: payload.receivedAt,
      }));
      return noStoreJson({ data: { items, nextCursor: rows.length > 50 ? items[items.length - 1].sessionId : null, allStatuses: result.allStatuses } });
    } catch {
      return noStoreJson({ error: { message: "상담 목록을 불러오지 못했습니다." } }, { status: 503 });
    }
  };
}
