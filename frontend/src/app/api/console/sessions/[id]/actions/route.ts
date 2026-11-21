import { configuredConsoleActionApi } from "../../../../../../lib/server/console-runtime";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return configuredConsoleActionApi()(request, (await context.params).id);
}