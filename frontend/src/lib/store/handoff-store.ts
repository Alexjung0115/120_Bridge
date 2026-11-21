import { handoffDeliverySchema, handoffSummarySchema } from "../schema/handoff";

type Rpc = (name: string, body: Record<string, unknown>) => Promise<unknown>;

export function createHandoffStore(rpc: Rpc) {
  return {
    recordApproval: (sessionId: string, revision: number, summary: unknown) =>
      rpc("bridge_record_handoff_approval", {
        p_session: sessionId, p_base: revision, p_summary: handoffSummarySchema.parse(summary),
      }),
    acknowledge: (sessionId: string, revision: number, key: string) =>
      rpc("bridge_acknowledge_handoff", { p_session: sessionId, p_base: revision, p_key: key }),
    deliver: (sessionId: string, revision: number, input: unknown) =>
      rpc("bridge_deliver_handoff", { p_session: sessionId, p_base: revision, p_handoff: handoffDeliverySchema.parse(input) }),
    stageCorrection: (sessionId: string, revision: number, correctionId: string, text: string) =>
      rpc("bridge_stage_handoff_correction", {
        p_session: sessionId, p_base: revision, p_correction: correctionId, p_text: text,
      }),
    correct: (sessionId: string, revision: number, correctionId: string, summary: unknown) =>
      rpc("bridge_correct_handoff", {
        p_session: sessionId, p_base: revision, p_correction: correctionId,
        p_summary: handoffSummarySchema.parse(summary),
      }),
    queue: (after: string | null) => rpc("bridge_console_queue", { p_after: after }),
    detail: (sessionId: string) => rpc("bridge_console_detail", { p_session: sessionId }),
  };
}