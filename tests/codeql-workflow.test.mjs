import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/codeql.yml', import.meta.url), 'utf8');

test('CodeQL scans application and workflow security on PRs, main and a weekly schedule', () => {
  assert.match(workflow, /^\s+queries: security-extended$/m);
  assert.match(workflow, /push:\s+branches: \[\s*['"]?main['"]?\s*\]/);
  assert.match(workflow, /pull_request:\s+branches: \[\s*['"]?main['"]?\s*\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /cron: '30 4 \* \* 4'/);
  assert.match(workflow, /language: \[actions, javascript-typescript\]/);
  assert.match(workflow, /build-mode: none/);
  assert.ok(workflow.includes('category: "/language:${{ matrix.language }}"'));
  assert.doesNotMatch(workflow, /pull_request_target|paths-ignore:|paths:|continue-on-error:|disable-default-queries:/);
});

test('CodeQL has bounded hosted execution and cannot run the application with privileged credentials', () => {
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /timeout-minutes: 20/);
  assert.match(workflow, /permissions: \{\}/);
  assert.match(workflow, /permissions:\s+contents: read\s+security-events: write/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /cancel-in-progress: true/);
  const actions = [...workflow.matchAll(/uses: (\S+)/g)].map(match => match[1]);
  assert.deepEqual(actions.map(action => action.split('@')[0]), [
    'actions/checkout', 'github/codeql-action/init', 'github/codeql-action/analyze',
  ]);
  for (const action of actions) assert.match(action, /^(actions\/checkout|github\/codeql-action\/(init|analyze))@[a-f0-9]{40}$/);
  assert.equal(actions[1].split('@')[1], actions[2].split('@')[1], 'CodeQL init/analyze must use the same release');
  assert.doesNotMatch(workflow, /\brun:|\bsecrets\.|\benvironment:|self-hosted|id-token:|packages:|actions: read|contents: write/);
});
