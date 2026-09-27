import assert from "node:assert/strict"
import { createHash } from "node:crypto"

const bytes = Buffer.from("CircuitoNE: synthetic recovery fixture v1\n")
export const storageFixture = {
  bucket: "phase0-recovery",
  name: "synthetic/proof.txt",
  bytes,
  sha256: createHash("sha256").update(bytes).digest("hex"),
}

// Compare parsed policies using an ephemeral reference; never replace a colliding policy.
export const storageFixturePolicies = `begin;
create temporary table phase0_policy_contract(bucket_id text,name text,owner_id text) on commit drop;
create policy circuitone_phase0_read on phase0_policy_contract for select to authenticated
using(bucket_id='phase0-recovery' and name='synthetic/proof.txt' and owner_id=(select auth.uid())::text);
create policy circuitone_phase0_insert on phase0_policy_contract for insert to authenticated
with check(bucket_id='phase0-recovery' and name='synthetic/proof.txt' and (select auth.uid())='01000000-0000-4000-8000-000000000001'::uuid);
do $$ declare reference record; existing record; begin
  if not (select relrowsecurity from pg_class where oid='storage.objects'::regclass) then
    raise exception 'Storage RLS missing'; end if;
  for reference in select * from pg_policy where polrelid='phase0_policy_contract'::regclass loop
    select * into existing from pg_policy where polrelid='storage.objects'::regclass and polname=reference.polname;
    if found then
      if existing.polcmd<>reference.polcmd or existing.polroles<>reference.polroles or existing.polpermissive<>reference.polpermissive
      or pg_get_expr(existing.polqual,existing.polrelid) is distinct from pg_get_expr(reference.polqual,reference.polrelid)
      or pg_get_expr(existing.polwithcheck,existing.polrelid) is distinct from pg_get_expr(reference.polwithcheck,reference.polrelid) then
        raise exception 'Synthetic Storage policy collision'; end if;
    else
      execute format('create policy %I on storage.objects for %s to authenticated %s',reference.polname,
        case when reference.polcmd='r' then 'select' else 'insert' end,
        case when reference.polcmd='r' then 'using ('||pg_get_expr(reference.polqual,reference.polrelid)||')'
        else 'with check ('||pg_get_expr(reference.polwithcheck,reference.polrelid)||')' end);
    end if;
  end loop;
end $$;
commit;`

export async function prepareHomologationStorage(
  env,
  ownerJwt,
  otherJwt,
  admin,
  query,
) {
  const ref = "odphoxozclrshqjgwbqk"
  assert.equal(env.SUPABASE_PROJECT_REF, ref)
  assert.equal(env.SUPABASE_URL, `https://${ref}.supabase.co`)
  assert.ok(env.SUPABASE_PUBLISHABLE_KEY?.startsWith("sb_publishable_"))
  assert.ok(ownerJwt && otherJwt && ownerJwt !== otherJwt)
  const call = async (
    path,
    headers,
    method = "GET",
    body,
    type = "application/json",
  ) => {
    const response = await fetch(`${env.SUPABASE_URL}/storage/v1/${path}`, {
      method,
      headers: {
        ...headers,
        "Content-Type": type,
        ...(method === "POST" && type === "text/plain"
          ? { "x-upsert": "false" }
          : {}),
      },
      ...(body === undefined
        ? {}
        : { body: type === "application/json" ? JSON.stringify(body) : body }),
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    })
    const chunks = []
    let size = 0
    for await (const chunk of response.body ?? []) {
      size += chunk.length
      assert.ok(size <= 1024 * 1024, "Oversized Storage response")
      chunks.push(chunk)
    }
    return { status: response.status, bytes: Buffer.concat(chunks) }
  }
  const { bucket, name } = storageFixture
  let found = await call(`bucket/${bucket}`, admin)
  // Storage's HTTP 400 can carry a semantic 404; other failures must not create a bucket.
  const bucketError =
    found.status === 400 ? JSON.parse(found.bytes.toString("utf8")) : undefined
  if (
    found.status === 404 ||
    (bucketError?.statusCode === "404" &&
      bucketError.error === "Bucket not found")
  ) {
    const created = await call("bucket", admin, "POST", {
      id: bucket,
      name: bucket,
      public: false,
      file_size_limit: 1024,
      allowed_mime_types: ["text/plain"],
    })
    assert.equal(created.status, 200)
    found = await call(`bucket/${bucket}`, admin)
  }
  assert.equal(found.status, 200)
  const config = JSON.parse(found.bytes.toString("utf8"))
  assert.equal(config.id, bucket)
  assert.equal(config.name, bucket)
  assert.equal(config.public, false)
  assert.equal(Number(config.file_size_limit), 1024)
  assert.deepEqual(config.allowed_mime_types, ["text/plain"])
  query(storageFixturePolicies)
  const user = (jwt) => ({
    apikey: env.SUPABASE_PUBLISHABLE_KEY,
    ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
  })
  const path = `object/authenticated/${bucket}/${name}`
  let object = await call(path, user(ownerJwt))
  if ([400, 404].includes(object.status)) {
    const uploaded = await call(
      `object/${bucket}/${name}`,
      user(ownerJwt),
      "POST",
      bytes,
      "text/plain",
    )
    assert.equal(
      uploaded.status,
      200,
      "Synthetic upload refused; no overwrite attempted",
    )
    object = await call(path, user(ownerJwt))
  }
  assert.equal(object.status, 200)
  assert.deepEqual(object.bytes, bytes, "Synthetic Storage content collision")
  assert.equal(
    query(
      `begin read only; select owner_id from storage.objects where bucket_id='phase0-recovery' and name='synthetic/proof.txt'; rollback;`,
    ).trim(),
    "01000000-0000-4000-8000-000000000001",
    "Synthetic Storage owner collision",
  )
  for (const jwt of [undefined, otherJwt]) {
    const denied = await call(path, user(jwt))
    assert.ok(
      [400, 401, 403, 404].includes(denied.status),
      "Synthetic private object exposed",
    )
  }
  return { bucket, name, size: bytes.length, sha256: storageFixture.sha256 }
}
