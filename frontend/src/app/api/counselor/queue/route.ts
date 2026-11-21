import { counselorSessionApi } from "@/lib/server/counselor-session-api";

export async function GET(request: Request) {
  return counselorSessionApi(request, "queue");
}
