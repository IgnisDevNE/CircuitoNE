import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { setTimeout as delay } from "node:timers/promises"

function engine(args) {
  const name = process.env.CONTAINER_ENGINE ?? "docker"
  assert.ok(["docker", "podman"].includes(name))
  try {
    return execFileSync(name, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,
      maxBuffer: 65536,
    }).trim()
  } catch {
    throw Error("Isolated image operation failed")
  }
}

export async function imagePromotionDrill(
  previous,
  previousSha,
  candidate,
  candidateSha,
  run = engine,
) {
  for (const id of [previous, candidate])
    assert.match(id, /^sha256:[a-f0-9]{64}$/)
  for (const sha of [previousSha, candidateSha])
    assert.match(sha, /^[a-f0-9]{40}$/)
  assert.notEqual(previous, candidate)
  assert.notEqual(previousSha, candidateSha)
  for (const [id, sha] of [
    [previous, previousSha],
    [candidate, candidateSha],
  ]) {
    const images = JSON.parse(run(["image", "inspect", id]))
    assert.equal(images.length, 1)
    assert.equal(images[0].Id, id)
    assert.equal(
      images[0].Config.Labels["org.opencontainers.image.revision"],
      sha,
      "Image source SHA mismatch",
    )
  }
  const prefix = `circuitone-deploy-drill-${randomBytes(6).toString("hex")}`
  const target = `${prefix}-target`,
    staged = `${prefix}-staged`
  const owned = new Set()
  const start = (name, id) => {
    owned.add(name)
    run([
      "run",
      "-d",
      "--name",
      name,
      "--network",
      "none",
      "--read-only",
      "--tmpfs",
      "/tmp",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--memory",
      "512m",
      "--env",
      "CIRCUITONE_RUNTIME=preview",
      "--env",
      "HOST=127.0.0.1",
      id,
    ])
    assert.equal(
      run(["inspect", "--format", "{{.Image}}", name]),
      id,
      "Deployment image changed",
    )
  }
  const remove = (name) => {
    const present = run([
      "ps",
      "-a",
      "--filter",
      `name=${name}`,
      "--format",
      "{{.Names}}",
    ])
    assert.ok(
      present === "" || present === name,
      "Unexpected cleanup inventory",
    )
    if (present) run(["rm", "-f", name])
    owned.delete(name)
  }
  const health = (name) =>
    run([
      "exec",
      name,
      "node",
      "--input-type=module",
      "-e",
      `
    for (const [path,title] of [['/','Início · CIRCUITO NE'],['/artistas/art-anerie','ANERIE · CIRCUITO NE']]) {
      const r=await fetch('http://127.0.0.1:3000'+path,{redirect:'error',signal:AbortSignal.timeout(3000)});
      if(r.status!==200 || !(await r.text()).includes('<title>'+title+'</title>'))process.exit(1);
    } console.log('healthy');`,
    ])
  const ready = async (name) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        assert.equal(health(name), "healthy")
        return
      } catch {}
      await delay(500)
    }
    throw Error("Isolated deployment smoke failed")
  }
  try {
    start(target, previous)
    await ready(target)
    start(staged, candidate)
    await ready(staged)
    // Candidate validation must leave the last valid image untouched.
    assert.equal(run(["inspect", "--format", "{{.Image}}", target]), previous)
    remove(staged)
    remove(target)
    try {
      start(target, candidate)
      await ready(target)
    } catch (error) {
      remove(target)
      start(target, previous)
      await ready(target)
      throw error
    }
    assert.equal(run(["inspect", "--format", "{{.Image}}", target]), candidate)
    // Controlled late failure: recovery must use the previous immutable bytes.
    run(["stop", target])
    assert.throws(() => health(target), "Stopped candidate must fail health")
    remove(target)
    start(target, previous)
    await ready(target)
    assert.equal(run(["inspect", "--format", "{{.Image}}", target]), previous)
    return {
      previousSha,
      candidateSha,
      promotedImage: candidate,
      rollbackImage: previous,
      failedHealthDetected: true,
    }
  } finally {
    const failed = []
    for (const name of owned) {
      try {
        remove(name)
      } catch {
        failed.push(name)
      }
    }
    assert.equal(failed.length, 0, "Isolated deployment cleanup failed")
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    assert.equal(process.argv.length, 6)
    const result = await imagePromotionDrill(...process.argv.slice(2))
    console.log(JSON.stringify(result))
  } catch {
    console.error(
      "::error::Image promotion/rollback drill failed; only isolated disposable containers were targeted.",
    )
    process.exitCode = 1
  }
}
