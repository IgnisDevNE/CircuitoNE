import assert from "node:assert/strict"
import test from "node:test"
import {
  prepareHomologationStorage,
  storageFixture,
} from "../scripts/homologation-storage.mjs"

const env = {
  SUPABASE_PROJECT_REF: "odphoxozclrshqjgwbqk",
  SUPABASE_URL: "https://odphoxozclrshqjgwbqk.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
}

test("Storage fixture refuses production before SQL or HTTP", async () => {
  const original = globalThis.fetch
  globalThis.fetch = () => {
    throw Error("HTTP must not run")
  }
  try {
    await assert.rejects(
      prepareHomologationStorage(
        { ...env, SUPABASE_PROJECT_REF: "production" },
        "owner",
        "other",
        {},
        () => {
          throw Error("SQL must not run")
        },
      ),
    )
  } finally {
    globalThis.fetch = original
  }
})

test("private synthetic upload uses its owner session, checks denial and refuses overwrite", async () => {
  const original = globalThis.fetch
  for (const mode of [
    "create",
    "create-storage-404",
    "bucket-error",
    "exists",
    "corrupt",
    "public",
    "exposed",
    "wrong-owner",
  ]) {
    const creates = ["create", "create-storage-404"].includes(mode)
    let bucketExists = !creates,
      objectExists = !creates,
      writes = 0,
      policies = 0
    const calls = []
    globalThis.fetch = async (url, init) => {
      assert.ok(url.startsWith(env.SUPABASE_URL + "/storage/v1/"))
      assert.equal(init.redirect, "error")
      assert.ok(init.signal)
      calls.push({ url, ...init })
      const path = new URL(url).pathname
      if (path.endsWith("/bucket/" + storageFixture.bucket)) {
        if (mode === "bucket-error")
          return Response.json(
            { statusCode: "400", error: "Invalid request" },
            { status: 400 },
          )
        return bucketExists
          ? Response.json({
              id: storageFixture.bucket,
              name: storageFixture.bucket,
              public: mode === "public",
              file_size_limit: 1024,
              allowed_mime_types: ["text/plain"],
            })
          : mode === "create-storage-404"
            ? Response.json(
                {
                  statusCode: "404",
                  error: "Bucket not found",
                  message: "Bucket not found",
                },
                { status: 400 },
              )
            : Response.json({}, { status: 404 })
      }
      if (path.endsWith("/bucket")) {
        assert.equal(init.headers.Authorization, "Bearer admin")
        const body = JSON.parse(init.body)
        assert.equal(body.public, false)
        assert.equal(body.id, storageFixture.bucket)
        bucketExists = true
        return Response.json({ name: storageFixture.bucket })
      }
      if (init.method === "POST") {
        assert.equal(init.headers.Authorization, "Bearer owner")
        assert.equal(init.headers.apikey, env.SUPABASE_PUBLISHABLE_KEY)
        assert.equal(init.headers["x-upsert"], "false")
        assert.deepEqual(Buffer.from(init.body), storageFixture.bytes)
        writes++
        objectExists = true
        return Response.json({
          Key: storageFixture.bucket + "/" + storageFixture.name,
        })
      }
      if (init.headers.Authorization === "Bearer owner") {
        return objectExists
          ? new Response(
              mode === "corrupt" ? "corrupted" : storageFixture.bytes,
            )
          : Response.json({}, { status: 404 })
      }
      return mode === "exposed"
        ? new Response(storageFixture.bytes)
        : Response.json({}, { status: 404 })
    }
    try {
      const action = () =>
        prepareHomologationStorage(
          env,
          "owner",
          "other",
          { Authorization: "Bearer admin" },
          (sql) => {
            if (sql.startsWith("begin;")) {
              policies++
              return ""
            }
            assert.match(
              sql,
              /begin read only; select owner_id from storage.objects/,
            )
            return mode === "wrong-owner"
              ? "01000000-0000-4000-8000-000000000005"
              : "01000000-0000-4000-8000-000000000001"
          },
        )
      if (
        [
          "corrupt",
          "public",
          "exposed",
          "wrong-owner",
          "bucket-error",
        ].includes(mode)
      )
        await assert.rejects(action())
      else assert.equal((await action()).sha256, storageFixture.sha256)
      assert.equal(writes, creates ? 1 : 0)
      assert.equal(policies, ["public", "bucket-error"].includes(mode) ? 0 : 1)
      assert.ok(!calls.some((call) => ["PUT", "DELETE"].includes(call.method)))
    } finally {
      globalThis.fetch = original
    }
  }
})
