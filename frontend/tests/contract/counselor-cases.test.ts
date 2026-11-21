import assert from "node:assert/strict";
import { test } from "node:test";
import { createCounselorCasesApi } from "../../src/lib/server/counselor-cases";

test("case list validates filters and only exposes list fields", async () => {
  let called = false;
  const id = "10000000-0000-4000-8000-000000000001";
  const api = createCounselorCasesApi(async (status, cursor) => {
    called = true;
    assert.equal(status, "serving");
    assert.equal(cursor, null);
    return { rows: [{ session_id: id, payload: { status: "serving", receivedAt: "2026-11-21T00:00:00Z", transcriptSnapshot: ["private"] } }], allStatuses: true };
  });
  assert.equal((await api(new Request("https://example.test/?status=other"))).status, 400);
  assert.equal((await api(new Request("https://example.test/?cursor=bad"))).status, 400);
  assert.equal(called, false);
  const response = await api(new Request("https://example.test/?status=serving"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.deepEqual(body.data.items, [{ sessionId: id, status: "serving", receivedAt: "2026-11-21T00:00:00Z" }]);
  assert.equal(JSON.stringify(body).includes("private"), false);
});
