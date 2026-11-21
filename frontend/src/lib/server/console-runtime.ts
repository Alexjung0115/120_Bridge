import { createHandoffStore } from "../store/handoff-store";
import { createConsoleApi } from "./console-api";
import { createConsoleActionApi } from "./console-actions";
import { createSupabaseRpc } from "../store/snapshot";

function serverRpc() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Console storage is unavailable.");
  return createSupabaseRpc(url, key);
}

function consoleAuth() {
  return { CONSOLE_TOKEN: process.env.CONSOLE_TOKEN, CONSOLE_AGENT_ID: process.env.CONSOLE_AGENT_ID };
}

export function consoleApi() {
  return createConsoleApi(() => createHandoffStore(serverRpc()), consoleAuth());
}

export function configuredConsoleActionApi() {
  return createConsoleActionApi((sessionId, agent, command) => serverRpc()("bridge_apply_console_action", {
    p_session: sessionId, p_agent: agent, p_command: command.commandId,
    p_base: command.baseRevision, p_action: command.action,
    p_candidate: command.action === "transfer_demo" ? command.candidateId : null,
    p_outcome: command.action === "complete_case" ? command.outcome ?? null : null,
  }), consoleAuth());
}