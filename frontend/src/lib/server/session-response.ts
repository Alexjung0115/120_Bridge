type VisibleState = "active" | "handoff_offered" | "summary_confirm" | "sending" |
  "queued" | "serving" | "transferred_demo" | "completed_demo" | "ended" | "delivery_failed";

type SessionResponseSource = {
  id: string;
  revision: number;
  state: VisibleState;
  pendingRequestId: string | null;
  activeIssueId: string | null;
};

export function sessionCreated(session: SessionResponseSource, citizenToken: string) {
  return {
    sessionId: session.id,
    citizenToken,
    revision: session.revision,
    state: session.state,
  };
}

export function sessionReadMetadata(session: SessionResponseSource) {
  const { state } = session;
  const presentationState =
    state === "serving" || state === "transferred_demo" || state === "completed_demo"
      ? "connection_complete"
      : state === "queued" ? "waiting" : "consulting";

  return {
    revision: session.revision,
    state: presentationState === "connection_complete" ? "serving" : state,
    presentationState,
    processing: presentationState === "consulting" && session.pendingRequestId !== null,
    activeIssueId: presentationState === "connection_complete" ? null : session.activeIssueId,
  };
}