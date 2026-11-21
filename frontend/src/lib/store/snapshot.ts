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

export function createSupabaseSessionPersistence(
  serviceUrl: string,
  serviceRoleKey: string,
): SessionPersistence {
  const rpcUrl = new URL("/rest/v1/rpc/", serviceUrl);
  const headers = new Headers({ apikey: serviceRoleKey, "Content-Type": "application/json" });
  // New Supabase secret keys are not JWTs. The gateway authenticates them via apikey.
  if (!serviceRoleKey.startsWith("sb_secret_")) {
    headers.set("Authorization", `Bearer ${serviceRoleKey}`);
  }

  async function rpc<Result>(name: string, input: Record<string, unknown>): Promise<Result> {
    const response = await fetch(new URL(name, rpcUrl), {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      throw new Error(`Session persistence request failed (${response.status}).`);
    }
    return await response.json() as Result;
  }

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