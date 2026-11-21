import assert from "node:assert/strict";
import { test } from "node:test";

import { aggregateMetrics, type SimulationMetricEvent } from "../../src/lib/metrics/aggregate";

const windowStart = "2026-11-21T12:00:00+09:00";
const windowEnd = "2026-11-21T12:01:00+09:00";
const window = { windowStart, windowEnd };

function event(
  sessionId: string,
  eventType: SimulationMetricEvent["eventType"],
  timestamp = windowStart,
  details: Partial<Pick<SimulationMetricEvent, "actorPseudonym" | "reason">> = {},
): SimulationMetricEvent {
  return {
    id: [sessionId, eventType, timestamp].join("/"),
    sessionId,
    eventType,
    timestamp,
    actorPseudonym: null,
    reason: null,
    measurementMode: "simulation",
    corpusVersion: "demo",
    ...details,
  };
}

test("counts terminal sessions once, excludes the upper boundary, and separates unknown and in progress", () => {
  const confirmed = { id: "ai", state: "ended", outcome: "ai_confirmed", outcomeConfirmedAt: windowStart } as const;
  const unknown = { id: "unknown", state: "ended", outcome: "unknown", outcomeConfirmedAt: null } as const;
  const terminal = event(confirmed.id, "session_ended");
  const inProgress = (["queued", "serving", "transferred_demo", "active"] as const).map((state) => ({
    ...unknown, id: state, state, outcome: "handoff" as const,
  }));
  const result = aggregateMetrics({
    ...window,
    sessions: [
      confirmed, confirmed, unknown, ...inProgress,
      { ...unknown, id: "upper" },
      { ...unknown, id: "no-terminal" },
      { ...confirmed, id: "unconfirmed", outcomeConfirmedAt: null },
    ],
    events: [
      terminal, terminal,
      event(confirmed.id, "session_ended", "2026-11-21T12:00:01+09:00"),
      event(unknown.id, "session_ended"),
      event("unconfirmed", "session_ended"),
      event("upper", "session_ended", windowEnd),
      event("queued", "handoff_requested", windowStart, { reason: "manual" }),
    ],
  });

  assert.equal(result.measurementMode, "simulation");
  assert.equal(result.endedCount, 3);
  assert.equal(result.aiConfirmedCount, 1);
  assert.equal(result.unknownCount, 2);
  assert.equal(result.inProgressCount, 4);
  assert.equal(result.aiResolutionRate, 1 / 3);
  assert.equal(result.handoffRate, 0);
  assert.deepEqual(result.handoffReasons, {});
});

test("returns null for empty rates and averages and zero for counts", () => {
  assert.deepEqual(aggregateMetrics({ ...window, sessions: [], events: [] }), {
    ...window,
    measurementMode: "simulation",
    endedCount: 0,
    inProgressCount: 0,
    aiConfirmedCount: 0,
    unknownCount: 0,
    handoffCount: 0,
    handoffReasons: {},
    aiResolutionRate: null,
    handoffRate: null,
    agents: [],
    averageWaitSeconds: null,
    repeatExplanationCount: 0,
    missingRepeatCount: 0,
  });
});

test("uses queue-to-claim and claim-to-completion intervals and preserves zero repeat counts", () => {
  const completed = {
    state: "completed_demo", outcome: "handoff", outcomeConfirmedAt: null,
  } as const;
  const claimant = { actorPseudonym: "demo-agent-1" };
  const claimTime = "2026-11-21T12:00:10+09:00";
  const finishTime = "2026-11-21T12:00:25+09:00";
  const result = aggregateMetrics({
    ...window,
    sessions: [
      { ...completed, id: "measured", repeatExplanationCount: 0 },
      { ...completed, id: "missing", repeatExplanationCount: null },
      { ...completed, id: "zero", repeatExplanationCount: 2 },
      { ...completed, id: "waiting", state: "queued" },
      { ...completed, id: "claimed", state: "serving" },
    ],
    events: [
      event("measured", "case_completed", finishTime, claimant),
      event("measured", "session_ended", finishTime),
      event("measured", "agent_claimed", claimTime, claimant),
      event("measured", "queue_received", "2026-11-21T11:59:55+09:00"),
      event("measured", "handoff_requested", "2026-11-21T11:59:54+09:00", { reason: "manual" }),
      event("missing", "queue_received", finishTime),
      event("missing", "agent_claimed", "2026-11-21T12:00:40+09:00", claimant),
      event("missing", "case_completed", finishTime, claimant),
      event("missing", "session_ended", finishTime),
      event("zero", "queue_received"),
      event("zero", "agent_claimed", windowStart, claimant),
      event("zero", "case_completed", windowStart, claimant),
      event("zero", "session_ended"),
      event("waiting", "queue_received"),
      event("claimed", "queue_received"),
      event("claimed", "agent_claimed", claimTime, claimant),
    ],
  });

  assert.equal(result.handoffCount, 3);
  assert.equal(result.handoffRate, 1);
  assert.deepEqual(result.handoffReasons, { manual: 1 });
  assert.equal(result.inProgressCount, 2);
  assert.equal(result.averageWaitSeconds, 7.5);
  assert.equal(result.repeatExplanationCount, 2);
  assert.equal(result.missingRepeatCount, 1);
  assert.deepEqual(result.agents, [{
    id: "demo-agent-1",
    completedCount: 3,
    observationMinutes: 1,
    averageHandlingSeconds: 7.5,
    sampleSize: 2,
  }]);
});
