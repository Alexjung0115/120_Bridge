import type { Session } from "../schema/session";

type SessionResult = Pick<Session, "id" | "state" | "outcome" | "outcomeConfirmedAt"> & {
  repeatExplanationCount?: number | null;
};

export type SimulationMetricEvent = {
  id: string;
  sessionId: string;
  eventType:
    | "ai_resolution_confirmed"
    | "handoff_requested"
    | "queue_received"
    | "agent_claimed"
    | "case_completed"
    | "repeat_explanation_recorded"
    | "session_ended";
  timestamp: string;
  actorPseudonym: string | null;
  reason: string | null;
  measurementMode: "simulation";
  corpusVersion: string;
};

type TimedEvent = SimulationMetricEvent & { time: number };

function durationSeconds(start?: TimedEvent, end?: TimedEvent) {
  return start && end && end.time >= start.time ? (end.time - start.time) / 1_000 : null;
}

export function aggregateMetrics({
  sessions,
  events,
  windowStart,
  windowEnd,
}: {
  sessions: readonly SessionResult[];
  events: readonly SimulationMetricEvent[];
  windowStart: string;
  windowEnd: string;
}) {
  const start = Date.parse(windowStart);
  const end = Date.parse(windowEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    throw new RangeError("Invalid metrics observation window.");
  }

  const seen = new Set<string>();
  const eventsBySession = new Map<string, Map<TimedEvent["eventType"], TimedEvent>>();
  for (const event of events) {
    const time = Date.parse(event.timestamp);
    if (event.measurementMode !== "simulation" || !Number.isFinite(time) || time >= end || seen.has(event.id)) {
      continue;
    }
    seen.add(event.id);
    let timeline = eventsBySession.get(event.sessionId);
    if (!timeline) {
      timeline = new Map();
      eventsBySession.set(event.sessionId, timeline);
    }
    const previous = timeline.get(event.eventType);
    // The terminal event is the final result. The other events mark first milestones.
    if (!previous || (event.eventType === "session_ended" ? time > previous.time : time < previous.time)) {
      timeline.set(event.eventType, { ...event, time });
    }
  }

  let endedCount = 0;
  let inProgressCount = 0;
  let aiConfirmedCount = 0;
  let handoffCount = 0;
  let repeatExplanationCount = 0;
  let missingRepeatCount = 0;
  let totalWaitSeconds = 0;
  let waitSampleSize = 0;
  const handoffReasons = new Map<string, number>();
  const agentTotals = new Map<string, { completedCount: number; handlingSeconds: number; sampleSize: number }>();

  for (const session of new Map(sessions.map((session) => [session.id, session])).values()) {
    const timeline = eventsBySession.get(session.id);
    const terminal = timeline?.get("session_ended");
    if (session.state !== "ended" && session.state !== "completed_demo") {
      inProgressCount++;
      continue;
    }
    if (!timeline || !terminal || terminal.time < start) continue;

    endedCount++;
    if (session.outcome === "ai_confirmed" && session.outcomeConfirmedAt !== null &&
        Date.parse(session.outcomeConfirmedAt) <= terminal.time) {
      aiConfirmedCount++;
    }
    if (session.outcome !== "handoff") continue;

    handoffCount++;
    const request = timeline.get("handoff_requested");
    if (request?.reason && request.time <= terminal.time) {
      handoffReasons.set(request.reason, (handoffReasons.get(request.reason) ?? 0) + 1);
    }

    const claimed = timeline.get("agent_claimed");
    const wait = durationSeconds(timeline.get("queue_received"), claimed);
    if (claimed && wait !== null && claimed.time <= terminal.time) {
      totalWaitSeconds += wait;
      waitSampleSize++;
    }

    const completed = timeline.get("case_completed");
    if (session.state !== "completed_demo" || !completed || completed.time < start || completed.time > terminal.time) {
      continue;
    }
    if (session.repeatExplanationCount == null) {
      missingRepeatCount++;
    } else {
      repeatExplanationCount += session.repeatExplanationCount;
    }

    const agentId = completed.actorPseudonym;
    if (!agentId) continue;
    const agent = agentTotals.get(agentId) ?? { completedCount: 0, handlingSeconds: 0, sampleSize: 0 };
    agent.completedCount++;
    const handling = durationSeconds(claimed, completed);
    if (handling !== null && claimed?.actorPseudonym === agentId) {
      agent.handlingSeconds += handling;
      agent.sampleSize++;
    }
    agentTotals.set(agentId, agent);
  }

  const agents = Array.from(agentTotals, ([id, agent]) => ({
    id,
    completedCount: agent.completedCount,
    observationMinutes: (end - start) / 60_000,
    averageHandlingSeconds: agent.sampleSize ? agent.handlingSeconds / agent.sampleSize : null,
    sampleSize: agent.sampleSize,
  })).sort((a, b) => a.id.localeCompare(b.id));

  return {
    measurementMode: "simulation" as const,
    windowStart,
    windowEnd,
    endedCount,
    inProgressCount,
    aiConfirmedCount,
    unknownCount: endedCount - aiConfirmedCount - handoffCount,
    handoffCount,
    handoffReasons: Object.fromEntries(handoffReasons),
    aiResolutionRate: endedCount ? aiConfirmedCount / endedCount : null,
    handoffRate: endedCount ? handoffCount / endedCount : null,
    agents,
    averageWaitSeconds: waitSampleSize ? totalWaitSeconds / waitSampleSize : null,
    repeatExplanationCount,
    missingRepeatCount,
  };
}
