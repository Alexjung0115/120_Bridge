import { randomUUID } from "node:crypto";
import { configuredDialogueApi } from "../../../../../lib/server/dialogue-runtime";
import { mvpCitizenCommand } from "../../../../../lib/server/mvp-citizen";
import { sessionError } from "../../../../../lib/server/session-api";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const dialogue = configuredDialogueApi();
    return dialogue ? await dialogue.turn(request, id) : await mvpCitizenCommand(request, id, "turn");
  } catch {
    return sessionError(randomUUID(), 503, "storage_unavailable");
  }
}
