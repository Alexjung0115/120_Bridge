import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canAccessCitizenSession,
  getConsoleAgentId,
  issueCitizenToken,
  readBearerToken,
} from "../../src/lib/server/auth";
import { checkSessionAdmission, checkTurnAdmission, noStoreJson } from "../../src/lib/server/limits";
import { createRequestContext } from "../../src/lib/server/request-log";

const bearer = (token: string) => new Headers({ authorization: `Bearer ${token}` });

test("bearer parsing rejects missing, combined, oversized and malformed credentials", () => {
  assert.equal(readBearerToken(new Headers()), null);
  assert.equal(readBearerToken(new Headers({ authorization: "bearer   sample+/==" })), "sample+/==");
  for (const authorization of [
    "Basic token", "Bearer", "Bearer a b", "Bearer aaa,Bearer bbb",
    "Bearer foo=bar", "Bearer " + "a".repeat(1_025),
  ]) {
    assert.equal(readBearerToken(new Headers({ authorization })), null);
  }
  assert.equal(readBearerToken(bearer("a".repeat(1_024)))?.length, 1_024);
});

test("citizen credentials are stored as hashes and scoped to the owning session", () => {
  const first = issueCitizenToken();
  const second = issueCitizenToken();
  assert.match(first.tokenHash, /^[0-9a-f]{64}$/);
  assert.notEqual(first.tokenHash, first.token);
  assert.notEqual(first.token, second.token);
  assert.equal(canAccessCitizenSession(bearer(first.token), first.tokenHash), true);
  assert.equal(canAccessCitizenSession(bearer(first.token), second.tokenHash), false);
  assert.equal(canAccessCitizenSession(bearer(first.token), first.token), false);
  assert.equal(canAccessCitizenSession(bearer("console-fixture"), first.tokenHash), false);
  assert.equal(canAccessCitizenSession(new Headers(), first.tokenHash), false);
});

test("console identity comes only from server configuration and fails closed", () => {
  const headers = bearer("console-fixture");
  headers.set("x-agent-id", "client-chosen-agent");
  assert.equal(getConsoleAgentId(headers, { CONSOLE_TOKEN: "console-fixture" }), "demo-agent-1");
  assert.equal(getConsoleAgentId(headers, { CONSOLE_TOKEN: "console-fixture", CONSOLE_AGENT_ID: " agent-a " }), "agent-a");
  assert.equal(getConsoleAgentId(headers, {}), null);
  assert.equal(getConsoleAgentId(headers, { CONSOLE_TOKEN: "different" }), null);
  assert.equal(getConsoleAgentId(new Headers(), { CONSOLE_TOKEN: "console-fixture" }), null);

  const citizen = issueCitizenToken();
  assert.equal(getConsoleAgentId(bearer(citizen.token), { CONSOLE_TOKEN: citizen.token }), null);
});

test("session and turn limits apply at the boundary", () => {
  const { concurrentSessions, turnsPerSession } = { concurrentSessions: 5, turnsPerSession: 100 };
  assert.deepEqual(checkSessionAdmission(4, concurrentSessions), { allowed: true });
  for (const count of [5, 6, -1, 1.5, NaN, Infinity]) {
    assert.deepEqual(checkSessionAdmission(count, concurrentSessions),
      { allowed: false, status: 429, code: "session_limit" });
  }
  assert.deepEqual(checkTurnAdmission(99, turnsPerSession), { allowed: true });
  assert.equal(checkSessionAdmission(0, Infinity).allowed, false);
  assert.equal(checkTurnAdmission(0, 0).allowed, false);
  for (const count of [100, 101, -1, 99.5]) {
    assert.deepEqual(checkTurnAdmission(count, turnsPerSession),
      { allowed: false, status: 429, code: "turn_limit" });
  }
});

test("responses are never cached even when the caller supplies a cacheable header", async () => {
  for (const status of [200, 400, 401, 403, 429, 503]) {
    const headers = new Headers({ "Cache-Control": "public, max-age=600", "X-Test": "kept" });
    const response = noStoreJson({ status }, { status, headers });
    assert.equal(response.status, status);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("X-Test"), "kept");
    assert.equal(headers.get("Cache-Control"), "public, max-age=600");
    assert.deepEqual(await response.json(), { status });
  }
  assert.equal(noStoreJson({}).headers.get("Cache-Control"), "no-store");
});

test("request log fields contain only server metadata", () => {
  const request = createRequestContext("session_read");
  assert.match(request.requestId, /^[0-9a-f-]{36}$/);
  assert.notEqual(createRequestContext("session_read").requestId, request.requestId);
  assert.deepEqual(request.logFields(403), { requestId: request.requestId, endpoint: "session_read", status: 403 });
});

test("an unauthorized request excludes its credential, key and message from diagnostics", async () => {
  const citizen = issueCitizenToken();
  const anotherCitizen = issueCitizenToken();
  const rawText = "가상 민원 원문";
  const serviceKey = "fixture-service-secret";
  const request = new Request("https://example.test/api/sessions/fixture", {
    method: "POST",
    headers: { authorization: `Bearer ${anotherCitizen.token}`, apikey: serviceKey },
    body: rawText,
  });

  const context = createRequestContext("session_read");
  assert.equal(canAccessCitizenSession(request.headers, citizen.tokenHash), false);
  const response = noStoreJson({ requestId: context.requestId, code: "forbidden" }, { status: 403 });
  const diagnostics = JSON.stringify(context.logFields(response.status)) + await response.text();

  for (const sensitive of [citizen.tokenHash, anotherCitizen.token, rawText, serviceKey]) {
    assert.equal(diagnostics.includes(sensitive), false);
  }
});