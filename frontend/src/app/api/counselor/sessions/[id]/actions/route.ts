import { counselorSessionApi } from "@/lib/server/counselor-session-api";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return counselorSessionApi(request, "action", (await context.params).id);
}
