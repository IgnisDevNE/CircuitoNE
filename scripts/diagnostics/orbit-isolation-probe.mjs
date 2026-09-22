// Prompt #55b. Synthetic diagnostic, not an independent acceptance verifier.
// Run from the assigned worktree: node scripts/diagnostics/orbit-isolation-probe.mjs
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
assert.equal(resolve(process.cwd()), root, 'Run from the assigned worktree root')
const scratch = join(root, '.orbit', 'tmp', 'orbit-isolation-55b')
mkdirSync(scratch, { recursive: true })
const dir = mkdtempSync(join(scratch, 'probe-'))
const put = (name, contents) => writeFileSync(join(dir, name), contents)
const sha = (name) => createHash('sha256').update(readFileSync(join(dir, name))).digest('hex')
const digest = (value) => createHash('sha256').update(value).digest('hex')
// No parent credentials, NODE_OPTIONS, npm configuration, or inherited PATH enter children.
const childEnv = Object.fromEntries(
  ['SystemRoot', 'WINDIR', 'TEMP', 'TMP'].filter((name) => process.env[name])
    .map((name) => [name, process.env[name]]),
)
childEnv.PATH = dirname(process.execPath)
const run = (args, env = childEnv) => {
  const result = spawnSync(process.execPath, args, {
    cwd: dir, env, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  assert.ifError(result.error)
  assert.equal(result.signal, null, 'Child terminated by a signal')
  const output = result.stdout + result.stderr
  return {
    exit: result.status,
    executed: output.includes('SYNTHETIC_ASSERTION_EXECUTED'),
    passed: Number(output.match(/# pass (\d+)/)?.[1] ?? 0),
    failed: Number(output.match(/# fail (\d+)/)?.[1] ?? 0),
    skipped: Number(output.match(/# skipped (\d+)/)?.[1] ?? 0),
    outputSha256: digest(output),
  }
}

const reference = `import test from 'node:test'
import assert from 'node:assert/strict'
import { answer } from './candidate.mjs'
test('fixed synthetic expectation: 42', () => {
  console.log('SYNTHETIC_ASSERTION_EXECUTED')
  assert.equal(answer, 42)
})
`
const localTest = `import test from 'node:test'
import { validate } from './assert-dependency.mjs'
import { expected } from './expectation.mjs'
import { answer } from './candidate.mjs'
test('mutable synthetic expectation', () => {
  console.log('SYNTHETIC_ASSERTION_EXECUTED')
  validate(answer, expected)
})
`
const bad = 'export const answer = 41;\n'
const good = 'export const answer = 42;\n'
put('reference.test.mjs', reference)
put('local.test.mjs', localTest)
put('assert-dependency.mjs', "export { strictEqual as validate } from 'node:assert';\n")
put('expectation.mjs', 'export const expected = 42;\n')
put('runner.mjs', "import './local.test.mjs';\n")
put('package.json', JSON.stringify({ private: true, scripts: { test: 'node --test local.test.mjs' } }))
const oracleSha = sha('reference.test.mjs')
const localSha = sha('local.test.mjs')
const checks = []
const rejected = (result) => {
  assert.equal(result.exit, 1)
  assert.equal(result.executed, true)
  assert.equal(result.failed, 1)
  assert.equal(result.passed, 0)
}
const accepted = (result) => {
  assert.equal(result.exit, 0)
  assert.equal(result.executed, true)
  assert.equal(result.passed, 1)
  assert.equal(result.failed, 0)
  assert.equal(result.skipped, 0)
}
const fixedRun = () => {
  assert.equal(sha('reference.test.mjs'), oracleSha)
  return run(['--test', '--test-reporter=tap', 'reference.test.mjs'])
}

// Expectations are written first; RED is an assertion mismatch, not missing setup.
put('candidate.mjs', bad)
const badSha = sha('candidate.mjs')
const red = fixedRun()
rejected(red)
checks.push({ case: 'known-bad-candidate', observed: red })
put('candidate.mjs', good)
const green = fixedRun()
accepted(green)
checks.push({ case: 'corrected-candidate', observed: green, oracleUnchanged: true })
const goodSha = sha('candidate.mjs')
put('candidate.mjs', bad)
rejected(run(['--test', '--test-reporter=tap', 'local.test.mjs']))

// Each mutation is limited to newly created synthetic files.
const attacks = [
  {
    name: 'test-script', file: 'package.json',
    content: JSON.stringify({ private: true, scripts: { test: 'node pretend.mjs' } }),
    args: ['--run', 'test'],
  },
  { name: 'runner', file: 'runner.mjs', content: "console.log('claimed success');\n", args: ['runner.mjs'] },
  { name: 'dependency', file: 'assert-dependency.mjs', content: 'export const validate = () => {};\n' },
  { name: 'expectation-fixture', file: 'expectation.mjs', content: 'export const expected = 41;\n' },
  { name: 'skip', file: 'local.test.mjs', content: localTest.replace('test(', 'test.skip(') },
  {
    name: 'forced-zero-exit', file: 'runner.mjs',
    content: `import { spawnSync } from 'node:child_process';
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'local.test.mjs'], { encoding: 'utf8', env: process.env });
process.stdout.write(result.stdout); process.stderr.write(result.stderr); process.exit(0);\n`,
    args: ['runner.mjs'],
  },
]
put('pretend.mjs', "console.log('claimed success');\n")
for (const attack of attacks) {
  const original = readFileSync(join(dir, attack.file))
  try {
    put(attack.file, attack.content)
    const observed = run(attack.args ?? ['--test', '--test-reporter=tap', 'local.test.mjs'])
    assert.equal(observed.exit, 0, `${attack.name}: expected misleading zero exit`)
    if (attack.name === 'forced-zero-exit') assert.equal(observed.failed, 1)
    if (attack.name === 'skip') { assert.equal(observed.skipped, 1); assert.equal(observed.executed, false) }
    if (['runner', 'test-script'].includes(attack.name)) assert.equal(observed.executed, false)
    if (['dependency', 'expectation-fixture'].includes(attack.name)) accepted(observed)
    const referenceObserved = fixedRun()
    rejected(referenceObserved)
    checks.push({ case: attack.name, observed, fixedReference: referenceObserved })
  } finally {
    put(attack.file, original)
  }
}

put('loader.mjs', `export async function load(url, context, next) {
  if (url.endsWith('/candidate.mjs')) return { format: 'module', shortCircuit: true, source: 'export const answer = 42;' };
  return next(url, context);
}\n`)
put('register.mjs', "import { register } from 'node:module'; register('./loader.mjs', import.meta.url);\n")
const withLoader = run(['--import', './register.mjs', '--test', '--test-reporter=tap', 'local.test.mjs'])
accepted(withLoader)
const withoutLoader = fixedRun()
rejected(withoutLoader)
assert.equal(sha('candidate.mjs'), badSha)
checks.push({ case: 'loader', observed: withLoader, fixedReference: withoutLoader, candidateUnchanged: true })

// A final hash detects persisted mutations but cannot reconstruct restored history.
put('local.test.mjs', localTest.replace('test(', 'test.skip('))
const persistedDetected = sha('local.test.mjs') !== localSha
assert.equal(persistedDetected, true)
const duringTemporary = run(['--test', '--test-reporter=tap', 'local.test.mjs'])
assert.equal(duringTemporary.skipped, 1)
put('local.test.mjs', localTest)
const restoredInvisibleToFinalHash = sha('local.test.mjs') === localSha
assert.equal(restoredInvisibleToFinalHash, true)
checks.push({ case: 'persisted-versus-restored', persistedDetected, restoredInvisibleToFinalHash, duringTemporary })

// Synthetic canary only; never read or print real credential values.
put('canary.mjs', "process.exit(process.env.ORBIT_ISOLATION_SYNTHETIC_CANARY === 'PUBLIC-FIXTURE-NOT-A-SECRET' ? 0 : 2);\n")
const injected = run(['canary.mjs'], { ...childEnv, ORBIT_ISOLATION_SYNTHETIC_CANARY: 'PUBLIC-FIXTURE-NOT-A-SECRET' })
const removed = run(['canary.mjs'])
assert.equal(injected.exit, 0)
assert.equal(removed.exit, 2)
checks.push({ case: 'synthetic-env-canary', injectedReadable: true, removedAbsent: true, vaultInjectionTested: false })

const report = {
  prompt: '55b', generatedAt: new Date().toISOString(), runtime: process.version,
  authority: 'same worker controls fixture, reference, runner and this result; NOT independent acceptance',
  directory: relative(root, dir).replaceAll('\\', '/'),
  oracleSha256: oracleSha, localTestSha256: localSha,
  badCandidateSha256: badSha, correctedCandidateSha256: goodSha,
  parentCredentialValuesRead: false, checks,
}
writeFileSync(join(dir, 'results.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
