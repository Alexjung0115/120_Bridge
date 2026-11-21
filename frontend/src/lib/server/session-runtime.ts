import { createSessionApi } from "./session-api";

export function configuredSessionApi() {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY,
    BRIDGE_DEMO_OWNER_ID, BRIDGE_SESSION_SIGNING_SECRET, BRIDGE_CORPUS_VERSION } = process.env;
  const key = SUPABASE_SECRET_KEY ?? SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key || !BRIDGE_DEMO_OWNER_ID || !BRIDGE_SESSION_SIGNING_SECRET || !BRIDGE_CORPUS_VERSION) {
    throw new Error("Session API is not configured.");
  }
  const endpoint = new URL("/rest/v1/rpc/", SUPABASE_URL);
  const headers = new Headers({ apikey: key, "Content-Type": "application/json" });
  if (!key.startsWith("sb_secret_")) headers.set("Authorization", `Bearer ${key}`);

  async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(new URL(name, endpoint), {
      method: "POST", headers, body: JSON.stringify(body), cache: "no-store",
      redirect: "error", signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error("Storage is unavailable.");
    return await response.json() as T;
  }

  return createSessionApi({
    open: (mode, session) => rpc("bridge_open_session", {
      p_owner: BRIDGE_DEMO_OWNER_ID, p_mode: mode, p_session: session.id, p_snapshot: session,
    }),
    load: (id) => rpc("bridge_load_session", { p_session: id }),
  }, BRIDGE_SESSION_SIGNING_SECRET, BRIDGE_CORPUS_VERSION);
}