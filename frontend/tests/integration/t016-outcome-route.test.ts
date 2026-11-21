import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../../src/app/api/sessions/[id]/outcome/route";
import { issueCitizenToken } from "../../src/lib/server/auth";

test("outcome route authenticates, validates and forwards only a trusted snapshot hash", async (t) => {
  const id = "10000000-0000-4000-8000-000000000001";
  const commandId = "10000000-0000-4000-8000-000000000002";
  const { token, tokenHash } = issueCitizenToken();
  const settings = {
    SUPABASE_URL: "https://example.invalid",
    SUPABASE_SECRET_KEY: "test-credential",
    BRIDGE_DEMO_OWNER_ID: id,
    BRIDGE_SESSION_SIGNING_SECRET: "fixture-secret-".repeat(4),
    BRIDGE_CORPUS_VERSION: "fixture",
  };
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  Object.assign(process.env, settings);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  const timestamp = "2026-11-21T00:00:00Z";
  const snapshot = {
    id, revision: 3, state: "active", citizenTokenHash: tokenHash, activeIssueId: null,
    issueIds: [], transcript: [], handoffId: null, pendingRequestId: null, corpusVersion: "fixture",
    businessDate: "2026-11-21", createdAt: timestamp, updatedAt: timestamp, outcome: "unknown",
    outcomeConfirmedAt: null,
  };
  const outcomeCalls: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.origin, settings.SUPABASE_URL);
    if (url.pathname === "/rest/v1/rpc/bridge_load_session") return Response.json(snapshot);
    assert.equal(url.pathname, "/rest/v1/rpc/bridge_record_citizen_outcome");
    const args = JSON.parse(String(init?.body));
    outcomeCalls.push(args);
    return args.p_base === 3 ? Response.json({ status: "committed",
      data: { state: "active", revision: 4, outcome: "unknown" } }) :
      Response.json({ status: "conflict", revision: 3 });
  });

  const submit = (authorization: string, decision: string, baseRevision = 3) => POST(
    new Request("https://example.test/api/sessions/" + id + "/outcome", {
      method: "POST", headers: { authorization },
      body: JSON.stringify({ commandId, baseRevision, decision }),
    }), { params: Promise.resolve({ id }) });
  assert.equal((await submit("", "resolved")).status, 401);
  assert.equal((await submit("Bearer wrong-token", "resolved")).status, 403);
  assert.equal((await submit("Bearer " + token, "automatic")).status, 400);
  assert.equal(outcomeCalls.length, 0);

  const stale = await submit("Bearer " + token, "need_more", 2);
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).currentRevision, 3);
  const accepted = await submit("Bearer " + token, "need_more");
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers.get("cache-control"), "no-store");
  assert.deepEqual((await accepted.json()).data, { state: "active", revision: 4, outcome: "unknown" });
  assert.deepEqual(outcomeCalls.at(-1), {
    p_session: id, p_command: commandId, p_base: 3, p_token_hash: tokenHash, p_decision: "need_more",
  });
});
