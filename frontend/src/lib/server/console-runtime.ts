import { createHandoffStore } from "../store/handoff-store";
import { createConsoleApi } from "./console-api";
import { createSupabaseRpc } from "../store/snapshot";

export function consoleApi() {
  return createConsoleApi(() => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Console storage is unavailable.");
    return createHandoffStore(createSupabaseRpc(url, key));
  }, { CONSOLE_TOKEN: process.env.CONSOLE_TOKEN, CONSOLE_AGENT_ID: process.env.CONSOLE_AGENT_ID });
}