import { createClient } from "@supabase/supabase-js";

export type JsonValue =
  | null | boolean | number | string
  | JsonValue[] | { [key: string]: JsonValue };

export type SavedCommand =
  | { status: "committed" | "replayed"; revision: number; result: JsonValue }
  | { status: "conflict"; revision: number }
  | { status: "not_found" };

export type SessionPersistence = {
  load(sessionId: string): Promise<unknown>;
  initialize(sessionId: string, snapshot: unknown): Promise<unknown>;
  replay(sessionId: string, commandId: string): Promise<SavedCommand | null>;
  commit(
    sessionId: string,
    commandId: string,
    baseRevision: number,
    snapshot: unknown,
    result: JsonValue,
  ): Promise<SavedCommand>;
};

export function createSupabaseClient(
  serviceUrl: string,
  serviceRoleKey: string,
) {
  if (typeof window !== "undefined") throw new Error("Supabase RPC requires a server context.");

  return createClient(serviceUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch(input, init) {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        // Opaque secret keys authenticate via apikey; the SDK also supplies a fallback Bearer header.
        if (serviceRoleKey.startsWith("sb_secret_") &&
          headers.get("Authorization") === `Bearer ${serviceRoleKey}`) {
          headers.delete("Authorization");
        }
        return fetch(input, { ...init, headers, cache: "no-store", redirect: "error" });
      },
    },
  });

}

export function createSupabaseRpc(serviceUrl: string, serviceRoleKey: string) {
  const client = createSupabaseClient(serviceUrl, serviceRoleKey);
  async function rpc<Result>(name: string, input: Record<string, unknown>): Promise<Result> {
    const { data, error, status } = await client.rpc(name, input)
      .retry(false).abortSignal(AbortSignal.timeout(5_000));
    if (error) throw new Error(`Session persistence request failed (${status}).`);
    return data as Result;
  }

  return rpc;
}

export function createSupabaseSessionPersistence(serviceUrl: string, serviceRoleKey: string): SessionPersistence {
  const rpc = createSupabaseRpc(serviceUrl, serviceRoleKey);
  return {
    load: (sessionId) => rpc("bridge_load_session", { p_session: sessionId }),
    initialize: (sessionId, snapshot) =>
      rpc("bridge_initialize_session", { p_session: sessionId, p_snapshot: snapshot }),
    replay: (sessionId, commandId) =>
      rpc("bridge_read_session_command", { p_session: sessionId, p_command: commandId }),
    commit: (sessionId, commandId, baseRevision, snapshot, result) =>
      rpc("bridge_commit_session_command", {
        p_session: sessionId,
        p_command: commandId,
        p_base: baseRevision,
        p_snapshot: snapshot,
        p_result: result,
      }),
  };
}
