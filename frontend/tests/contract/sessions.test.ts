import assert from "node:assert/strict";
import { test } from "node:test";
import { createSessionApi } from "../../src/lib/server/session-api";

import { sessionCreated, sessionReadMetadata } from "../../src/lib/server/session-response";

const session = {
  id: "10000000-0000-4000-8000-000000000001",
  revision: 1,
  state: "active" as const,
  activeIssueId: null,
  pendingRequestId: "10000000-0000-4000-8000-000000000002",
  citizenTokenHash: "fixture-hash",
};

test("only the creation payload includes the newly issued citizen credential", () => {
  assert.deepEqual(sessionCreated(session, "fixture-token"), {
    sessionId: session.id,
    citizenToken: "fixture-token",
    revision: 1,
    state: "active",
  });
  assert.deepEqual(sessionReadMetadata(session), {
    revision: 1,
    state: "active",
    presentationState: "consulting",
    processing: true,
    activeIssueId: null,
  });
});

test("queued sessions are waiting until a counselor accepts", () => {
  const queued = sessionReadMetadata({ ...session, state: "queued" });
  assert.equal(queued.presentationState, "waiting");
  assert.equal(queued.processing, false);
  for (const state of ["serving", "transferred_demo", "completed_demo"] as const) {
    const accepted = sessionReadMetadata({ ...session, state, activeIssueId: session.id });
    assert.equal(accepted.presentationState, "connection_complete");
    assert.equal(accepted.processing, false);
    assert.equal(accepted.state, "serving");
    assert.equal(accepted.activeIssueId, null);
  }
});
test("session requests replay safely and citizen reads omit credentials", async () => {
  type Snapshot = Parameters<Parameters<typeof createSessionApi>[0]["open"]>[1];
  let stored: Snapshot | null = null;
  const api = createSessionApi({
    async open(mode, snapshot) {
      if (mode === "voice") return { status: "limit" };
      if (stored) return { status: "existing", snapshot: stored };
      stored = snapshot;
      return { status: "created", snapshot };
    },
    async load(id) { return stored?.id === id ? stored : null; },
  }, "fixture-secret-".repeat(4), "fixture");
  const body = { clientSessionKey: "10000000-0000-4000-8000-000000000009", inputMode: "text" };
  const create = (data: object) => api.create(new Request("https://example.test/api/sessions", {
    method: "POST", body: JSON.stringify(data),
  }));
  assert.equal((await create({ ...body, clientSessionKey: "guessable" })).status, 400);
  assert.equal((await create({ ...body, inputMode: "voice" })).status, 429);
  const first = await create(body);
  assert.equal(first.status, 201);
  assert.equal(first.headers.get("cache-control"), "no-store");
  const { data } = await first.json();
  const retry = await create(body);
  assert.equal(retry.status, 200);
  assert.deepEqual((await retry.json()).data, data);
  const read = (token?: string) => api.read(new Request("https://example.test/api/sessions/" + data.sessionId, {
    headers: token ? { authorization: "Bearer " + token } : undefined,
  }), data.sessionId);
  assert.equal((await read()).status, 401);
  assert.equal((await read("incorrect")).status, 403);
  const valid = await read(data.citizenToken);
  assert.equal(valid.status, 200);
  assert.equal(valid.headers.get("cache-control"), "no-store");
  const response = await valid.text();
  assert.equal(response.includes(data.citizenToken), false);
  assert.equal(response.includes("citizenTokenHash"), false);
});