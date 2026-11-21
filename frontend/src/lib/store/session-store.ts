import type { JsonValue, SavedCommand, SessionPersistence } from "./snapshot";

type SessionSnapshot = {
  id: string;
  revision: number;
  updatedAt: string;
  pendingRequestId: string | null;
  transcript: { outputStatus: "pending" | "committed" | "discarded" }[];
};

type Command = { commandId: string; baseRevision: number };

export function createSessionStore<State extends SessionSnapshot>(
  persistence: SessionPersistence,
  parseSnapshot: (input: unknown) => State,
) {
  async function load(sessionId: string): Promise<State | null> {
    const stored = await persistence.load(sessionId);
    return stored === null ? null : parseSnapshot(stored);
  }

  async function execute(
    sessionId: string,
    command: Command,
    reduce: (state: Readonly<State>) => { state: State; result: JsonValue } | null,
  ): Promise<SavedCommand | { status: "skipped"; revision: number }> {
    const replay = await persistence.replay(sessionId, command.commandId);
    if (replay) return replay;

    const state = await load(sessionId);
    if (!state) return { status: "not_found" };
    if (state.revision !== command.baseRevision) {
      // A concurrent copy of this command may have committed since the first receipt lookup.
      return await persistence.replay(sessionId, command.commandId) ??
        { status: "conflict", revision: state.revision };
    }
    if (state.revision === Number.MAX_SAFE_INTEGER) {
      return { status: "conflict", revision: state.revision };
    }

    // Concurrent workers may compute the same transition. Only the stored receipt
    // authorizes downstream work, so reducers must have no side effects.
    const change = reduce(state);
    if (!change) return { status: "skipped", revision: state.revision };
    const next = parseSnapshot({
      ...change.state,
      revision: state.revision + 1,
      updatedAt: new Date().toISOString(),
    });
    return persistence.commit(sessionId, command.commandId, command.baseRevision, next, change.result);
  }

  return {
    load,
    async initialize(snapshot: State): Promise<State | null> {
      const stored = await persistence.initialize(snapshot.id, parseSnapshot(snapshot));
      return stored === null ? null : parseSnapshot(stored);
    },
    execute,
    recoverInterrupted(sessionId: string, command: Command, pendingRequestId: string) {
      return execute(sessionId, command, (state) => {
        if (state.pendingRequestId !== pendingRequestId) return null;

        return {
          state: {
            ...state,
            pendingRequestId: null,
            transcript: state.transcript.map((turn) => turn.outputStatus === "pending"
              ? { ...turn, outputStatus: "discarded" }
              : turn),
          },
          result: { recovered: true },
        };
      });
    },
  };
}