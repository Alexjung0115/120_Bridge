import { createCitizenCorrectionApi } from "../../../../../lib/server/citizen-corrections";
import { createSupabaseRpc } from "../../../../../lib/store/snapshot";

const correct = createCitizenCorrectionApi(() => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Session storage is unavailable.");
  const rpc = createSupabaseRpc(url, key);

  return {
    load: (id) => rpc("bridge_load_session", { p_session: id }),
    submit: (id, command, hash) => rpc("bridge_submit_citizen_correction", {
      p_session: id, p_base: command.baseRevision, p_command: command.commandId,
      p_handoff: command.handoffId, p_summary_revision: command.summaryRevision,
      p_text: command.correctionText, p_token_hash: hash,
    }),
  };
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return correct(request, (await context.params).id);
}