import assert from "node:assert/strict";
import { test } from "node:test";
import corpus from "../../../data/normalized/corpus.json";
import { POST } from "../../src/app/api/sessions/[id]/turns/route";

test("the actual turns route requires authentication in both deployment modes", async () => {
  const settings = {
    BRIDGE_ENABLE_DIALOGUE: "1",
    BRIDGE_CORPUS_VERSION: corpus.corpusVersion,
    OPENAI_API_KEY: "unused-test-key",
    OPENAI_MODEL: "unused-test-model",
    SUPABASE_URL: "https://example.invalid",
    SUPABASE_SECRET_KEY: "unused-test-secret",
  };
  const original = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  const id = "10000000-0000-4000-8000-000000000001";
  try {
    for (const enabled of ["0", "1"]) {
      Object.assign(process.env, settings, { BRIDGE_ENABLE_DIALOGUE: enabled });
      const response = await POST(new Request("http://localhost/api/sessions/" + id + "/turns",
        { method: "POST" }), { params: Promise.resolve({ id }) });
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error.code, "unauthorized");
    }
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
