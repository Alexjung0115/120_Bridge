import { consoleApi } from "../../../../../lib/server/console-runtime";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return consoleApi().detail(request, (await context.params).id);
}