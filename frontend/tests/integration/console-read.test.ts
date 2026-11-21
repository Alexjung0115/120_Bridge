import assert from "node:assert/strict";
import { test } from "node:test";
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