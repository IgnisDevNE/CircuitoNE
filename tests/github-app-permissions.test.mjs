import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { createInstallationToken } from '../scripts/github-app.mjs';

test('temporary CI permissions require explicit opt-in and never expand repository scope', async (t) => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  let requested;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    requested = JSON.parse(options.body);
    return { ok: true, json: async () => ({ token: 'synthetic', expires_at: new Date(Date.now() + 60000).toISOString() }) };
  });
  const previousActions = process.env.GITHUB_APP_ACTIONS_WRITE;
  const previousWorkflows = process.env.GITHUB_APP_WORKFLOWS_WRITE;
  try {
    for (const [actions, workflows] of [['', ''], ['1', ''], ['', '1'], ['1', '1'], ['true', 'true']]) {
      process.env.GITHUB_APP_ACTIONS_WRITE = actions;
      process.env.GITHUB_APP_WORKFLOWS_WRITE = workflows;
      await createInstallationToken(privateKey);
      assert.deepEqual(requested.repository_ids, [1380574734]);
      assert.deepEqual(requested.permissions, {
        contents: 'write', pull_requests: 'write', issues: 'write',
        actions: actions === '1' ? 'write' : 'read',
        checks: 'read', statuses: 'read', metadata: 'read',
        ...(workflows === '1' ? { workflows: 'write' } : {}),
      });
    }
  } finally {
    if (previousActions === undefined) delete process.env.GITHUB_APP_ACTIONS_WRITE;
    else process.env.GITHUB_APP_ACTIONS_WRITE = previousActions;
    if (previousWorkflows === undefined) delete process.env.GITHUB_APP_WORKFLOWS_WRITE;
    else process.env.GITHUB_APP_WORKFLOWS_WRITE = previousWorkflows;
  }
});
