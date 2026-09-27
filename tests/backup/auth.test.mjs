import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { createRestoreDatabase } from "../../scripts/restore-drill.mjs"
import { checkHomologationRest } from "../../scripts/homologation-rest.mjs"

test(
  "real isolated Auth and Storage validate ownership, owner MFA and complete session cleanup",
  { timeout: 180000 },
  async () => {
    const db = await createRestoreDatabase()
    const original = globalThis.fetch
    try {
      await db.storageMigration()
      await db.authMigration()
      for (const file of readdirSync("docs/migrations")
        .filter((f) => f.endsWith(".sql"))
        .sort()) {
        db.sql(
          "set role postgres;\n" +
            readFileSync(join("docs/migrations", file), "utf8"),
        )
      }
      db.sql(
        "set circuitone.seed_target='disposable'; set circuitone.seed_time='2026-09-26T12:00Z';\n" +
          ["identity", "collectives", "events", "messages"]
            .map((f) => readFileSync(`supabase/seeds/${f}.sql`, "utf8"))
            .join("\n"),
      )
      await db.startApi()
      await db.startAuthServer()
      globalThis.fetch = async (url, init) => {
        if (
          url ===
          "https://api.supabase.com/v1/projects/odphoxozclrshqjgwbqk/api-keys?reveal=true"
        ) {
          return Response.json([
            { name: "service_role", api_key: db.token("service_role") },
          ])
        }
        const parsed = new URL(url)
        assert.equal(parsed.origin, "https://odphoxozclrshqjgwbqk.supabase.co")
        const isAuth = parsed.pathname.startsWith("/auth/v1/")
        const isStorage = parsed.pathname.startsWith("/storage/v1/")
        assert.ok(
          isAuth || isStorage || parsed.pathname.startsWith("/rest/v1/"),
        )
        const path =
          parsed.pathname.replace(
            isAuth ? "/auth/v1" : isStorage ? "/storage/v1" : "/rest/v1",
            "",
          ) + parsed.search
        const result = JSON.parse(
          db.run(
            [
              "exec",
              "-i",
              db.name + "-api",
              "node",
              "-e",
              `
        let input=''; process.stdin.on('data',c=>input+=c); process.stdin.on('end',async()=>{
          try {const o=JSON.parse(input);
            if(o.init.body?.type==='Buffer')o.init.body=Buffer.from(o.init.body.data);
            const r=await fetch('http://127.0.0.1:'+o.port+o.path,
            {...o.init,redirect:'error',signal:AbortSignal.timeout(5000)});
            const text=await r.text(); console.log(JSON.stringify({status:r.status,text}));
          }catch{process.exitCode=1}
        });`,
            ],
            JSON.stringify({
              port: isAuth ? 9999 : isStorage ? 5000 : 3000,
              path,
              init: {
                headers: init.headers,
                method: init.method,
                body: init.body,
              },
            }),
          ),
        )
        return new Response(result.status === 204 ? null : result.text, {
          status: result.status,
        })
      }
      await checkHomologationRest(
        {
          SUPABASE_PROJECT_REF: "odphoxozclrshqjgwbqk",
          SUPABASE_URL: "https://odphoxozclrshqjgwbqk.supabase.co",
          SUPABASE_ACCESS_TOKEN: "synthetic-local-only",
          SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
          GITHUB_RUN_ID: "123",
          GITHUB_RUN_ATTEMPT: "1",
        },
        (sql) => db.sql(sql),
      )
      assert.equal(
        db
          .sql(
            "select owner_id from storage.objects where bucket_id='phase0-recovery' and name='synthetic/proof.txt'",
          )
          .trim(),
        "01000000-0000-4000-8000-000000000001",
      )
    } finally {
      globalThis.fetch = original
      db.close()
    }
  },
)
