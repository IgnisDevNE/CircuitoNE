import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('CI preserves LCOV and leaves publication to the protected workflow', () => {
  assert.match(workflow, /name: codecov-lcov\s+path: coverage\/lcov\.info\s+retention-days: 7\s+if-no-files-found: error/);
  assert.doesNotMatch(workflow, /\n  codecov:|id-token: write|codecov\/codecov-action/);
});

test('coverage is informational and cannot replace application checks or the independent acceptance suite', () => {
  const config = readFileSync(new URL('../codecov.yml', import.meta.url), 'utf8');
  assert.match(config, /project:\s+default:\s+informational: true/);
  assert.match(config, /patch:\s+default:\s+informational: true/);
  assert.doesNotMatch(config, /comment:\s*false/);
  assert.match(config, /comment:\s*\n\s+layout: reach,diff,flags,files/);
  assert.doesNotMatch(config, /\bignore:|\btarget:|\bthreshold:/);
  const owners = readFileSync(new URL('../.github/CODEOWNERS', import.meta.url), 'utf8');
  assert.match(owners, /^\/codecov\.yml @magalz$/m);
});

test('self-hosted publisher reads only a CI artifact with passing required jobs from the same repository', () => {
  const publisher = readFileSync(new URL('../.github/workflows/codecov-publish.yml', import.meta.url), 'utf8');
  assert.match(publisher, /workflow_run:\s+workflows: \[CI\]\s+types: \[completed\]/);
  assert.match(publisher, /github\.event\.workflow_run\.conclusion == 'success' \|\| github\.event\.workflow_run\.conclusion == 'failure'/);
  assert.match(publisher, /head_repository\.full_name == 'IgnisDevNE\/CircuitoNE'/);
  assert.match(publisher, /environment: Codecov Upload/);
  assert.match(publisher, /actions: read/);
  assert.match(publisher, /run-id: \$\{\{ github\.event\.workflow_run\.id \}\}/);
  assert.match(publisher, /github-token: \$\{\{ github\.token \}\}/);
  assert.match(publisher, /url: https:\/\/pipeline\.magalz\.space/);
  assert.match(publisher, /codecov\/codecov-action@303a32d7a59b442fa8d48b6a1cc6825c09c847a5/);
  assert.match(publisher, /version: v11\.3\.1/);
  assert.match(publisher, /token: \$\{\{ secrets\.CODECOV_TOKEN \}\}/);
  assert.match(publisher, /override_commit: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(publisher, /override_pr: \$\{\{ steps\.source\.outputs\.pr \}\}/);
  assert.match(publisher, /actions\/runs\/\$\{run\.id\}\/jobs\?per_page=100&filter=latest/);
  assert.match(publisher, /run\.path\?\.split\('@', 1\)\[0\] !== '\.github\/workflows\/ci\.yml'/);
  assert.doesNotMatch(publisher, /pnpm|npm|docker|bash .*\.codecov-reports|use_oidc: true|skip_validation: true/);
});

test('publisher accepts only the matching PR metadata for the tested source commit', async () => {
  const publisher = readFileSync(new URL('../.github/workflows/codecov-publish.yml', import.meta.url), 'utf8');
  const script = publisher.match(/node <<'SOURCE'\r?\n([\s\S]*?)^\s+SOURCE/m)?.[1]?.replace(/^          /gm, '');
  assert.ok(script);
  const sha = 'a'.repeat(40);
  for (const [headSha, qualityConclusion, path] of [[sha, 'success', '.github/workflows/ci.yml@main'], ['b'.repeat(40), 'success', '.github/workflows/ci.yml'], [sha, 'failure', '.github/workflows/ci.yml'], [sha, 'success', '.github/workflows/other.yml@main']]) {
    const output = [];
    const errors = [];
    const process = { env: { GITHUB_EVENT_PATH: 'event.json', GITHUB_OUTPUT: 'out', GH_TOKEN: 'read-only-test' }, exitCode: 0 };
    const run = { id: 123, path, head_sha: sha, head_branch: 'codex/coverage', event: 'pull_request' };
    await runInNewContext(`(async () => { ${script} })()`, {
      require: () => ({ readFileSync: () => JSON.stringify({ workflow_run: run }), appendFileSync: (_path, value) => output.push(value) }),
      process,
      fetch: async url => url.includes('/jobs?')
        ? { ok: true, json: async () => ({ total_count: 2, jobs: [{ name: 'quality', conclusion: qualityConclusion }, { name: 'database', conclusion: 'success' }] }) }
        : { ok: true, json: async () => [{ number: 81, head: { sha: headSha, repo: { full_name: 'IgnisDevNE/CircuitoNE' }, ref: 'codex/coverage' }, base: { repo: { full_name: 'IgnisDevNE/CircuitoNE' } } }] },
      AbortSignal,
      console: { error: value => errors.push(value) },
    });
    await new Promise(resolve => setImmediate(resolve));
    if (headSha === sha && qualityConclusion === 'success' && path.startsWith('.github/workflows/ci.yml')) {
      assert.deepEqual(output, ['pr=81\nbranch=codex/coverage\n']);
      assert.equal(process.exitCode, 0);
    } else {
      assert.deepEqual(output, []);
      assert.equal(process.exitCode, 1);
      assert.match(errors[0], path.includes('other.yml') ? /Unexpected source workflow/ : qualityConclusion === 'failure' ? /Required CI job did not pass/ : /Expected one PR/);
    }
  }
});
