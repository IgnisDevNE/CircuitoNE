import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
  assert.match(config, /comment: false/);
  assert.doesNotMatch(config, /\bignore:|\btarget:|\bthreshold:/);
  const owners = readFileSync(new URL('../.github/CODEOWNERS', import.meta.url), 'utf8');
  assert.match(owners, /^\/codecov\.yml @magalz$/m);
});
