import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const ref = 'odphoxozclrshqjgwbqk';
const pooler = 'aws-0-sa-east-1.pooler.supabase.com';
const env = {
  SUPABASE_PROJECT_REF: ref,
  SUPABASE_URL: `https://${ref}.supabase.co`,
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic',
  SUPABASE_ACCESS_TOKEN: 'synthetic-pat-do-not-log',
  SUPABASE_DB_PASSWORD: 'synthetic-password-do-not-log',
  POOLER_HOST: pooler,
  GITHUB_OUTPUT: '/test/output',
  PATH: '/usr/bin',
};

async function execute(marker, options = {}) {
  const match = workflow.match(new RegExp(`node <<'${marker}'\\r?\\n([\\s\\S]*?)          ${marker}`));
  assert.ok(match, `Missing protected validation script: ${marker}`);
  const calls = [], logs = [], outputs = [];
  const process = { env: { ...env, ...options.env }, exitCode: 0 };
  const context = {
    process, Buffer, AbortSignal,
    console: { log: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push(args.join(' ')) },
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

test('credential job is manual, main-only, protected and separate from application execution', () => {
  assert.match(workflow, /validate_homologation:[\s\S]*?type: boolean\s+default: false/);
  const job = workflow.split('\n  homologation_credentials:')[1];
  assert.ok(job, 'Missing protected credentials job');
  assert.match(job, /if:.*github.event_name == 'workflow_dispatch'.*inputs.validate_homologation.*github.ref == 'refs\/heads\/main'/);
  assert.match(job, /environment: Homologação/);
  assert.match(job, /permissions: \{\}/);
  assert.doesNotMatch(job, /actions\/checkout|pnpm|npm|upload-artifact|pull_request_target/);
  const steps = job.split(/\n      - /);
  assert.equal(steps.filter(step => step.includes('secrets.SUPABASE_ACCESS_TOKEN')).length, 1);
  assert.equal(steps.filter(step => step.includes('secrets.SUPABASE_DB_PASSWORD')).length, 1);
  assert.ok(!steps.some(step => step.includes('secrets.SUPABASE_ACCESS_TOKEN') && step.includes('secrets.SUPABASE_DB_PASSWORD')));
  assert.doesNotMatch(workflow.split('\n  homologation_credentials:')[0], /secrets\./);
});

test('wrong destination and missing credentials fail before any external request', async () => {
  for (const invalid of [
    { SUPABASE_PROJECT_REF: 'mwgccjvztzbderlwtheg' },
    { SUPABASE_URL: 'https://attacker.invalid' },
    { SUPABASE_PUBLISHABLE_KEY: 'sb_secret_forbidden' },
    { SUPABASE_ACCESS_TOKEN: '' },
  ]) {
    const result = await execute('HOMOLOGATION_API', { env: invalid });
    assert.equal(result.exitCode, 1);
    assert.equal(result.calls.length, 0);
    assert.equal(result.outputs.length, 0);
  }
});

test('API validation confines headers and emits only a trusted pooler host', async () => {
  const result = await execute('HOMOLOGATION_API');
  assert.equal(result.exitCode, 0);
  assert.equal(result.calls.length, 2);
  assert.equal(result.calls[0][0], `${env.SUPABASE_URL}/auth/v1/settings`);
  assert.equal(result.calls[0][1].headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
  assert.equal(result.calls[0][1].headers.Authorization, undefined);
  assert.equal(result.calls[1][0], `https://api.supabase.com/v1/projects/${ref}/config/database/pooler`);
  assert.equal(result.calls[1][1].headers.Authorization, `Bearer ${env.SUPABASE_ACCESS_TOKEN}`);
  assert.deepEqual(result.outputs, [[env.GITHUB_OUTPUT, `pooler_host=${pooler}\n`]]);
});

test('API errors, oversized responses and unexpected destinations cannot reach the database step', async () => {
  for (const options of [
    { httpOk: false },
    { response: 'x'.repeat(65537) },
    { response: [{ database_type: 'PRIMARY', db_host: `${pooler}.attacker.invalid` }] },
  ]) {
    const result = await execute('HOMOLOGATION_API', options);
    assert.equal(result.exitCode, 1);
    assert.equal(result.outputs.length, 0);
  }
});

test('database validation authenticates with verified TLS and fixed read-only SQL without sharing the PAT', async () => {
  const result = await execute('HOMOLOGATION_DB');
  assert.equal(result.exitCode, 0);
  const [command, args, options] = result.calls[0];
  assert.equal(command, 'psql');
  assert.ok(args.includes('-X') && args.includes('-w') && args.includes('ON_ERROR_STOP=1'));
  assert.match(args.at(-1), /^BEGIN READ ONLY; SELECT .*; ROLLBACK;$/);
  assert.equal(options.env.PGHOST, pooler);
  assert.equal(options.env.PGUSER, `postgres.${ref}`);
  assert.equal(options.env.PGSSLMODE, 'verify-full');
  assert.equal(options.env.PGSSLROOTCERT, '/etc/ssl/certs/ca-certificates.crt');
  assert.equal(options.env.PGPASSWORD, env.SUPABASE_DB_PASSWORD);
  assert.equal(options.env.SUPABASE_ACCESS_TOKEN, undefined);
  assert.ok(!JSON.stringify(args).includes(env.SUPABASE_DB_PASSWORD));
});

test('database rejects unsafe hosts, empty passwords and false or failed results without logging secrets', async () => {
  for (const invalid of [{ POOLER_HOST: `${pooler}\nPGPASSWORD=bad` }, { SUPABASE_DB_PASSWORD: '' }]) {
    const result = await execute('HOMOLOGATION_DB', { env: invalid });
    assert.equal(result.exitCode, 1);
    assert.equal(result.calls.length, 0);
  }
  for (const options of [{ dbFailure: true }, { dbResult: 'f\n' }]) {
    assert.equal((await execute('HOMOLOGATION_DB', options)).exitCode, 1);
  }
});
