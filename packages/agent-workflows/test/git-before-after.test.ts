/**
 * The proof that folder workspaces changed no git run: every shipped folder's runs read as they did before `workspace: folder` existed.
 *
 * `fixtures/git-runs-before.json` is what the code of the commit before folder workspaces read them as (`git-runs-pin.ts`): each step's
 * brief and workspace plan, and the run's decision, listing and offer to decide while running, once every step succeeded and once its
 * last steps failed — with worktrees and without — and a forget's line. It is never regenerated: a difference is a finding, not a fixture
 * to refresh.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SHIPPED, forgetLines, pin } from './git-runs-pin.ts';

const BEFORE: { folders: Record<string, unknown>; forget: string[] } =
  JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'git-runs-before.json'), 'utf8'));

test('the fixture holds every shipped folder, and nothing else', () => {
  assert.deepEqual(Object.keys(BEFORE.folders).sort(), [...SHIPPED].sort());
});

for (const folder of SHIPPED) {
  test(`${folder}: a git run reads as it did before folder workspaces`, () => {
    assert.deepEqual(pin(folder), BEFORE.folders[folder]);
  });
}

test('a git run is forgotten in the words it was before folder workspaces', () => {
  assert.deepEqual(forgetLines(), BEFORE.forget);
});
