import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";

// CommonJS resolution also supports NODE_PATH in the isolated demo worktree.
const require = createRequire(import.meta.url);
const { PGlite }: typeof import("@electric-sql/pglite") = require("@electric-sql/pglite");
const migrationDir = new URL("../../../supabase/migrations/", import.meta.url);

test("text consultation reaches the console and persists the counselor claim", async (t) => {
  const db = await PGlite.create();
  t.after(() => db.close());
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
  for (const name of (await readdir(migrationDir)).filter((file) => file.endsWith(".sql")).sort()) {
    try {
      await db.exec(await readFile(new URL(name, migrationDir), "utf8"));
    } catch (cause) {
      throw new Error(`Migration failed: ${name}`, { cause });
    }
  }

  const owner = "10000000-0000-4000-8000-000000000001";
  const sessionId = "10000000-0000-4000-8000-000000000002";
  const turnId = "10000000-0000-4000-8000-000000000003";
  const handoffId = "10000000-0000-4000-8000-000000000004";
  const claimId = "10000000-0000-4000-8000-000000000005";
  const agentId = "demo-counselor";
  const citizenText = "대형 폐기물은 어떻게 신고하나요?";
  const citizenTokenHash = "demo-token-hash";
  const timestamp = "2026-11-21T03:00:00.000Z";
  const initial = {
    id: sessionId, revision: 0, state: "active", citizenTokenHash,
    createdAt: timestamp, updatedAt: timestamp, businessDate: "2026-11-21",
    activeIssueId: null, issueIds: [], transcript: [], handoffId: null,
    pendingRequestId: null, corpusVersion: "demo", outcome: "unknown", outcomeConfirmedAt: null,
  };

  async function rpc<Result>(sql: string, params: unknown[] = []) {
    const { rows } = await db.query<{ value: Result }>(sql, params);
    return rows[0].value;
  }

  type Receipt = {
    status: string;
    data: { state: string; revision: number; turnId?: string; handoffId?: string; agentId?: string };
  };
  type Queue = { items: { sessionId: string; handoffId: string; status: string }[]; nextCursor: string | null };
  await db.query("insert into auth.users (id) values ($1)", [owner]);
  await db.exec("set role service_role");

  const opened = await rpc<{ status: string; snapshot: typeof initial }>(
    "select public.bridge_open_session($1, $2, 'text', $3) as value",
    [owner, sessionId, initial],
  );
  assert.deepEqual(opened, { status: "created", snapshot: initial });

  const turn = await rpc<Receipt>(
    "select public.bridge_mvp_citizen_command($1, $2, $3, $4, 'turn', $5) as value",
    [sessionId, turnId, opened.snapshot.revision, citizenTokenHash, citizenText],
  );
  assert.equal(turn.status, "committed");
  assert.equal(turn.data.turnId, turnId);
  assert.equal(turn.data.state, "active");
  assert.equal(turn.data.revision, 1);

  const handoff = await rpc<Receipt & { data: { delivery: { summary: { coreLines: string[] } } } }>(
    "select public.bridge_mvp_citizen_command($1, $2, $3, $4, 'direct_handoff', null) as value",
    [sessionId, handoffId, turn.data.revision, citizenTokenHash],
  );
  assert.equal(handoff.status, "committed");
  assert.equal(handoff.data.handoffId, handoffId);
  assert.equal(handoff.data.state, "queued");
  assert.equal(handoff.data.revision, 3);
  assert.deepEqual(handoff.data.delivery.summary.coreLines, [citizenText]);

  const queueSql = "select public.bridge_console_queue(null) as value";
  const queue = await rpc<Queue>(queueSql);
  assert.deepEqual(queue.items.map(({ sessionId, handoffId, status }) => ({ sessionId, handoffId, status })), [
    { sessionId, handoffId, status: "queued" },
  ]);
  assert.equal(queue.nextCursor, null);

  const claim = await rpc<Receipt>(
    "select public.bridge_apply_console_action($1, $2, $3, $4, 'claim', null, null) as value",
    [queue.items[0].sessionId, claimId, handoff.data.revision, agentId],
  );
  assert.equal(claim.status, "committed");
  assert.equal(claim.data.handoffId, handoffId);
  assert.equal(claim.data.agentId, agentId);
  assert.equal(claim.data.state, "serving");
  assert.equal(claim.data.revision, 4);
  const cases = await rpc<{ session_id: string; payload: { status: string } }[]>(
    "select public.bridge_console_cases($1, null) as value", ["serving"],
  );
  assert.deepEqual(cases.map(({ session_id, payload }) => ({ id: session_id, status: payload.status })), [
    { id: sessionId, status: "serving" },
  ]);
  assert.deepEqual(await rpc("select public.bridge_console_cases($1, null) as value", ["completed"]), []);

  const loaded = await rpc<{
    id: string;
    state: string;
    revision: number;
    handoffId: string;
    outcome: string;
    transcript: { id: string; text: string; inputMode: string; outputStatus: string }[];
  }>("select public.bridge_load_session($1) as value", [sessionId]);
  assert.equal(loaded.id, sessionId);
  assert.equal(loaded.handoffId, handoffId);
  assert.equal(loaded.state, "serving");
  assert.equal(loaded.revision, 4);
  assert.equal(loaded.outcome, "handoff");
  assert.deepEqual(loaded.transcript.map(({ id, text, inputMode, outputStatus }) => (
    { id, text, inputMode, outputStatus }
  )), [{ id: turnId, text: citizenText, inputMode: "text", outputStatus: "committed" }]);
  assert.deepEqual(await rpc<Queue>(queueSql), { items: [], nextCursor: null });
  const confirmedSession = "10000000-0000-4000-8000-000000000006";
  const draftId = "10000000-0000-4000-8000-000000000007";
  const approveId = "10000000-0000-4000-8000-000000000008";
  await rpc("select public.bridge_open_session($1,$2,'text',$3) as value",
    [owner, confirmedSession, { ...initial, id: confirmedSession }]);
  const summaryCommand = (id: string, base: number, summaryRevision: number | null) => rpc<Receipt>(
    "select public.bridge_citizen_summary_command($1,$2,$3,$4,$5) as value",
    [confirmedSession, id, base, citizenTokenHash, summaryRevision]);
  const draft = await summaryCommand(draftId, 0, null);
  assert.equal(draft.data.state, "summary_confirm");
  assert.equal((await rpc<Queue>(queueSql)).items.length, 0);
  assert.equal((await summaryCommand(approveId, 1, 2)).status, "conflict");
  const approved = await summaryCommand(approveId, 1, 1);
  assert.equal(approved.data.state, "queued");
  assert.equal((await summaryCommand(approveId, 1, 1)).status, "replayed");
  assert.equal((await rpc<Queue>(queueSql)).items.length, 1);
  const detail = await rpc<{ summary: { confirmation: string } }>(
    "select public.bridge_console_detail($1) as value", [confirmedSession]);
  assert.equal(detail.summary.confirmation, "confirmed");
  const outcomeSession = "10000000-0000-4000-8000-000000000010";
  await rpc("select public.bridge_open_session($1,$2,'text',$3) as value",
    [owner, outcomeSession, { ...initial, id: outcomeSession }]);
  const cmd = "10000000-0000-4000-8000-000000000011";
  const early = await rpc<{ status: string }>(
    "select public.bridge_record_citizen_outcome($1,$2,0,$3,'resolved') as value",
    [outcomeSession, cmd, citizenTokenHash]);
  assert.equal(early.status, "conflict");
  const outcome = (key: string, rev: number, hash: string, decision: string) => rpc<{
    status: string; data?: { state: string; revision: number; outcome: string };
  }>("select public.bridge_record_citizen_outcome($1,$2,$3,$4,$5) as value",
    [outcomeSession, key, rev, hash, decision]);
  assert.equal((await outcome(cmd, 0, "wrong-token", "need_more")).status, "forbidden");
  assert.deepEqual(await outcome(cmd, 0, citizenTokenHash, "need_more"), {
    status: "committed", data: { state: "active", revision: 1, outcome: "unknown" },
  });
  assert.equal((await outcome(cmd, 0, citizenTokenHash, "resolved")).status, "conflict");
  const issue = "10000000-0000-4000-8000-000000000012";
  await rpc("select public.bridge_commit_session_command($1,$2,1,$3,'{}') as value", [
    outcomeSession, issue, { ...initial, id: outcomeSession, revision: 2,
      issueIds: [issue], issues: [{ id: issue, status: "advised" }],
      transcript: [{ role: "assistant", factCitations: [{ chunkId: "test-citation" }] }],
    },
  ]);
  const confirm = "10000000-0000-4000-8000-000000000013";
  assert.equal((await outcome(confirm, 1, citizenTokenHash, "resolved")).status, "conflict");
  assert.deepEqual(await outcome(confirm, 2, citizenTokenHash, "resolved"), {
    status: "committed", data: { state: "ended", revision: 3, outcome: "ai_confirmed" },
  });
  assert.equal((await outcome(confirm, 2, citizenTokenHash, "resolved")).status, "replayed");
  const metrics = await rpc<{ events: Array<{ sessionId: string; eventType: string }> }>(
    "select public.bridge_console_metrics_input(clock_timestamp()) as value");
  assert.equal(metrics.events.filter(({ sessionId, eventType }) =>
    sessionId === outcomeSession && eventType === "session_ended").length, 1);

});
