import assert from "node:assert/strict";
import { test } from "node:test";
import { createConsoleActionApi } from "../../src/lib/server/console-actions";
import { createConsoleApi } from "../../src/lib/server/console-api";

test("console reads validate credentials before querying storage", async () => {
  const id = "10000000-0000-4000-8000-000000000001";
  let reads = 0;
  const api = createConsoleApi(() => ({
    async queue(cursor) { reads++; return { items: [{ sessionId: id }], nextCursor: cursor }; },
    async detail(sessionId) { reads++; return sessionId === id ? { transcript: [], summary: {} } : null; },
  }), { CONSOLE_TOKEN: "fixture-console" });
  const request = (suffix = "", token?: string) => new Request("https://example.test/api/console/queue" + suffix,
    { headers: token ? { authorization: "Bearer " + token } : undefined });
  for (const invalid of [undefined, "cit_fixture"]) {
    assert.equal((await api.queue(request("", invalid))).status, 401);
    assert.equal((await api.detail(request("", invalid), id)).status, 401);
  }
  assert.equal((await api.queue(request("?cursor=bad", "fixture-console"))).status, 400);
  assert.equal(reads, 0);
  const accepted = await api.queue(request("?cursor=" + id, "fixture-console"));
  assert.equal(accepted.headers.get("cache-control"), "no-store");
  assert.deepEqual((await accepted.json()).data, { items: [{ sessionId: id }], nextCursor: id });
  assert.equal((await api.detail(request("", "fixture-console"), id)).status, 200);
  assert.equal((await api.detail(request("", "fixture-console"), "10000000-0000-4000-8000-000000000002")).status, 404);

  const failing = createConsoleApi(() => { throw new Error("fixture-storage-secret"); },
    { CONSOLE_TOKEN: "fixture-console" });
  const response = await failing.queue(request("", "fixture-console"));
  assert.equal(response.status, 503);
  assert.equal((await response.text()).includes("fixture-storage-secret"), false);
});
test("console actions reject citizens and body-supplied agent IDs", async () => {
  const id = "10000000-0000-4000-8000-000000000001";
  const command = { commandId: id, baseRevision: 0, action: "claim" };
  const calls: unknown[] = [];
  const apply = createConsoleActionApi(async (sessionId, agent, payload) => {
    calls.push({ sessionId, agent, payload });
    return { status: "committed", data: { state: "serving" } };
  }, { CONSOLE_TOKEN: "fixture-console", CONSOLE_AGENT_ID: "fixture-agent" });
  const request = (token: string, body: object) => new Request("https://example.test/actions", {
    method: "POST", headers: { authorization: "Bearer " + token }, body: JSON.stringify(body),
  });
  assert.equal((await apply(request("cit_fixture", command), id)).status, 401);
  assert.equal((await apply(request("fixture-console", { ...command, agentId: "spoof" }), id)).status, 400);
  assert.equal(calls.length, 0);
  const response = await apply(request("fixture-console", command), id);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(calls, [{ sessionId: id, agent: "fixture-agent", payload: command }]);
});
test("action failures return status envelopes and never expose storage diagnostics", async () => {
  const id = "10000000-0000-4000-8000-000000000001";
  const input = { commandId: id, baseRevision: 0, action: "claim" };
  const request = (body: string) => new Request("https://example.test/actions", {
    method: "POST", headers: { authorization: "Bearer fixture-console" }, body,
  });
  let result: unknown = { status: "conflict", revision: 2 };
  const apply = createConsoleActionApi(async () => {
    if (result === null) throw new Error("protected-storage-diagnostic");
    return result;
  }, { CONSOLE_TOKEN: "fixture-console" });
  assert.equal((await apply(request("bad json"), id)).status, 400);
  assert.equal((await apply(request(JSON.stringify(input)), "bad-id")).status, 400);
  const conflict = await apply(request(JSON.stringify(input)), id);
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).currentRevision, 2);
  result = { status: "not_found" };
  assert.equal((await apply(request(JSON.stringify(input)), id)).status, 404);
  result = { status: "invalid_candidate" };
  assert.equal((await apply(request(JSON.stringify(input)), id)).status, 400);
  result = null;
  const failure = await apply(request(JSON.stringify(input)), id);
  assert.equal(failure.status, 503);
  assert.equal((await failure.text()).includes("protected-storage-diagnostic"), false);
});