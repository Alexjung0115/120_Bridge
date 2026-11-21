// TEMPORARY (#4/#5): Exercise the isolated Next.js and FastAPI apps with synthetic cases only.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const { cases } = JSON.parse(
  await readFile(new URL("./fixtures/temporary-ai-contract.json", import.meta.url), "utf8"),
)

function post(origin, payload) {
  return fetch(`${origin}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  })
}

for (const scenario of cases) {
  const response = await post("http://127.0.0.1:3001/api", scenario.request)
  const result = await response.json()
  assert.equal(response.status, 200, JSON.stringify(result))
  assert.equal(result.temporary, true)
  assert.equal(result.answerUnits.length > 0 ? "answer" : "no_evidence", scenario.expectedOutcome)

  if (scenario.expectedOutcome === "answer") {
    const { excerpt } = scenario.evidence[0]
    const { chunkId, claimKey, quote } = excerpt
    assert.ok(result.answerUnits.length > 0)
    for (const unit of result.answerUnits) {
      assert.deepEqual(unit.citations, [{ chunkId, claimKey, quote }])
    }
  } else {
    assert.deepEqual(result.answerUnits, [])
    assert.equal(result.issues[0].needsPersonalLookup, true)
  }
  console.log(`200 ${scenario.name}`)
}

const unknown = await post("http://127.0.0.1:3001/api", { ...cases[0].request, text: "다른 입력" })
assert.equal(unknown.status, 422)
assert.equal((await unknown.json()).detail.code, "temporary_fixture_only")
console.log("422 unknown fixture")

const unauthenticated = await post("http://127.0.0.1:8000", cases[0].request)
assert.equal(unauthenticated.status, 401)
assert.equal((await unauthenticated.json()).detail.code, "unauthorized")
console.log("401 missing internal token")
