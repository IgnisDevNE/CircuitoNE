import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { imagePromotionDrill } from "../scripts/image-promotion-drill.mjs"

const previous = "sha256:" + "1".repeat(64),
  candidate = "sha256:" + "2".repeat(64)
const previousSha = "a".repeat(40),
  candidateSha = "b".repeat(40)

test("promotion validates exact image identity, uses immutable bytes and rolls back after failed health", async () => {
  const containers = new Map(),
    calls = []
  const run = (args) => {
    calls.push(args)
    if (args[0] === "image")
      return JSON.stringify([
        {
          Id: args[2],
          Config: {
            Labels: {
              "org.opencontainers.image.revision":
                args[2] === previous ? previousSha : candidateSha,
            },
          },
        },
      ])
    if (args[0] === "run") {
      containers.set(args[args.indexOf("--name") + 1], {
        image: args.at(-1),
        running: true,
      })
      return "container"
    }
    if (args[0] === "inspect") return containers.get(args.at(-1)).image
    if (args[0] === "ps")
      return [...containers.keys()]
        .filter((name) => name === args[3].slice(5))
        .join("\n")
    if (args[0] === "rm") {
      containers.delete(args.at(-1))
      return ""
    }
    if (args[0] === "stop") {
      containers.get(args.at(-1)).running = false
      return ""
    }
    if (args[0] === "exec") {
      assert.ok(
        containers.get(args[1]).running,
        "stopped candidate must fail health",
      )
      return "healthy"
    }
    throw Error("unexpected engine operation")
  }
  const result = await imagePromotionDrill(
    previous,
    previousSha,
    candidate,
    candidateSha,
    run,
  )
  assert.equal(result.promotedImage, candidate)
  assert.equal(result.rollbackImage, previous)
  assert.equal(result.failedHealthDetected, true)
  assert.equal(containers.size, 0)
  const launches = calls.filter((args) => args[0] === "run")
  assert.deepEqual(
    launches.map((args) => args.at(-1)),
    [previous, candidate, candidate, previous],
  )
  for (const args of launches) {
    assert.ok(args.includes("--read-only"))
    assert.ok(args.includes("none"))
    assert.ok(
      !args.some(
        (arg) => arg.startsWith("GITHUB_") || arg === "-v" || arg === "-p",
      ),
    )
  }
})

test("candidate launch failure restores the previous image and cleanup failure rejects the drill", async () => {
  for (const failure of ["launch", "cleanup"]) {
    const containers = new Map(),
      launches = []
    const run = (args) => {
      if (args[0] === "image")
        return JSON.stringify([
          {
            Id: args[2],
            Config: {
              Labels: {
                "org.opencontainers.image.revision":
                  args[2] === previous ? previousSha : candidateSha,
              },
            },
          },
        ])
      if (args[0] === "run") {
        launches.push(args.at(-1))
        if (failure === "launch" && launches.length === 3)
          throw Error("launch failed")
        containers.set(args[args.indexOf("--name") + 1], {
          image: args.at(-1),
          running: true,
        })
        return "container"
      }
      if (args[0] === "ps")
        return [...containers.keys()]
          .filter((name) => name === args[3].slice(5))
          .join("\n")
      if (args[0] === "inspect") return containers.get(args.at(-1)).image
      if (args[0] === "rm") {
        if (failure === "cleanup") throw Error("cleanup failed")
        containers.delete(args.at(-1))
        return ""
      }
      if (args[0] === "stop") {
        containers.get(args.at(-1)).running = false
        return ""
      }
      if (args[0] === "exec") {
        assert.ok(containers.get(args[1]).running)
        return "healthy"
      }
      throw Error("unexpected engine operation")
    }
    await assert.rejects(
      imagePromotionDrill(previous, previousSha, candidate, candidateSha, run),
      failure === "launch" ? /launch failed/ : /cleanup failed/i,
    )
    if (failure === "launch") {
      assert.equal(
        launches.at(-1),
        previous,
        "Launch failure must restore the previous immutable image",
      )
      assert.equal(containers.size, 0)
    }
  }
})

test("wrong SHA or artifact identity cannot create, stop or promote containers", async () => {
  for (const bad of ["malformed", "wrong-label", "wrong-id"]) {
    let reads = 0
    const run = (args) => {
      assert.equal(
        args[0],
        "image",
        "Rejected artifact must not mutate the destination",
      )
      reads++
      return JSON.stringify([
        {
          Id: bad === "wrong-id" ? previous : args[2],
          Config: {
            Labels: {
              "org.opencontainers.image.revision":
                bad === "wrong-label"
                  ? previousSha
                  : args[2] === previous
                    ? previousSha
                    : candidateSha,
            },
          },
        },
      ])
    }
    await assert.rejects(
      imagePromotionDrill(
        previous,
        previousSha,
        candidate,
        bad === "malformed" ? "not-a-sha" : candidateSha,
        run,
      ),
    )
    if (bad === "malformed") assert.equal(reads, 0)
  }
})

test("CI proves image promotion/rollback using a prior source revision without environments or secrets", () => {
  const quality = readFileSync(".github/workflows/ci.yml", "utf8")
    .split("\n  quality:")[1]
    .split("\n  database:")[0]
  assert.match(quality, /fetch-depth: 2/)
  assert.match(quality, /git archive "\$base_sha"/)
  assert.match(quality, /org\.opencontainers\.image\.revision="\$GITHUB_SHA"/)
  assert.match(quality, /node scripts\/image-promotion-drill\.mjs/)
  assert.doesNotMatch(quality, /secrets\.|environment:/)
})
