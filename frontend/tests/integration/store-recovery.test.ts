import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

import { createSessionStore } from "../../src/lib/store/session-store";
import {
  createSupabaseSessionPersistence,
  type JsonValue,
  type SavedCommand,
  type SessionPersistence,
} from "../../src/lib/store/snapshot";

const migrationDir = new URL("../../../supabase/migrations/", import.meta.url);
const uid = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const sessionId = uid(1);
const citizenId = uid(2);
const pendingId = uid(3);
const initial = {
  id: sessionId,
  revision: 0,
  citizenTokenHash: "fixture-hash",
  updatedAt: "2026-11-21T03:00:00.000Z",
  pendingRequestId: null as string | null,
  transcript: [] as { outputStatus: "pending" | "committed" | "discarded" }[],
};
const codec = (stored: unknown) => stored as typeof initial;

async function seed(db: PGlite) {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.jwt() returns jsonb language sql stable as $$
      select current_setting('request.jwt.claims', true)::jsonb
    $$;
    create function auth.uid() returns uuid language sql stable as $$
      select (auth.jwt()->>'sub')::uuid
    $$;
    grant usage on schema auth to authenticated, anon;
    create publication supabase_realtime;
  `);
  for (const name of ["20261121023000_consultations.sql", "20261121024000_session_snapshots.sql"]) {
    await db.exec(await readFile(new URL(name, migrationDir), "utf8"));
  }
  await db.query("insert into auth.users values ($1)", [citizenId]);
  await db.query(
    "insert into public.consultations (id, citizen_user_id, channel) values ($1, $2, 'text')",
    [sessionId, citizenId],
  );
}

function persistence(db: PGlite): SessionPersistence {
  async function select<Result>(query: string, params: unknown[]) {
    const { rows } = await db.query<{ value: Result }>(query, params);
    return rows[0].value;
  }

  return {
    load: (id) => select("select public.bridge_load_session($1) as value", [id]),
    initialize: (id, state) => select("select public.bridge_initialize_session($1, $2) as value", [id, state]),
    replay: (id, command) => select("select public.bridge_read_session_command($1, $2) as value", [id, command]),
    commit: (id, command, base, state, result) => select<SavedCommand>(
      "select public.bridge_commit_session_command($1, $2, $3, $4, $5) as value",
      [id, command, base, state, JSON.stringify(result)],
    ),
  };
}

test("a snapshot and its command receipt survive reopening the database", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bridge-snapshot-"));
  const command = { commandId: uid(4), baseRevision: 0 };
  try {
    const first = await PGlite.create(directory);
    try {
      await seed(first);
      await first.exec("set role service_role");
      const store = createSessionStore(persistence(first), codec);
      assert.equal(await store.load(sessionId), null);
      assert.equal(await store.initialize({ ...initial, id: uid(999) }), null);
      assert.deepEqual(await store.initialize(initial), initial);
      assert.deepEqual(await store.initialize({ ...initial, citizenTokenHash: "new-hash" }), initial);
      assert.deepEqual(await store.execute(sessionId, command, (state) => ({
        state: {
          ...state,
          pendingRequestId: pendingId,
          transcript: [{ outputStatus: "committed" }, { outputStatus: "pending" }],
        },
        result: { queued: true },
      })), { status: "committed", revision: 1, result: { queued: true } });
    } finally {
      await first.close();
    }

    const reopened = await PGlite.create(directory);
    try {
      await reopened.exec("set role service_role");
      const store = createSessionStore(persistence(reopened), codec);
      assert.equal((await store.load(sessionId))?.pendingRequestId, pendingId);
      assert.deepEqual(await store.execute(sessionId, command, () => assert.fail("replayed reducer")), {
        status: "replayed", revision: 1, result: { queued: true },
      });
      assert.deepEqual(await store.recoverInterrupted(sessionId, { commandId: uid(5), baseRevision: 1 }, uid(6)),
        { status: "skipped", revision: 1 });
      assert.deepEqual(await store.recoverInterrupted(sessionId, { commandId: uid(7), baseRevision: 1 }, pendingId),
        { status: "committed", revision: 2, result: { recovered: true } });
      const restored = await store.load(sessionId);
      assert.equal(restored?.pendingRequestId, null);
      assert.deepEqual(restored?.transcript, [{ outputStatus: "committed" }, { outputStatus: "discarded" }]);
    } finally {
      await reopened.close();
    }
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("competing writes with the same base revision persist only one result", async () => {
  const db = await PGlite.create();
  try {
    await seed(db);
    await db.exec("set role service_role");
    const storage = persistence(db);
    await storage.initialize(sessionId, initial);
    const updated = { ...initial, revision: 1 };
    const results = await Promise.all([
      storage.commit(sessionId, uid(10), 0, updated, "first"),
      storage.commit(sessionId, uid(11), 0, updated, "second"),
    ]);
    assert.deepEqual(results.map((entry) => entry.status).sort(), ["committed", "conflict"]);
    const replay = await storage.replay(sessionId, uid(10)) ?? await storage.replay(sessionId, uid(11));
    assert.equal(replay?.status, "replayed");
    const other = results.find((entry) => entry.status === "conflict");
    assert.equal(other?.revision, 1);
    const duplicateId = await storage.replay(sessionId, uid(10)) ? uid(10) : uid(11);
    assert.deepEqual(await storage.commit(sessionId, duplicateId, 0, updated, "ignored"), replay);
  } finally {
    await db.close();
  }
});

test("a failed receipt write rolls back the snapshot and leaves the revision reusable", async () => {
  const db = await PGlite.create();
  try {
    await seed(db);
    await db.exec("set role service_role");
    const storage = persistence(db);
    await storage.initialize(sessionId, initial);
    const updated = { ...initial, revision: 1 };
    await assert.rejects(db.query(
      "select public.bridge_commit_session_command($1, null, 0, $2, null)",
      [sessionId, updated],
    ), { code: "23502" });
    assert.deepEqual(await storage.load(sessionId), initial);
    assert.deepEqual(await storage.commit(sessionId, uid(20), 0, updated, null),
      { status: "committed", revision: 1, result: null });
  } finally {
    await db.close();
  }
});

test("citizen-facing RPCs and roles cannot expose snapshots or command receipts", async () => {
  const db = await PGlite.create();
  try {
    await seed(db);
    const storage = persistence(db);
    await db.exec("set role service_role");
    await storage.initialize(sessionId, initial);
    await assert.rejects(storage.commit(sessionId, uid(30), 0,
      { ...initial, revision: 1, citizenTokenHash: "different-hash" }, null), { code: "22023" });
    await assert.rejects(storage.commit(sessionId, uid(31), 0,
      { ...initial, revision: 1, citizenToken: "raw-fixture" }, null), { code: "22023" });
    await assert.rejects(storage.commit(sessionId, uid(32), 0,
      { ...initial, revision: 1 }, { nested: { citizenToken: "raw-fixture" } }), { code: "22023" });
    await assert.rejects(storage.commit(sessionId, uid(33), 0,
      { ...initial, revision: 1 }, { nested: [{ citizenTokenHash: "hash-fixture" }] }), { code: "22023" });
    assert.deepEqual(await storage.load(sessionId), initial);
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: citizenId })]);
    for (const role of ["authenticated", "anon"]) {
      await db.exec("set role " + role);
      await assert.rejects(storage.load(sessionId), { code: "42501" });
      await assert.rejects(storage.replay(sessionId, uid(30)), { code: "42501" });
      await assert.rejects(db.query("select * from public.bridge_session_snapshots"), { code: "42501" });
      await assert.rejects(db.query("select * from public.bridge_session_commands"), { code: "42501" });
      await db.exec("reset role");
    }
    await db.exec("set role authenticated");
    const { rows } = await db.query<Record<string, unknown>>("select * from public.open_bridge_consultation($1, 'text')", [sessionId]);
    assert.equal(rows[0].id, sessionId);
    assert.equal("session_snapshot" in rows[0], false);
  } finally {
    await db.close();
  }
});

test("REST persistence only uses the configured RPC origin and maps upstream failures", async (context) => {
  const mocked = context.mock.method(globalThis, "fetch",
    async (...args: Parameters<typeof fetch>) => {
      const [url] = args;
      return String(url).endsWith("bridge_load_session")
        ? Response.json(initial)
        : new Response("private details", { status: 503 });
    });
  const storage = createSupabaseSessionPersistence("https://db.example.org", "fixture-role");
  assert.deepEqual(await storage.load(sessionId), initial);
  const [url, options] = mocked.mock.calls[0].arguments;
  assert.equal(String(url), "https://db.example.org/rest/v1/rpc/bridge_load_session");
  assert.equal(options?.cache, "no-store");
  assert.equal(options?.redirect, "error");
  assert.equal(new Headers(options?.headers).get("Authorization"), "Bearer fixture-role");
  await assert.rejects(storage.replay(sessionId, uid(40)), { message: "Session persistence request failed (503)." });
  await assert.rejects(storage.initialize(sessionId, initial), { message: "Session persistence request failed (503)." });
  await assert.rejects(storage.commit(sessionId, uid(41), 0, { ...initial, revision: 1 }, null),
    { message: "Session persistence request failed (503)." });
  const [commitUrl, commitOptions] = mocked.mock.calls[3].arguments;
  assert.equal(String(commitUrl), "https://db.example.org/rest/v1/rpc/bridge_commit_session_command");
  assert.deepEqual(JSON.parse(String(commitOptions?.body)), {
    p_session: sessionId, p_command: uid(41), p_base: 0,
    p_snapshot: { ...initial, revision: 1 }, p_result: null,
  });

  const secretStorage = createSupabaseSessionPersistence("https://db.example.org", "sb_secret_fixture");
  await secretStorage.load(sessionId);
  const headers = new Headers(mocked.mock.calls[4].arguments[1]?.headers);
  assert.equal(headers.get("apikey"), "sb_secret_fixture");
  assert.equal(headers.get("Authorization"), null);
});

test("store distinguishes missing, stale and exhausted revisions", async () => {
  let loaded: unknown = null;
  const storage: SessionPersistence = {
    load: async () => loaded,
    initialize: async () => null,
    replay: async () => null,
    commit: async (
      _id: string, _command: string, _base: number, _state: unknown, _result: JsonValue,
    ) => assert.fail("unexpected commit"),
  };
  const store = createSessionStore(storage, codec);
  const apply = () => assert.fail("unexpected reducer");
  const command = { commandId: uid(50), baseRevision: 0 };
  assert.deepEqual(await store.execute(sessionId, command, apply), { status: "not_found" });
  loaded = { ...initial, revision: 1 };
  assert.deepEqual(await store.execute(sessionId, command, apply), { status: "conflict", revision: 1 });
  loaded = { ...initial, revision: Number.MAX_SAFE_INTEGER };
  assert.deepEqual(await store.execute(sessionId, { ...command, baseRevision: Number.MAX_SAFE_INTEGER }, apply),
    { status: "conflict", revision: Number.MAX_SAFE_INTEGER });
});
test("session admission checks retries ahead of the five-session ceiling", async () => {
  const db = await PGlite.create();
  try {
    await seed(db);
    await db.exec(await readFile(new URL("20261121025000_open_session.sql", migrationDir), "utf8"));
    await db.exec("set role service_role");
    async function open(id: string, mode = "text") {
      const { rows } = await db.query<{ result: { status: string } }>(
        "select public.bridge_open_session($1, $2, $3, $4) as result",
        [citizenId, id, mode, { ...initial, id, state: "active" }],
      );
      return rows[0].result.status;
    }
    for (const index of [101, 102, 103, 104, 105]) assert.equal(await open(uid(index)), "created");
    assert.equal(await open(uid(106)), "limit");
    assert.equal(await open(uid(101)), "existing");
    assert.equal(await open(uid(101), "voice"), "conflict");
    await db.exec("reset role");
    await db.exec("set role anon");
    await assert.rejects(open(uid(107)), { code: "42501" });
  } finally {
    await db.close();
  }
});
test("approved handoff delivery atomically publishes one protected queue entry", async () => {
  const db = await PGlite.create();
  try {
    await seed(db);
    await db.exec(await readFile(new URL("20261121030000_console_handoffs.sql", migrationDir), "utf8"));
    await db.exec(await readFile(new URL("20261121031000_console_actions.sql", migrationDir), "utf8"));
    await db.exec(await readFile(new URL("20261121031500_citizen_correction.sql", migrationDir), "utf8"));
    await db.exec("set role service_role");
    const storage = persistence(db);
    await storage.initialize(sessionId, { ...initial, state: "sending", corpusVersion: "fixture-v1" });
    const payload = {
      id: uid(201), idempotencyKey: uid(202), summaryId: uid(203), summaryRevision: 1,
      summary: { id: uid(203), revision: 1, sessionRevision: 0, confirmation: "confirmed", confirmedAt: initial.updatedAt },
      unresolvedIssueIds: [], resolvedContextIds: [], candidates: [{ id: uid(220) }],
    };
    async function deliver(input: object, revision = 0) {
      const { rows } = await db.query<{ data: { status: string } }>(
        "select public.bridge_deliver_handoff($1,$2,$3) as data", [sessionId, revision, input]);
      return rows[0].data;
    }
    assert.equal((await deliver(payload, 1)).status, "conflict");
    await assert.rejects(deliver({ ...payload, summary: { ...payload.summary, confirmation: "unconfirmed" } }), { code: "22023" });
    assert.equal((await deliver(payload)).status, "conflict");
    const approved = await db.query<{ approved: boolean }>(
      "select public.bridge_record_handoff_approval($1,0,$2) as approved", [sessionId, payload.summary]);
    assert.equal(approved.rows[0].approved, true);
    assert.equal((await deliver({ ...payload, summary: { ...payload.summary, coreLines: ["변조"] } })).status, "conflict");
    assert.equal((await deliver(payload)).status, "sending");
    const unpublished = await db.query<{ data: { items: unknown[] } }>(
      "select public.bridge_console_queue(null) as data");
    assert.equal(unpublished.rows[0].data.items.length, 0);
    const hidden = await db.query<{ data: unknown }>("select public.bridge_console_detail($1) as data", [sessionId]);
    assert.equal(hidden.rows[0].data, null);
    const ack = async () => (await db.query<{ data: { status: string } }>(
      "select public.bridge_acknowledge_handoff($1,0,$2) as data", [sessionId, payload.idempotencyKey])).rows[0].data;
    assert.equal((await ack()).status, "queued");
    assert.equal((await ack()).status, "replayed");
    assert.equal((await deliver(payload)).status, "replayed");
    assert.equal((await deliver({ ...payload, idempotencyKey: uid(204) })).status, "conflict");
    const snapshot = codec(await storage.load(sessionId));
    assert.equal(snapshot.revision, 1);
    const { rows: queue } = await db.query<{ data: { items: { sessionId: string; handoffId: string }[] } }>(
      "select public.bridge_console_queue(null) as data");
    assert.equal(queue[0].data.items.length, 1);
    assert.equal(queue[0].data.items[0].handoffId, payload.id);
    const { rows: detail } = await db.query<{ data: Record<string, unknown> }>(
      "select public.bridge_console_detail($1) as data", [sessionId]);
    assert.equal(detail[0].data.state, "queued");
    assert.equal(detail[0].data.acknowledgedRevision, 1);
    assert.equal("citizenTokenHash" in detail[0].data, false);
    async function stage(id: string, text: string, base = 1) {
      const { rows } = await db.query<{ data: { status: string } }>(
        "select public.bridge_stage_handoff_correction($1,$2,$3,$4) as data",
        [sessionId, base, id, text]);
      return rows[0].data.status;
    }
    const premature = await db.query<{ data: { status: string } }>(
      "select public.bridge_correct_handoff($1,1,$2,$3) as data",
      [sessionId, uid(210), { ...payload.summary, revision: 2, sessionRevision: 1 }]);
    assert.equal(premature.rows[0].data.status, "conflict");
    async function submit(handoffId: string, revision: number, tokenHash: string, correctionText = "정정 내용") {
      const { rows } = await db.query<{ data: { status: string } }>(
        "select public.bridge_submit_citizen_correction($1,1,$2,$3,$4,$5,$6) as data",
        [sessionId, uid(210), handoffId, revision, correctionText, tokenHash]);
      return rows[0].data.status;
    }
    assert.equal(await submit(payload.id, 1, "wrong-hash"), "forbidden");
    assert.equal(await submit(uid(299), 1, initial.citizenTokenHash), "conflict");
    assert.equal(await submit(payload.id, 0, initial.citizenTokenHash), "conflict");
    assert.equal(await submit(payload.id, 1, initial.citizenTokenHash), "pending_confirmation");
    assert.equal(await submit(payload.id, 1, initial.citizenTokenHash), "pending_confirmation");
    assert.equal(await submit(payload.id, 1, initial.citizenTokenHash, "다른 내용"), "conflict");
    assert.equal(await stage(uid(210), "정정 내용"), "pending_confirmation");
    const pending = (await db.query<{ data: Record<string, unknown> }>(
      "select public.bridge_console_detail($1) as data", [sessionId])).rows[0].data;
    assert.equal(pending.deliveryRevision, 2);
    assert.equal(pending.acknowledgedRevision, 1);
    assert.equal(await stage(uid(211), "다른 정정", 2), "conflict");
    async function perform(command: string, base: number, name: string, candidate: string | null = null, outcome: object | null = null) {
      const { rows } = await db.query<{ data: { status: string; data?: Record<string, unknown> } }>(
        "select public.bridge_apply_console_action($1,$2,$3,$4,$5,$6,$7) as data",
        [sessionId, command, base, "fixture-agent", name, candidate, outcome]);
      return rows[0].data;
    }
    assert.equal((await perform(uid(221), 2, "claim")).status, "conflict");
    const amended = { ...payload.summary, revision: 2, sessionRevision: 2, coreLines: ["정정 내용"] };
    const correction = async () => (await db.query<{ data: { status: string; handoffId: string } }>(
      "select public.bridge_correct_handoff($1,2,$2,$3) as data", [sessionId, uid(210), amended])).rows[0].data;
    const corrected = await correction();
    assert.equal(corrected.status, "queued");
    assert.equal(corrected.handoffId, payload.id);
    assert.equal((await correction()).status, "replayed");
    assert.equal(await submit(payload.id, 1, initial.citizenTokenHash), "replayed");
    assert.equal(await submit(payload.id, 1, initial.citizenTokenHash, "다른 내용"), "conflict");
    const correctedDetail = (await db.query<{ data: Record<string, unknown> }>(
      "select public.bridge_console_detail($1) as data", [sessionId])).rows[0].data;
    assert.equal(correctedDetail.acknowledgedRevision, 2);
    assert.deepEqual(correctedDetail.summary, amended);
    assert.deepEqual(correctedDetail.summaryHistory, [{ correctionId: uid(210), summary: payload.summary, deliveryRevision: 1 }]);
    const claim = await perform(uid(212), 3, "claim");
    assert.equal(claim.status, "committed");
    assert.equal(claim.data?.state, "serving");
    assert.equal((await perform(uid(222), 3, "claim")).status, "conflict");
    assert.deepEqual((await perform(uid(212), 3, "claim")).data, claim.data);
    assert.equal(await stage(uid(213), "수락 이후 정정", 3), "conflict");
    assert.equal(await stage(uid(213), "수락 이후 정정", 3), "conflict");
    const afterClaim = (await db.query<{ data: Record<string, unknown> }>(
      "select public.bridge_console_detail($1) as data", [sessionId])).rows[0].data;
    assert.deepEqual(afterClaim.correctionConflicts, [{ id: uid(213), text: "수락 이후 정정" }]);
    assert.equal((await perform(uid(223), 4, "transfer_demo", uid(299))).status, "invalid_candidate");
    assert.equal((await perform(uid(224), 4, "transfer_demo", uid(220))).data?.state, "transferred_demo");
    const outcome = { resolutionNote: "민원 비공개 기록", repeatExplanationCount: 0 };
    const completed = await perform(uid(225), 5, "complete_case", null, outcome);
    assert.equal(completed.data?.state, "completed_demo");
    assert.deepEqual((await perform(uid(225), 5, "complete_case", null, outcome)).data, completed.data);
    assert.equal((await perform(uid(225), 5, "complete_case", null, { ...outcome, repeatExplanationCount: 1 })).status, "conflict");
    assert.equal((await perform(uid(225), 6, "complete_case", null, outcome)).status, "conflict");
    assert.equal(JSON.stringify(completed.data).includes(outcome.resolutionNote), false);
    assert.equal((await perform(uid(226), 6, "complete_case", null, outcome)).status, "conflict");
    await db.exec("reset role");
    const events = (await db.query<{ event_type: string; repeat_explanation_count: number | null }>(
      "select event_type, repeat_explanation_count from public.bridge_metric_events order by event_type")).rows;
    assert.deepEqual(events.map((event) => event.event_type),
      ["agent_claimed", "case_completed", "repeat_explanation_recorded", "session_ended"]);
    assert.equal(events[2].repeat_explanation_count, 0);
    await db.exec("reset role");
    await db.exec("set role authenticated");
    await assert.rejects(db.query("select public.bridge_console_queue(null)"), { code: "42501" });
  } finally {
    await db.close();
  }
});