import assert from "node:assert/strict"
import { createHash, createHmac, randomBytes } from "node:crypto"
import { execFileSync, execFile } from "node:child_process"
import { appendFileSync, readFileSync, createReadStream } from "node:fs"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { setTimeout as delay } from "node:timers/promises"
import { verifyBackupContents } from "./verify-backup.mjs"

const postgres =
  "docker.io/supabase/postgres@sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb"
const storage =
  "docker.io/supabase/storage-api@sha256:63da55733ce9d7592d860739acb94f0b6189d880b7565d247ee5b195be854db1"
const rest =
  "docker.io/postgrest/postgrest@sha256:aa7e96af2d01219a09bc00c75de28171b1f9fda17ea455a931e4fb6d317089e0"
const auth =
  "docker.io/supabase/gotrue@sha256:c0c25187a6b835e65a6f6e6c6b39d090e832d40e6de5186f2c038e0411944232"

// Only disposable local resources; no URLs, database credentials or container names from callers.
export async function createRestoreDatabase() {
  const engine = process.env.CONTAINER_ENGINE ?? "docker"
  assert.ok(["docker", "podman"].includes(engine))
  const name = `circuitone-restore-${randomBytes(6).toString("hex")}`
  const password = randomBytes(24).toString("hex")
  const jwtSecret = randomBytes(32).toString("hex")
  const names = [name]
  const volume = `${name}-storage`
  const childEnv = Object.fromEntries(
    [
      "PATH",
      "HOME",
      "USERPROFILE",
      "SYSTEMROOT",
      "APPDATA",
      "LOCALAPPDATA",
      "CONTAINER_HOST",
      "DOCKER_HOST",
    ]
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]]),
  )
  const run = (args, input) => {
    try {
      return execFileSync(engine, args, {
        env: childEnv,
        input,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 300000,
        maxBuffer: 32 * 1024 * 1024,
      })
    } catch (error) {
      // Native errors include argv/environment and captured output; do not propagate them.
      if (args[0] === "exec" && args[3] === "psql") {
        const lines = String(error.stderr ?? "").split(/\r?\n/)
        const diagnostic = [
          "Fixtures de homologação incompletas",
          "Restored private grants invalid",
          "Restored application RLS missing",
          "Restored constraint not validated",
          "Homologation lock already held",
          "Protected homologation child failed",
        ].find((message) =>
          lines.some((line) => line.endsWith(`ERROR:  ${message}`)),
        )
        if (diagnostic) throw new Error(diagnostic)
      }
      const status = Number.isInteger(error.status)
        ? error.status
        : "unavailable"
      throw new Error(`Disposable ${engine} ${args[0]} failed (exit ${status})`)
    }
  }
  const sql = (text) =>
    run(
      [
        "exec",
        "-i",
        name,
        "psql",
        "-X",
        "-U",
        "supabase_admin",
        "-d",
        "postgres",
        "-Atq",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      text,
    )
  const token = (role, sub) => {
    const encode = (value) =>
      Buffer.from(JSON.stringify(value)).toString("base64url")
    const data = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role, ...(sub ? { sub } : {}), exp: Math.floor(Date.now() / 1000) + 900 })}`
    return `${data}.${createHmac("sha256", jwtSecret).update(data).digest("base64url")}`
  }
  const service = token("service_role")
  const env = [
    "DATABASE_URL=postgresql://supabase_storage_admin:" +
      password +
      "@127.0.0.1:5432/postgres",
    "AUTH_JWT_SECRET=" + jwtSecret,
    "ANON_KEY=" + token("anon"),
    "SERVICE_KEY=" + service,
    "POSTGREST_URL=http://127.0.0.1:3000",
    "STORAGE_BACKEND=file",
    "GLOBAL_S3_BUCKET=restore",
    "TENANT_ID=restore",
    "REGION=local",
    "FILE_STORAGE_BACKEND_PATH=/var/lib/storage",
    "ENABLE_IMAGE_TRANSFORMATION=false",
    "LOG_LEVEL=fatal",
  ]
  const flags = [
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,size=128m",
  ]
  const authEnv = [
    "GOTRUE_DB_DRIVER=postgres",
    `GOTRUE_DB_DATABASE_URL=postgresql://supabase_auth_admin:${password}@127.0.0.1:5432/postgres`,
    `GOTRUE_JWT_SECRET=${jwtSecret}`,
    "GOTRUE_JWT_AUD=authenticated",
    "GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated",
    "GOTRUE_SITE_URL=https://synthetic.invalid",
    "API_EXTERNAL_URL=http://127.0.0.1:9999",
    "GOTRUE_API_HOST=0.0.0.0",
    "GOTRUE_API_PORT=9999",
    "GOTRUE_MFA_ENABLED=true",
    "GOTRUE_MFA_TOTP_ENROLL_ENABLED=true",
    "GOTRUE_MFA_TOTP_VERIFY_ENABLED=true",
    "GOTRUE_LOG_LEVEL=error",
  ]
  const storageRun = (id, args) => {
    names.push(id)
    return run([
      "run",
      "--name",
      id,
      "--network",
      `container:${name}`,
      ...flags,
      "--mount",
      `type=volume,src=${volume},dst=/var/lib/storage`,
      ...env.flatMap((item) => ["-e", item]),
      ...args,
    ])
  }
  const close = () => {
    for (const id of [...names].reverse()) {
      try {
        run(["rm", "-fv", id])
      } catch {}
    }
    try {
      run(["volume", "rm", volume])
    } catch {}
  }
  try {
    run([
      "run",
      "-d",
      "--name",
      name,
      "--network",
      "none",
      "--memory",
      "1g",
      "-e",
      `POSTGRES_PASSWORD=${password}`,
      postgres,
    ])
    let ready = false
    for (let attempt = 0; attempt < 90; attempt++) {
      try {
        if (
          run(["logs", name]).includes(
            "PostgreSQL init process complete; ready for start up.",
          )
        ) {
          sql("select 1")
          ready = true
          break
        }
      } catch {}
      await delay(500)
    }
    assert.ok(ready, "Isolated PostgreSQL initialization did not complete")
    sql(
      `alter role supabase_storage_admin password '${password}'; alter role authenticator password '${password}';`,
    )
    run(["volume", "create", volume])
    return {
      name,
      sql,
      run,
      token,
      close,
      dump: (path) => {
        run([
          "exec",
          name,
          "pg_dump",
          "-U",
          "supabase_admin",
          "-d",
          "postgres",
          "-Fc",
          "-f",
          "/tmp/restore.dump",
        ])
        run(["cp", `${name}:/tmp/restore.dump`, path])
      },
      storageMigration: async () =>
        storageRun(`${name}-migration`, [
          storage,
          "node",
          "dist/scripts/migrate-call.js",
        ]),
      authMigration: async () => {
        const id = `${name}-auth-migration`
        names.push(id)
        sql(`alter role supabase_auth_admin password '${password}';`)
        run([
          "run",
          "--name",
          id,
          "--network",
          `container:${name}`,
          ...flags,
          ...authEnv.flatMap((item) => ["-e", item]),
          auth,
          "auth",
          "migrate",
        ])
      },
      startAuthServer: async () => {
        const id = `${name}-auth`
        names.push(id)
        run([
          "run",
          "-d",
          "--name",
          id,
          "--network",
          `container:${name}`,
          ...flags,
          ...authEnv.flatMap((item) => ["-e", item]),
          auth,
        ])
        let healthy = false
        for (let attempt = 0; attempt < 60; attempt++) {
          try {
            run([
              "exec",
              `${name}-api`,
              "node",
              "-e",
              "fetch('http://127.0.0.1:9999/health',{signal:AbortSignal.timeout(1000)}).then(r=>{if(!r.ok)process.exitCode=1}).catch(()=>process.exitCode=1)",
            ])
            healthy = true
            break
          } catch {}
          await delay(500)
        }
        assert.ok(healthy, "Isolated Auth API did not become healthy")
      },
      populate: async (root, objects) => {
        const id = `${name}-files`
        storageRun(id, [
          "-d",
          "--entrypoint",
          "sh",
          storage,
          "-c",
          "sleep infinity",
        ])
        // Stream into the pinned backend: no copied UID/mode dependency or duplicate staging tree.
        for (const object of objects) {
          let child
          const completed = new Promise((resolve, reject) => {
            child = execFile(
              engine,
              [
                "exec",
                "-i",
                id,
                "node",
                "-e",
                `
          const {FileBackend}=require('/app/dist/storage/backend/file.js');
          const {Readable}=require('node:stream');
          (async()=>{
            const input=process.stdin[Symbol.asyncIterator](); let header=Buffer.alloc(0), offset;
            while((offset=header.indexOf(10))<0) {
              const chunk=await input.next(); if(chunk.done) throw Error('Missing metadata');
              header=Buffer.concat([header,chunk.value]); if(header.length>1024*1024) throw Error('Oversized metadata');
            }
            const o=JSON.parse(header.subarray(0,offset).toString('utf8'));
            const body=Readable.from((async function*(){ yield header.subarray(offset+1); for await(const c of input) yield c; })());
            await new FileBackend().uploadObject('restore','restore/'+o.bucket_id+'/'+o.name,o.version,body,o.metadata?.mimetype,o.metadata?.cacheControl);
          })().catch(()=>{process.exitCode=1});`,
              ],
              { env: childEnv, timeout: 300000, maxBuffer: 4096 },
              (error) =>
                error
                  ? reject(new Error("Native object restoration failed"))
                  : resolve(),
            )
          })
          const bytes = Readable.from(
            (async function* () {
              yield Buffer.from(JSON.stringify(object) + "\n")
              yield* createReadStream(
                join(root, "storage", object.bucket_id, object.name),
              )
            })(),
          )
          await Promise.all([pipeline(bytes, child.stdin), completed])
        }
        run(["rm", "-fv", id])
      },
      startApi: async () => {
        names.push(`${name}-rest`)
        run([
          "run",
          "-d",
          "--name",
          `${name}-rest`,
          "--network",
          `container:${name}`,
          ...flags,
          "-e",
          `PGRST_DB_URI=postgresql://authenticator:${password}@127.0.0.1:5432/postgres`,
          "-e",
          "PGRST_DB_SCHEMAS=public",
          "-e",
          "PGRST_DB_ANON_ROLE=anon",
          "-e",
          `PGRST_JWT_SECRET=${jwtSecret}`,
          rest,
        ])
        storageRun(`${name}-api`, ["-d", storage])
        let healthy = false
        for (let attempt = 0; attempt < 60; attempt++) {
          try {
            run([
              "exec",
              `${name}-api`,
              "node",
              "-e",
              "fetch('http://127.0.0.1:5000/status',{signal:AbortSignal.timeout(1000)}).then(r=>{if(!r.ok)process.exitCode=1}).catch(()=>process.exitCode=1)",
            ])
            healthy = true
            break
          } catch {}
          await delay(500)
        }
        assert.ok(healthy, "Restored Storage API did not become healthy")
      },
      request: (path, jwt = service) =>
        JSON.parse(
          run(
            [
              "exec",
              "-i",
              `${name}-api`,
              "node",
              "-e",
              `
        const {createHash}=require('node:crypto'); let input=''; process.stdin.on('data',c=>input+=c);
        process.stdin.on('end',async()=>{try { const {path,jwt}=JSON.parse(input);
          const r=await fetch('http://127.0.0.1:5000'+path,{headers:{Authorization:'Bearer '+jwt},redirect:'error',signal:AbortSignal.timeout(10000)});
          const hash=createHash('sha256');let size=0;for await(const c of r.body){hash.update(c);size+=c.length;}
          console.log(JSON.stringify({status:r.status,size,sha256:hash.digest('hex')}));
        } catch {process.exitCode=1}});`,
            ],
            JSON.stringify({ path, jwt }),
          ),
        ),
    }
  } catch (error) {
    close()
    throw error
  }
}

export async function restoreBackup(root) {
  verifyBackupContents(root)
  const start = performance.now()
  const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"))
  const db = await createRestoreDatabase()
  try {
    db.run(["cp", join(root, "db.dump"), `${db.name}:/tmp/restore.dump`])
    db.run([
      "exec",
      db.name,
      "pg_restore",
      "--exit-on-error",
      "--clean",
      "--if-exists",
      "-U",
      "supabase_admin",
      "-d",
      "postgres",
      "/tmp/restore.dump",
    ])
    // Local passwords are independent of owners/ACL restored from the hosted database dump.
    const snapshotSql =
      "select json_build_object('objects',(select coalesce(json_agg(o order by o.bucket_id,o.name),'[]') from storage.objects o),'buckets',(select coalesce(json_agg(b order by b.id),'[]') from storage.buckets b))"
    const before = db.sql(snapshotSql).trim()
    const snapshot = JSON.parse(before)
    assert.deepEqual(
      snapshot.buckets.map((b) => b.id).sort(),
      [...manifest.buckets].sort(),
      "Restored bucket set differs",
    )
    assert.deepEqual(
      snapshot.objects.map((o) => `${o.bucket_id}/${o.name}`).sort(),
      manifest.objects.map((o) => o.path).sort(),
      "Restored object references differ from bytes",
    )
    db.sql(`do $$ begin
      if exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace
      cross join (values('anon'),('authenticated')) roles(name)
      where n.nspname='private' and c.relkind in('r','p','v','m','f')
      and (has_table_privilege(roles.name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_any_column_privilege(roles.name,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) then raise exception 'Restored private grants invalid'; end if;
      if exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname in('public','private') and c.relkind in('r','p') and not c.relrowsecurity
      and not exists(select from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')) then raise exception 'Restored application RLS missing'; end if;
      if exists(select from pg_constraint c join pg_namespace n on n.oid=c.connamespace
      where n.nspname in('public','private') and not c.convalidated) then raise exception 'Restored constraint not validated'; end if; end $$;`)
    await db.populate(root, snapshot.objects)
    await db.startApi()
    assert.equal(
      db.sql(snapshotSql).trim(),
      before,
      "Storage startup modified restored object metadata",
    )
    let privateObjects = 0
    let ownerChecks = 0
    for (const object of snapshot.objects) {
      const path = `/object/authenticated/${encodeURIComponent(object.bucket_id)}/${object.name.split("/").map(encodeURIComponent).join("/")}`
      const expected = manifest.objects.find(
        (o) => o.path === `${object.bucket_id}/${object.name}`,
      )
      const result = db.request(path)
      assert.equal(result.status, 200, "Restored Storage download failed")
      assert.equal(
        result.size,
        expected.size,
        "Restored API object size differs",
      )
      assert.equal(
        result.sha256,
        expected.sha256,
        "Restored API object hash differs",
      )
      if (!snapshot.buckets.find((b) => b.id === object.bucket_id).public) {
        privateObjects++
        assert.ok(
          [400, 401, 403, 404].includes(
            db.request(path, db.token("anon")).status,
          ),
          "Private object exposed to anonymous user",
        )
        assert.ok(
          [400, 401, 403, 404].includes(
            db.request(
              path,
              db.token("authenticated", "ffffffff-ffff-4fff-8fff-ffffffffffff"),
            ).status,
          ),
          "Private object exposed to unrelated user",
        )
        // Owner API access is checked where the application's current policy grants it.
        if (object.owner_id || object.owner) {
          const owner = db.request(
            path,
            db.token("authenticated", object.owner_id ?? object.owner),
          )
          assert.equal(owner.status, 200, "Restored object owner access failed")
          assert.equal(owner.sha256, expected.sha256)
          ownerChecks++
        }
      }
    }
    assert.equal(
      db.sql(snapshotSql).trim(),
      before,
      "API reads modified Storage metadata",
    )
    return {
      objects: snapshot.objects.length,
      privateObjects,
      ownerChecks,
      rtoSeconds: (performance.now() - start) / 1000,
    }
  } finally {
    db.close()
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    assert.equal(process.argv.length, 4)
    const receipt = JSON.parse(readFileSync(process.argv[3], "utf8"))
    const result = await restoreBackup(process.argv[2])
    assert.ok(
      result.objects > 0 && result.privateObjects > 0 && result.ownerChecks > 0,
      "Full drill requires nonempty private owned synthetic objects",
    )
    const rpoSeconds = (Date.now() - Date.parse(receipt.exportStartedAt)) / 1000
    assert.ok(
      Number.isFinite(rpoSeconds) && rpoSeconds >= 0 && rpoSeconds <= 86400,
      "Restore point exceeds 24 hour RPO",
    )
    assert.ok(result.rtoSeconds <= 172800, "Restore exceeds 48 hour RTO")
    const summary = `Isolated database + Storage API restore verified. Source ${receipt.sourceSha}, export run ${receipt.runId}/${receipt.attempt}, archive SHA256 ${receipt.sha256}. Objects: ${result.objects}; private: ${result.privateObjects}; owner checks: ${result.ownerChecks}; RPO ${Math.ceil(rpoSeconds)}s; RTO ${Math.ceil(result.rtoSeconds)}s. No hosted project changed.\n`
    console.log(summary.trim())
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary)
  } catch {
    console.error(
      "::error::Isolated database and Storage recovery failed; no remote data changed.",
    )
    process.exitCode = 1
  }
}
