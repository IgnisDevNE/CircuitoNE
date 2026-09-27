import assert from "node:assert/strict"
import test from "node:test"
import { createRestoreDatabase } from "../../scripts/restore-drill.mjs"
import { storageFixturePolicies } from "../../scripts/homologation-storage.mjs"

test(
  "native synthetic Storage policy is idempotent, denies outsiders and refuses policy collisions",
  { timeout: 180000 },
  async () => {
    const db = await createRestoreDatabase()
    try {
      await db.storageMigration()
      await db.authMigration()
      db.sql(storageFixturePolicies)
      db.sql(storageFixturePolicies)
      db.sql(`insert into storage.buckets(id,name,public) values('phase0-recovery','phase0-recovery',false);
      insert into storage.objects(bucket_id,name,owner_id) values('phase0-recovery','synthetic/proof.txt','01000000-0000-4000-8000-000000000001');`)
      const read = (role, uid) =>
        db.sql(`begin; set local role ${role};
      set local request.jwt.claims='${JSON.stringify({ role, sub: uid })}';
      select count(*) from storage.objects where bucket_id='phase0-recovery'; rollback;`).trim()
      assert.equal(
        read("authenticated", "01000000-0000-4000-8000-000000000001"),
        "1",
      )
      assert.equal(
        read("authenticated", "01000000-0000-4000-8000-000000000005"),
        "0",
      )
      assert.equal(read("anon", "01000000-0000-4000-8000-000000000001"), "0")
      db.sql(
        "alter policy circuitone_phase0_read on storage.objects using(true);",
      )
      assert.throws(
        () => db.sql(storageFixturePolicies),
        /Synthetic Storage policy collision/,
      )
    } finally {
      db.close()
    }
  },
)
