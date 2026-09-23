import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const workflow = readFileSync(new URL('../.github/workflows/validate-production.yml', import.meta.url), 'utf8');
const ref = 'ukyoyrmebwadmuzkswdw';
const pooler = 'aws-0-sa-east-1.pooler.supabase.com';
const env = {
  SUPABASE_PROJECT_REF: ref,
  SUPABASE_URL: `https://${ref}.supabase.co`,
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic',
  SUPABASE_ACCESS_TOKEN: 'synthetic-pat-do-not-log',
  SUPABASE_DB_PASSWORD: 'synthetic-password-do-not-log',
  POOLER_HOST: pooler,
  GITHUB_OUTPUT: '/test/output',
  RUNNER_TEMP: '/test/temp',
  PATH: '/usr/bin',
};

async function execute(marker, options = {}) {
  const match = workflow.match(new RegExp(`node <<'${marker}'\\r?\\n([\\s\\S]*?)          ${marker}`));
  assert.ok(match, `Missing protected script ${marker}`);
  const calls = [], logs = [], outputs = [];
  const process = { env: { ...env, ...options.env }, exitCode: 0 };
  const context = {
    process, Buffer, AbortSignal,
    console: { log: (...parts) => logs.push(parts.join(' ')), error: (...parts) => logs.push(parts.join(' ')) },
    require(name) {
      if (name === 'node:fs') return { appendFileSync: (path, value) => outputs.push([path, value]) };
      assert.equal(name, 'node:child_process');
      return { execFileSync: (...args) => {
        calls.push(args);
        if (options.dbFailure) throw new Error(env.SUPABASE_DB_PASSWORD);
        return options.dbResult ?? 't\n';
      } };
    },
    fetch: async (url, init) => {
      calls.push([url, init]);
      assert.equal(init.redirect, 'error');
      assert.ok(init.signal);
      const data = options.response ?? (url.includes('/pooler')
        ? [{ database_type: 'PRIMARY', db_host: pooler }]
        : { disable_signup: false });
      return { ok: options.httpOk ?? true, body: [Buffer.from(JSON.stringify(data))] };
    },
  };
  await runInNewContext(match[1].replace(/^          /gm, ''), context, { timeout: 1000 });
  assert.ok(!logs.join('\n').includes(env.SUPABASE_ACCESS_TOKEN));
  assert.ok(!logs.join('\n').includes(env.SUPABASE_DB_PASSWORD));
  return { calls, logs, outputs, exitCode: process.exitCode };
}

test('production check is manual, main-only and isolated from application code', () => {
  assert.match(workflow, /on:\r?\n  workflow_dispatch:/);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /environment: Producao/);
  assert.match(workflow, /permissions: \{\}/);
  assert.doesNotMatch(workflow, /actions\/checkout|pull_request_target|pnpm|npm|upload-artifact/);
  const steps = workflow.split(/\n      - /);
  assert.equal(steps.filter(step => step.includes('secrets.SUPABASE_ACCESS_TOKEN')).length, 1);
  assert.equal(steps.filter(step => step.includes('secrets.SUPABASE_DB_PASSWORD')).length, 1);
  assert.ok(!steps.some(step => step.includes('secrets.SUPABASE_ACCESS_TOKEN') && step.includes('secrets.SUPABASE_DB_PASSWORD')));
});

test('wrong project and missing configuration fail before network access', async () => {
  for (const invalid of [
    { SUPABASE_PROJECT_REF: 'odphoxozclrshqjgwbqk' },
    { SUPABASE_URL: 'https://attacker.invalid' },
    { SUPABASE_PUBLISHABLE_KEY: 'sb_secret_forbidden' },
    { SUPABASE_ACCESS_TOKEN: '' },
  ]) {
    const result = await execute('PRODUCTION_API', { env: invalid });
    assert.equal(result.exitCode, 1);
    assert.equal(result.calls.length, 0);
    assert.equal(result.outputs.length, 0);
  }
});

test('API check accepts only the production project and trusted pooler host', async () => {
  const result = await execute('PRODUCTION_API');
  assert.equal(result.exitCode, 0);
  assert.equal(result.calls[0][0], env.SUPABASE_URL + '/auth/v1/settings');
  assert.equal(result.calls[0][1].headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
  assert.equal(result.calls[0][1].headers.Authorization, undefined);
  assert.equal(result.calls[1][0], `https://api.supabase.com/v1/projects/${ref}/config/database/pooler`);
  assert.equal(result.calls[1][1].headers.Authorization, `Bearer ${env.SUPABASE_ACCESS_TOKEN}`);
  assert.deepEqual(result.outputs, [[env.GITHUB_OUTPUT, `pooler_host=${pooler}\n`]]);
  for (const response of [[{ database_type: 'PRIMARY', db_host: `${pooler}.attacker.invalid` }], 'x'.repeat(65537)]) {
    assert.equal((await execute('PRODUCTION_API', { response })).exitCode, 1);
  }
});

test('database check uses verified TLS, fixed read-only SQL and no management token', async () => {
  const result = await execute('PRODUCTION_DB');
  assert.equal(result.exitCode, 0);
  const [command, args, options] = result.calls[0];
  assert.equal(command, 'psql');
  assert.ok(args.includes('-X') && args.includes('-w') && args.includes('ON_ERROR_STOP=1'));
  assert.match(args.at(-1), /^BEGIN READ ONLY; SELECT .*; ROLLBACK;$/);
  assert.equal(options.env.PGUSER, `postgres.${ref}`);
  assert.equal(options.env.PGHOST, pooler);
  assert.equal(options.env.PGSSLMODE, 'verify-full');
  assert.equal(options.env.PGSSLROOTCERT, `${env.RUNNER_TEMP}/supabase-ca.crt`);
  assert.equal(options.env.PGPASSWORD, env.SUPABASE_DB_PASSWORD);
  assert.equal(options.env.SUPABASE_ACCESS_TOKEN, undefined);
  for (const invalid of [{ POOLER_HOST: `${pooler}\nPGPASSWORD=bad` }, { SUPABASE_DB_PASSWORD: '' }]) {
    const denied = await execute('PRODUCTION_DB', { env: invalid });
    assert.equal(denied.exitCode, 1);
    assert.equal(denied.calls.length, 0);
  }
  assert.equal((await execute('PRODUCTION_DB', { dbFailure: true })).exitCode, 1);
  assert.equal((await execute('PRODUCTION_DB', { dbResult: 'f\n' })).exitCode, 1);
});

test('certificate is pinned before the password step without secrets', () => {
  const ca = workflow.match(/      - name: Prepare pinned Supabase CA\r?\n([\s\S]*?)(?=      - name:)/)?.[1];
  assert.ok(ca);
  assert.match(ca, /700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7/);
  assert.doesNotMatch(ca, /secrets\.|--insecure|--location/);
  assert.ok(workflow.indexOf('Prepare pinned Supabase CA') < workflow.indexOf('Validate database password over verified TLS'));
});
