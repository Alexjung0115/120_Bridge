import { mvpCitizenCommand } from "../../../../../lib/server/mvp-citizen";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return mvpCitizenCommand(request, (await context.params).id, "turn");
}