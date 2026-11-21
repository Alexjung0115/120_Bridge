import { consoleApi, configuredConsoleActionApi } from "./console-runtime";

export async function counselorSessionApi(request: Request, operation: "queue" | "detail" | "action", id?: string) {
  if (operation === "action" && request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: { message: "요청 출처를 확인해주세요." } }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const token = process.env.CONSOLE_TOKEN;
  if (!token) return Response.json({ error: { message: "상담사 서비스가 설정되지 않았습니다." } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const authenticated = new Request(request.url, {
    method: request.method,
    headers,
    body: operation === "action" ? await request.text() : undefined,
  });
  if (operation === "queue") return consoleApi().queue(authenticated);
  if (operation === "detail") return consoleApi().detail(authenticated, id ?? "");
  return configuredConsoleActionApi()(authenticated, id ?? "");
}
