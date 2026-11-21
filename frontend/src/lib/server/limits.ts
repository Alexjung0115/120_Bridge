export type Admission =
  | { allowed: true }
  | { allowed: false; status: 429; code: "session_limit" | "turn_limit" };

function checkAdmission(count: number, maximum: number, code: "session_limit" | "turn_limit"): Admission {
  const hasCapacity = Number.isSafeInteger(count) && count >= 0 &&
    Number.isSafeInteger(maximum) && count < maximum;

  return hasCapacity ? { allowed: true } : { allowed: false, status: 429, code };
}

export function checkSessionAdmission(activeSessions: number, maximum: number): Admission {
  return checkAdmission(activeSessions, maximum, "session_limit");
}

export function checkTurnAdmission(recordedTurns: number, maximum: number): Admission {
  return checkAdmission(recordedTurns, maximum, "turn_limit");
}

export function noStoreJson(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(body, { ...init, headers });
}