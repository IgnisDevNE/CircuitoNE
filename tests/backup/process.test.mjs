import assert from "node:assert/strict"
import { test } from "node:test"
import { setTimeout as delay } from "node:timers/promises"
import { mkdtempSync, existsSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runProtectedProcess } from "../../scripts/apply-homologation.mjs"

test(
  "holder timeout or exit kills CLI descendants before another homologation",
  { skip: process.platform !== "linux" },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), "circuitone-supervision-"))
    try {
      for (const mode of ["timeout", "exit"]) {
        const marker = join(directory, mode)
        const parent = `require('node:child_process').spawn(process.execPath,
          ['-e',"setTimeout(()=>require('node:fs').writeFileSync(process.argv[1],'orphan'),1000)",process.argv[2]],{stdio:'ignore'});
          if(process.argv[1]==='timeout') setTimeout(()=>{},10000); else setTimeout(()=>process.exit(0),200)`
        if (mode === "timeout")
          await assert.rejects(
            runProtectedProcess(process.execPath, ["-e", parent, mode, marker], "", 400),
          )
        else
          await runProtectedProcess(process.execPath, ["-e", parent, mode, marker], "", 2000)
        await delay(1200)
        assert.ok(!existsSync(marker), "CLI survived its PostgreSQL holder")
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  },
)
