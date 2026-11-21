import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

const configuredOrigin = process.env.BRIDGE_CONSOLE_TEST_ORIGIN;
const skip = configuredOrigin ? false : "Requires an isolated local API with seeded console fixtures.";
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Fixture = { id: string; revision: number };

function fixture(prefix: string): Fixture {
  const id = process.env[`BRIDGE_TEST_${prefix}_ID`];
  const rawRevision = process.env[`BRIDGE_TEST_${prefix}_REVISION`];
  const revision = Number(rawRevision);
  assert.ok(id && idPattern.test(id), `Missing fixture ID for ${prefix}.`);
  assert.ok(rawRevision && Number.isSafeInteger(revision) && revision >= 0,
    `Invalid fixture revision for ${prefix}.`);
  return { id, revision };
}

function config() {
  assert.ok(configuredOrigin);
  const origin = new URL(configuredOrigin);
  assert.ok(["http:", "https:"].includes(origin.protocol) &&
    ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) &&
    !origin.username && !origin.password, "The suite only writes to an isolated loopback API.");
  const consoleToken = process.env.BRIDGE_TEST_CONSOLE_TOKEN;
  const citizenToken = process.env.BRIDGE_TEST_CITIZEN_TOKEN;
  assert.ok(consoleToken && citizenToken && consoleToken !== citizenToken,
    "Set distinct seeded credentials in the test environment.");

  return {
    consoleToken,
    citizenToken,
    async request(path: string, token?: string, body?: object) {
      const headers = new Headers();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      if (body) headers.set("Content-Type", "application/json");
      return fetch(new URL(`/api${path}`, origin), {
        method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined,
        redirect: "error", signal: AbortSignal.timeout(5_000),
      });
    },
  };
}

function action(target: Fixture, name: "claim" | "complete_case") {
  return { commandId: randomUUID(), baseRevision: target.revision, action: name };
}

async function envelope(response: Response, expectedStatus: number) {
  assert.equal(response.status, expectedStatus);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const payload = await response.json();
  assert.equal(payload.schemaVersion, 1);
  assert.equal(typeof payload.requestId, "string");
  assert.ok(payload.requestId.length > 0);
  if (expectedStatus >= 400) {
    assert.equal(typeof payload.error?.code, "string");
    assert.equal(typeof payload.error?.message, "string");
    assert.equal(typeof payload.error?.retryable, "boolean");
    assert.equal("data" in payload, false);
  } else {
    assert.ok(payload.data && typeof payload.data === "object");
    assert.equal("error" in payload, false);
  }
  return payload;
}

// Reseed before each full run: QUEUED and RACE are distinct, queued,
// approved sessions. STALE has an unacknowledged correction at its current revision.
test("missing and citizen tokens cannot access console endpoints", { skip }, async () => {
  const api = config();
  const target = fixture("QUEUED");
  const path = `/console/sessions/${target.id}`;
  for (const [endpoint, body] of [
    ["/console/queue", undefined],
    [path, undefined],
    [`${path}/actions`, action(target, "claim")],
    [`${path}/actions`, action(target, "complete_case")],
  ] as const) {
    await envelope(await api.request(endpoint, undefined, body), 401);
    const denied = await api.request(endpoint, api.citizenToken, body);
    assert.ok([401, 403].includes(denied.status), "Citizen credential reached a console endpoint.");
    await envelope(denied, denied.status);
  }
});

test("queue lists the fixture once and detail exposes its summary and transcript", { skip }, async () => {
  const api = config();
  const target = fixture("QUEUED");
  const queue = await envelope(await api.request("/console/queue", api.consoleToken), 200);
  assert.ok(Array.isArray(queue.data.items));
  const ids: string[] = queue.data.items.map((item: { sessionId: string }) => item.sessionId);
  assert.ok(ids.every((id) => typeof id === "string" && idPattern.test(id)));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.filter((id) => id === target.id).length, 1);
  const detail = await envelope(await api.request(`/console/sessions/${target.id}`, api.consoleToken), 200);
  assert.ok(Array.isArray(detail.data.transcript));
  assert.ok(detail.data.transcript.length > 0);
  assert.ok(detail.data.summary && typeof detail.data.summary === "object");
});

test("current session revision cannot bypass an unacknowledged correction", { skip }, async () => {
  const api = config();
  const target = fixture("STALE");
  await envelope(await api.request(`/console/sessions/${target.id}/actions`, api.consoleToken,
    action(target, "claim")), 409);
});

test("simultaneous claim commands yield one winner and replay its saved response", { skip }, async () => {
  const api = config();
  const target = fixture("RACE");
  const path = `/console/sessions/${target.id}/actions`;
  const commands = [action(target, "claim"), action(target, "claim")];
  const outcomes = await Promise.all(commands.map((command) => api.request(path, api.consoleToken, command)));
  assert.deepEqual(outcomes.map((result) => result.status).sort(), [200, 409]);
  const winner = outcomes.findIndex((response) => response.status === 200);
  const accepted = await envelope(outcomes[winner], 200);
  await envelope(outcomes[1 - winner], 409);
  assert.equal(accepted.data.state, "serving");
  const replay = await envelope(await api.request(path, api.consoleToken, commands[winner]), 200);
  assert.deepEqual(replay.data, accepted.data);

  const complete = action({ ...target, revision: target.revision + 1 }, "complete_case");
  const completed = await envelope(await api.request(path, api.consoleToken, complete), 200);
  assert.equal(completed.data.state, "completed_demo");
  assert.deepEqual((await envelope(await api.request(path, api.consoleToken, complete), 200)).data,
    completed.data);
});
test("an outdated summary approval is rejected even with the current session revision", { skip }, async () => {
  const api = config();
  // SUMMARY is in summary_confirm with revision newer than the stale summary below.
  const target = fixture("SUMMARY");
  const latestSummary = Number(process.env.BRIDGE_TEST_CURRENT_SUMMARY_REVISION);
  assert.ok(Number.isSafeInteger(latestSummary) && latestSummary >= 2);
  await envelope(await api.request(`/sessions/${target.id}/summary`, api.citizenToken, {
    commandId: randomUUID(), baseRevision: target.revision,
    summaryRevision: latestSummary - 1, action: "confirm",
  }), 409);
});

test("a failed delivery retries the same handoff and leaves one queue entry", { skip }, async () => {
  const api = config();
  // RETRY is a separate delivery_failed session that the fixture can deliver on retry.
  const target = fixture("RETRY");
  const handoffId = process.env.BRIDGE_TEST_FAILED_HANDOFF_ID;
  assert.ok(handoffId && idPattern.test(handoffId));
  const path = `/sessions/${target.id}/handoff-retry`;
  const command = { commandId: randomUUID(), baseRevision: target.revision, handoffId };
  const first = await envelope(await api.request(path, api.citizenToken, command), 200);
  assert.equal(first.data.state, "queued");
  const replay = await envelope(await api.request(path, api.citizenToken, command), 200);
  assert.deepEqual(replay.data, first.data);
  const queue = await envelope(await api.request("/console/queue", api.consoleToken), 200);
  const items = queue.data.items.filter((item: { sessionId: string }) => item.sessionId === target.id);
  assert.equal(items.length, 1);
  assert.equal(items[0].handoffId, handoffId);
});