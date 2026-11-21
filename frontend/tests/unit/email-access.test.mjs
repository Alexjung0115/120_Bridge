import { strict as assert } from "node:assert";
import { test } from "node:test";
import { canAccess } from "../../src/lib/supabase/access.ts";

test("access requires a verified email and exactly the selected trusted role", () => {
  const user = { email: "citizen@example.test", email_confirmed_at: "2026-01-01", app_metadata: { bridge_role: "citizen" } };
  assert.equal(canAccess(null, "citizen"), false);
  assert.equal(canAccess({ ...user, is_anonymous: true }, "citizen"), false);
  assert.equal(canAccess({ ...user, email_confirmed_at: undefined }, "citizen"), false);
  assert.equal(canAccess(user, "citizen"), true);
  assert.equal(canAccess(user, "counselor"), false);
  assert.equal(canAccess({ ...user, app_metadata: {} }, "citizen"), false);
  assert.equal(canAccess({ ...user, app_metadata: { bridge_role: "counselor" } }, "citizen"), false);
  assert.equal(canAccess({ ...user, app_metadata: { bridge_role: "counselor" } }, "counselor"), true);
});
