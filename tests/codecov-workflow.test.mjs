import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const job = workflow.split('\n  codecov:')[1]?.split('\n  homologation_credentials:')[0];

test('coverage publication consumes this run after required checks, without executing the application', () => {
  assert.ok(job, 'Missing isolated Codecov job');
  assert.match(job, /needs: \[quality, database\]/);
  assert.match(job, /if: github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(job, /runs-on: ubuntu-24\.04/);
  assert.match(job, /contents: read\s+id-token: write/);
  assert.match(job, /persist-credentials: false/);
  assert.match(job, /actions\/checkout@[a-f0-9]{40} #/);
  assert.match(job, /actions\/download-artifact@[a-f0-9]{40}[\s\S]*?name: codecov-lcov\s+path: \.codecov-reports/);
  assert.match(workflow, /name: codecov-lcov\s+path: coverage\/lcov\.info\s+retention-days: 7\s+if-no-files-found: error/);
  assert.doesNotMatch(job, /\brun:|\bsecrets\.|\benvironment:|\brun-id:|\bgithub-token:|\bcontinue-on-error:/);
  assert.doesNotMatch(workflow.split('\n  codecov:')[0], /id-token: write|codecov\/codecov-action/);
});

test('upload pins tools, sends only LCOV, and identifies the tested commit and PR', () => {
  assert.ok(job, 'Missing isolated Codecov job');
  assert.match(job, /codecov\/codecov-action@303a32d7a59b442fa8d48b6a1cc6825c09c847a5/);
  for (const setting of ['version: v11.3.1', 'files: .codecov-reports/lcov.info', 'use_oidc: true',
    'disable_search: true', 'disable_file_fixes: true', 'disable_telem: true',
    'plugins: noop', 'fail_ci_if_error: true', 'slug: IgnisDevNE/CircuitoNE',
    'override_commit: ${{ github.sha }}', 'override_pr: ${{ github.event.pull_request.number }}']) {
    assert.ok(job.includes(setting), `Missing upload constraint: ${setting}`);
  }
  assert.doesNotMatch(job, /(?:^|\n)\s+(?:token|url|binary):|skip_validation: true|use_pypi: true/);
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
  assert.match(publisher, /token: \$\{\{ secrets\.CODECOV_TOKEN \}\}/);
  assert.match(publisher, /override_commit: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(publisher, /override_pr: \$\{\{ steps\.source\.outputs\.pr \}\}/);
  assert.match(publisher, /actions\/runs\/\$\{run\.id\}\/jobs\?per_page=100&filter=latest/);
  assert.doesNotMatch(publisher, /pnpm|npm|docker|bash .*\.codecov-reports|use_oidc: true|skip_validation: true/);
});

test('publisher accepts only the matching PR metadata for the tested source commit', async () => {
  const publisher = readFileSync(new URL('../.github/workflows/codecov-publish.yml', import.meta.url), 'utf8');
  const script = publisher.match(/node <<'SOURCE'\r?\n([\s\S]*?)^\s+SOURCE/m)?.[1]?.replace(/^          /gm, '');
  assert.ok(script);
  const sha = 'a'.repeat(40);
  for (const [headSha, qualityConclusion] of [[sha, 'success'], ['b'.repeat(40), 'success'], [sha, 'failure']]) {
    const output = [];
    const errors = [];
    const process = { env: { GITHUB_EVENT_PATH: 'event.json', GITHUB_OUTPUT: 'out', GH_TOKEN: 'read-only-test' }, exitCode: 0 };
    const run = { id: 123, head_sha: sha, head_branch: 'codex/coverage', event: 'pull_request' };
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
    if (headSha === sha && qualityConclusion === 'success') {
      assert.deepEqual(output, ['pr=81\nbranch=codex/coverage\n']);
      assert.equal(process.exitCode, 0);
    } else {
      assert.deepEqual(output, []);
      assert.equal(process.exitCode, 1);
      assert.match(errors[0], qualityConclusion === 'failure' ? /Required CI job did not pass/ : /Expected one PR/);
    }
  }
});
