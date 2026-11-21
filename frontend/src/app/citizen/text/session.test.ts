import assert from "node:assert/strict";
import test from "node:test";
import { createTextSession } from "./session";

const sessionId = "b05653c7-3f7d-4a1f-9cb5-820bb62576ac";
const sessionPath = `/api/sessions/${sessionId}`;
const citizenToken = "test-citizen-token";
const opened = { sessionId, citizenToken, revision: 0, state: "active" };

function envelope(data: object, status = 200) {
  return Response.json({ schemaVersion: 1, requestId: crypto.randomUUID(), data }, { status });
}

function receipt(init: RequestInit, revision: number, utterances: { id: string; text: string }[] = [], processing = false) {
  const { commandId } = JSON.parse(String(init.body));
  return envelope({ turnId: commandId, revision, state: "active", processing, utterances, cards: [], issues: [] },
    processing ? 202 : 200);
}

test("opens one text session and sends bearer-authenticated turns with the latest revision", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (path: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    assert.equal(init.method, "POST");
    assert.equal(body.inputMode, "text");
    if (path === "/api/sessions") {
      assert.deepEqual(Object.keys(body).sort(), ["clientSessionKey", "inputMode"]);
      assert.equal(new Headers(init.headers).has("Authorization"), false);
      return envelope(opened, 201);
    }
    assert.equal(path, `${sessionPath}/turns`);
    assert.equal(new Headers(init.headers).get("Authorization"), `Bearer ${citizenToken}`);
    return body.baseRevision === 0 ? receipt(init, 1) : receipt(init, 2, [{ id: "reply-1", text: "어느 구인가요?" }]);
  });

  const send = createTextSession();
  const { signal } = new AbortController();
  assert.deepEqual(await send("폐기물 문의", signal), []);
  assert.deepEqual(await send("배출 방법을 알려 주세요", signal), ["어느 구인가요?"]);
  assert.equal(fetch.mock.callCount(), 3);
  const first = JSON.parse(String(fetch.mock.calls[1].arguments[1]?.body));
  const second = JSON.parse(String(fetch.mock.calls[2].arguments[1]?.body));
  assert.equal(first.text, "폐기물 문의");
  assert.equal(first.baseRevision, 0);
  assert.equal(second.baseRevision, 1);
  assert.notEqual(first.commandId, second.commandId);
});

test("preserves session and command keys when a response is lost", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (_path: string, init: RequestInit) => {
    switch (fetch.mock.callCount()) {
      case 0:
      case 2:
        throw new TypeError("network disconnected");
      case 1:
        return envelope(opened);
      default:
        return receipt(init, 1);
    }
  });

  const send = createTextSession();
  const { signal } = new AbortController();
  await assert.rejects(send("문의", signal), TypeError);
  await assert.rejects(send("문의", signal), TypeError);
  assert.deepEqual(await send("문의", signal), []);
  const bodies = fetch.mock.calls.map(({ arguments: [, init] }) => init?.body);
  assert.equal(bodies[0], bodies[1]);
  assert.equal(bodies[2], bodies[3]);
});

test("retries a rejected revision with a new command and the server's revision", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (path: string, init: RequestInit) => {
    if (path === "/api/sessions") return envelope(opened);
    const { baseRevision } = JSON.parse(String(init.body));
    if (baseRevision === 4) return receipt(init, 5);
    assert.equal(baseRevision, 0);
    return Response.json({
      schemaVersion: 1,
      requestId: crypto.randomUUID(),
      error: { code: "session_conflict", message: "최신 상담 상태를 확인해 주세요.", retryable: false },
      currentRevision: 4,
    }, { status: 409 });
  });
  const send = createTextSession();
  const { signal } = new AbortController();
  await assert.rejects(send("문의", signal), { message: "최신 상담 상태를 확인해 주세요." });
  assert.deepEqual(await send("문의", signal), []);
  const first = JSON.parse(String(fetch.mock.calls[1].arguments[1]?.body));
  const second = JSON.parse(String(fetch.mock.calls[2].arguments[1]?.body));
  assert.notEqual(first.commandId, second.commandId);
});

test("polls a processing turn and displays each returned utterance once", async (t) => {
  const reply = { id: "reply-1", text: "배출 장소를 알려 주세요." };
  const fetch = t.mock.method(globalThis, "fetch", async (path: string, init: RequestInit) => {
    if (path === "/api/sessions") return envelope(opened);
    if (path === sessionPath) {
      assert.equal(init.method, "GET");
      assert.equal(new Headers(init.headers).get("Authorization"), `Bearer ${citizenToken}`);
      return envelope({ revision: 2, processing: false, utterances: [reply] });
    }
    const { baseRevision } = JSON.parse(String(init.body));
    if (baseRevision === 0) return receipt(init, 1, [reply], true);
    assert.equal(baseRevision, 2);
    return receipt(init, 3, [reply, { id: "blank", text: " " }]);
  });

  const send = createTextSession();
  const { signal } = new AbortController();
  assert.deepEqual(await send("폐기물 문의", signal), [reply.text]);
  assert.deepEqual(await send("강남구", signal), []);
  assert.equal(fetch.mock.callCount(), 4);
});
