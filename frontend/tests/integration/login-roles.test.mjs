import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("first verified login fixes a role and rejects the other role", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users (id uuid primary key, raw_app_meta_data jsonb, email_confirmed_at timestamptz, is_anonymous boolean);`);
    await db.exec(await readFile(new URL("../../../supabase/migrations/20261121033000_login_roles.sql", import.meta.url), "utf8"));
    await db.exec(`insert into auth.users values
      ('10000000-0000-4000-8000-000000000001', '{"other":"kept"}', now(), false),
      ('10000000-0000-4000-8000-000000000002', '{}', null, false);`);
    const call = async (id, role) => (await db.query("select public.bridge_assign_login_role($1, $2) as ok", [id, role])).rows[0].ok;
    const id = "10000000-0000-4000-8000-000000000001";
    assert.equal(await call(id, "counselor"), true);
    assert.equal(await call(id, "counselor"), true);
    assert.equal(await call(id, "citizen"), false);
    assert.equal(await call("10000000-0000-4000-8000-000000000002", "citizen"), false);
    const user = (await db.query("select raw_app_meta_data from auth.users where id = $1", [id])).rows[0];
    assert.deepEqual(user.raw_app_meta_data, { bridge_role: "counselor", other: "kept" });
  } finally { await db.close(); }
});
