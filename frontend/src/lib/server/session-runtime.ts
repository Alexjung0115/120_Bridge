import { createSupabaseRpc } from "../store/snapshot";
import { createSessionApi } from "./session-api";

export function configuredSessionApi() {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY,
    BRIDGE_DEMO_OWNER_ID, BRIDGE_SESSION_SIGNING_SECRET, BRIDGE_CORPUS_VERSION } = process.env;
  const key = SUPABASE_SECRET_KEY ?? SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key || !BRIDGE_DEMO_OWNER_ID || !BRIDGE_SESSION_SIGNING_SECRET || !BRIDGE_CORPUS_VERSION) {
    throw new Error("Session API is not configured.");
  }
  const rpc = createSupabaseRpc(SUPABASE_URL, key);

  return createSessionApi({
    open: (mode, session) => rpc("bridge_open_session", {
      p_owner: BRIDGE_DEMO_OWNER_ID, p_mode: mode, p_session: session.id, p_snapshot: session,
    }),
    load: (id) => rpc("bridge_load_session", { p_session: id }),
    end: (id, command, base, hash) => rpc("bridge_end_session", {
      p_session: id, p_command: command, p_base: base, p_token_hash: hash,
    }),
  }, BRIDGE_SESSION_SIGNING_SECRET, BRIDGE_CORPUS_VERSION);
}