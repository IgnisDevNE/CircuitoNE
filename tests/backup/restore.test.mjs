import assert from "node:assert/strict"
import { test } from "node:test"
import { createHash } from "node:crypto"
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  appendFileSync,
  rmSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createRestoreDatabase,
  restoreBackup,
} from "../../scripts/restore-drill.mjs"

test(
  "restores private object bytes, ownership and RLS through the real isolated Storage API",
  { timeout: 240000 },
  async () => {
    const root = mkdtempSync(join(tmpdir(), "circuitone-restore-fixture-"))
    const source = await createRestoreDatabase()
    try {
      // Small real dump: native roles + a private bucket, owned object and denied outsider.
      await source.storageMigration()
      await source.authMigration()
      for (const migration of readdirSync("docs/migrations")
        .filter((file) => file.endsWith(".sql"))
        .sort()) {
        source.sql(
          `set role postgres;\n${readFileSync(join("docs/migrations", migration), "utf8")}`,
        )
      }
      const smoke = readFileSync(
        "tests/database/homologation-smoke.sql",
        "utf8",
      )
      source.sql(smoke)
      assert.throws(
        () =>
          source.sql(
            `set circuitone.seed_target='odphoxozclrshqjgwbqk';\n${smoke}`,
          ),
        (error) =>
          error.message === "Fixtures de homologação incompletas",
      )
      source.sql(
        `set circuitone.seed_target='disposable'; set circuitone.seed_time='2026-09-26T12:00Z';\n` +
          ["identity", "collectives", "events", "messages"]
            .map((file) => readFileSync(`supabase/seeds/${file}.sql`, "utf8"))
            .join("\n"),
      )
      source.sql(`set circuitone.seed_target='odphoxozclrshqjgwbqk';\n${smoke}`)
      source.sql(`create table public.restore_fixture(id integer primary key); alter table public.restore_fixture enable row level security;
      insert into public.restore_fixture values(1); grant select on public.restore_fixture to anon;
      insert into storage.buckets(id,name,public) values('restore-private','restore-private',false);
      insert into storage.objects(id,bucket_id,name,owner,owner_id,version,metadata) values
        ('10000000-0000-4000-8000-000000000001','restore-private','nested/proof.txt','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','{"mimetype":"text/plain","cacheControl":"no-cache","size":15}');
      insert into storage.objects(id,bucket_id,name,owner,owner_id,version,metadata) values
        ('10000000-0000-4000-8000-000000000002','restore-private','large.bin','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','{"mimetype":"application/octet-stream","size":135266304}');
      create policy restore_owner on storage.objects for select to authenticated using(owner_id=(select auth.uid())::text);`)
      const bytes = Buffer.from("synthetic bytes")
      mkdirSync(join(root, "storage/restore-private/nested"), {
        recursive: true,
      })
      writeFileSync(
        join(root, "storage/restore-private/nested/proof.txt"),
        bytes,
      )
      const chunk = Buffer.alloc(1024 * 1024, 42)
      const largeHash = createHash("sha256")
      for (let index = 0; index < 129; index++) {
        appendFileSync(join(root, "storage/restore-private/large.bin"), chunk)
        largeHash.update(chunk)
      }
      source.sql(`do $$ begin
        if not exists(select from pg_roles where rolname='supabase_realtime_admin')
        then create role supabase_realtime_admin nologin; end if;
      end $$; create schema restore_realtime_owner_test authorization supabase_realtime_admin;`)
      source.dump(join(root, "db.dump"))
      const dump = readFileSync(join(root, "db.dump"))
      const manifest = {
        version: 1,
        environment: "dev",
        projectRef: "odphoxozclrshqjgwbqk",
        sourceSha: "a".repeat(40),
        createdAt: new Date().toISOString(),
        buckets: ["restore-private"],
        database: {
          size: dump.length,
          sha256: createHash("sha256").update(dump).digest("hex"),
        },
        objects: [
          {
            path: "restore-private/nested/proof.txt",
            size: bytes.length,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          },
          {
            path: "restore-private/large.bin",
            size: chunk.length * 129,
            sha256: largeHash.digest("hex"),
          },
        ],
      }
      writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest))
      const result = await restoreBackup(root)
      assert.equal(result.objects, 2)
      assert.equal(result.privateObjects, 2)
      assert.equal(result.ownerChecks, 2)
      assert.ok(result.rtoSeconds > 0)
      source.sql(
        "grant usage on schema private to anon; grant select on private.account_details to anon;",
      )
      source.dump(join(root, "db.dump"))
      const invalidAclDump = readFileSync(join(root, "db.dump"))
      manifest.database = {
        size: invalidAclDump.length,
        sha256: createHash("sha256").update(invalidAclDump).digest("hex"),
      }
      writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest))
      await assert.rejects(restoreBackup(root), (error) =>
        error.message === "Restored private grants invalid",
      )
      writeFileSync(
        join(root, "storage/restore-private/nested/proof.txt"),
        "corruption",
      )
      await assert.rejects(restoreBackup(root), /integrity|Storage/)
    } finally {
      source.close()
      assert.ok(root.startsWith(join(tmpdir(), "circuitone-restore-fixture-")))
      rmSync(root, { recursive: true, force: true })
    }
  },
)
