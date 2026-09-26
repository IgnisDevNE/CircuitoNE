import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { test } from 'node:test'

test('host startup resumes only the existing machine and project pods, failing closed on native errors', () => {
  const script = resolve('deploy/start-host.ps1').replaceAll("'", "''")
  for (const scenario of [
    { state: 'running', failed: '', status: 0, actions: ['inspect', 'pods'] },
    { state: 'stopped', failed: '', status: 0, actions: ['inspect', 'machine', 'pods'] },
    { state: 'stopped', failed: 'machine', status: 1, actions: ['inspect', 'machine'] },
    { state: 'running', failed: 'inspect', status: 1, actions: ['inspect'] },
    { state: 'unknown', failed: '', status: 1, actions: ['inspect'] },
    { state: 'running', failed: 'pods', status: 1, actions: ['inspect', 'pods'] },
  ]) {
    const command = `
      $global:actions = [System.Collections.Generic.List[string]]::new()
      function podman {
        if (($args -join ' ') -eq 'machine inspect podman-machine-default --format {{.State}}') {
          $global:actions.Add('inspect'); $global:LASTEXITCODE = [int]('${scenario.failed}' -eq 'inspect'); '${scenario.state}'
        } elseif (($args -join ' ') -eq 'machine start podman-machine-default') {
          $global:actions.Add('machine'); $global:LASTEXITCODE = [int]('${scenario.failed}' -eq 'machine')
        } elseif (($args -join ' ') -eq 'pod start circuitone-hosting-pod circuitone-production-pod') {
          $global:actions.Add('pods'); $global:LASTEXITCODE = [int]('${scenario.failed}' -eq 'pods')
        } else { throw 'Unexpected Podman operation' }
      }
      try { & '${script}'; $result = 0 } catch { $result = 1 }
      $global:actions | ConvertTo-Json -Compress -AsArray
      exit $result
    `
    const result = spawnSync(process.platform === 'win32' ? 'pwsh.exe' : 'pwsh',
      ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', timeout: 15000 })
    assert.ifError(result.error)
    assert.equal(result.status, scenario.status, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout.trim()), scenario.actions)
  }
})
