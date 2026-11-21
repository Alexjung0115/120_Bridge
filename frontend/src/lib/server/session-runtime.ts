import { createHmac } from "node:crypto";
import { isIP } from "node:net";
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
    open: (mode, session, request) => {
      const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for") : null;
      if (process.env.VERCEL === "1" && (!ip || !isIP(ip))) {
        throw new Error("Client address is unavailable.");
      }
      const source = ip && createHmac("sha256", BRIDGE_SESSION_SIGNING_SECRET)
        .update("admission-source:" + ip).digest("hex");
      return rpc("bridge_open_session_limited", {
        p_owner: BRIDGE_DEMO_OWNER_ID, p_mode: mode, p_session: session.id,
        p_snapshot: session, p_source: source,
      });
    },
    load: (id) => rpc("bridge_load_session", { p_session: id }),
    loadSummary: (id, revision) => rpc("bridge_load_citizen_summary", { p_session: id, p_revision: revision }),
    end: (id, command, base, hash, decision) => rpc(decision ? "bridge_record_citizen_outcome" : "bridge_end_session", {
      p_session: id, p_command: command, p_base: base, p_token_hash: hash,
      ...(decision ? { p_decision: decision } : {}),
    }),
  }, BRIDGE_SESSION_SIGNING_SECRET, BRIDGE_CORPUS_VERSION);
}