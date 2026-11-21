import { counselorSessionApi } from "@/lib/server/counselor-session-api";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return counselorSessionApi(request, "detail", (await context.params).id);
}
