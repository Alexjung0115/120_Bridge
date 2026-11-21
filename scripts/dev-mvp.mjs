import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const { PGlite } = createRequire(new URL("../frontend/package.json", import.meta.url))("@electric-sql/pglite");

const db = await PGlite.create(process.env.BRIDGE_DEMO_DB ?? "memory://");
const owner = "10000000-0000-4000-8000-000000000099";
const token = process.env.BRIDGE_LOCAL_CONSOLE_TOKEN ?? randomBytes(24).toString("base64url");
const rpcKey = randomBytes(24).toString("base64url");
const { rows } = await db.query("select to_regclass('auth.users') is not null as initialized");
if (!rows[0].initialized) {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
    create publication supabase_realtime;`);
  for (const name of (await readdir("supabase/migrations")).filter((file) => file.endsWith(".sql")).sort()) {
    await db.exec(await readFile("supabase/migrations/" + name, "utf8"));
  }
  await db.query("insert into auth.users values ($1)", [owner]);
}
await db.exec("set role service_role");

const routes = {
  bridge_open_session: ["p_owner", "p_session", "p_mode", "p_snapshot"],
  bridge_load_session: ["p_session"],
  bridge_end_session: ["p_session", "p_command", "p_base", "p_token_hash"],
  bridge_mvp_citizen_command: ["p_session", "p_command", "p_base", "p_hash", "p_kind", "p_text"],
  bridge_console_queue: ["p_after"],
  bridge_console_detail: ["p_session"],
  bridge_apply_console_action: ["p_session", "p_command", "p_base", "p_agent", "p_action", "p_candidate", "p_outcome"],
  bridge_submit_citizen_correction: ["p_session", "p_base", "p_command", "p_handoff", "p_summary_revision", "p_text", "p_token_hash"],
};
const server = createServer(async (request, response) => {
  const send = (status, data) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(data));
  };
  const name = request.url?.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/)?.[1];
  if (request.method !== "POST" || !name || !Object.hasOwn(routes, name)) return send(404, {});
  if (request.headers.apikey !== rpcKey) return send(401, {});
  try {
    let raw = "";
    for await (const chunk of request) {
      raw += chunk;
      if (raw.length > 100_000) return send(413, {});
    }
    const input = JSON.parse(raw);
    const keys = routes[name];
    const params = keys.map((key) => input[key] ?? null);
    const placeholders = keys.map((_, index) => "$" + (index + 1)).join(",");
    const result = await db.query("select public." + name + "(" + placeholders + ") as data", params);
    send(200, result.rows[0].data);
  } catch (error) {
    console.error("Local RPC failed", name, error.code ?? "");
    send(500, { message: "Local database request failed." });
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
console.log("Local MVP http://localhost:3100/mvp");
console.log("Local test counselor token:", token);
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "-p", "3100", "-H", "127.0.0.1"], {
  cwd: "frontend", stdio: "inherit",
  env: { ...process.env, BRIDGE_LOCAL_DEMO: "1", SUPABASE_URL: "http://127.0.0.1:" + server.address().port,
    SUPABASE_SECRET_KEY: rpcKey, BRIDGE_DEMO_OWNER_ID: owner,
    BRIDGE_SESSION_SIGNING_SECRET: process.env.BRIDGE_DEMO_SIGNING_SECRET ?? randomBytes(32).toString("hex"),
    BRIDGE_CORPUS_VERSION: "local-demo", CONSOLE_TOKEN: token, NODE_PATH: process.env.NODE_PATH },
});
process.on("SIGINT", () => next.kill());
await new Promise((resolve) => next.on("exit", (code) => { process.exitCode = code ?? 0; resolve(); }));
server.close();
await db.close();
