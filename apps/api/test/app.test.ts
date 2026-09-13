import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// agent-workflows locates its store when the module loads, so point it at a scratch directory first.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-'));
process.env.WF_ROOT = root;
const { app } = await import('../src/app.ts');

test('health answers', async () => {
  const res = await app.request('/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test('an empty store lists no runs', async () => {
  const res = await app.request('/api/runs');
  assert.deepEqual(await res.json(), []);
});

test('runs are read from the workflow store and summarized', async () => {
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'runs', 'r-1.json'), JSON.stringify({
    id: 'r-1', repo: '/code/app', workspace: '/code/app', baseRef: 'abc123', branch: 'main', isolate: true,
    brief: 'Do the thing', workflowDir: '/code/app/workflows', createdAt: '2026-09-12T00:00:00.000Z',
    steps: { implement: { taskId: 't-1', branch: 'wf/r-1/implement' }, review: { taskId: null } },
  }));
  fs.writeFileSync(path.join(root, 'runs', 'r-1.cancelled'), '2026-09-12T01:00:00.000Z');

  const res = await app.request('/api/runs');
  assert.deepEqual(await res.json(), [{
    id: 'r-1', repo: '/code/app', brief: 'Do the thing', createdAt: '2026-09-12T00:00:00.000Z',
    cancelledAt: '2026-09-12T01:00:00.000Z',
    steps: [
      { name: 'implement', taskId: 't-1', branch: 'wf/r-1/implement' },
      { name: 'review', taskId: null, branch: null },
    ],
  }]);
});
