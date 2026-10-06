/**
 * The allow list an ending's session is filed with (`filedAllows`): a read of its run's artifacts for a step in the repository's own
 * checkout on a harness fenced by permission rules, and the step's own list for any other.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filedAllows } from './ending.ts';

const ARTIFACTS = '/store/runs/r1/artifacts';
const READ = 'Read(//store/runs/r1/artifacts/**)';

test("a step in the checkout is filed with a read of its run's artifacts after its own rules, on the default harness and on each one fenced by permission rules", () => {
  assert.deepEqual(filedAllows({ workspace: 'main' }, ARTIFACTS), [READ]);
  assert.deepEqual(filedAllows({ workspace: 'main', harness: 'claude-detached', allowedTools: ['Bash(git status)'] }, ARTIFACTS), [
    'Bash(git status)',
    READ,
  ]);
  assert.deepEqual(filedAllows({ workspace: 'main', allowedTools: [READ] }, ARTIFACTS), [READ], 'given once');
});

test('REFUSED: a step in a worktree or a folder, and one in the checkout on a harness fenced by no permission rule, is filed with its own list only', () => {
  const own = ['Bash(git status)'];
  assert.equal(filedAllows({ allowedTools: own }, ARTIFACTS), own, 'a worktree');
  const inFolder = { place: 'folder' as const, allowedTools: own };
  assert.equal(filedAllows(inFolder, ARTIFACTS), own, 'a folder');
  assert.equal(filedAllows({ workspace: 'main', harness: 'codex' }, ARTIFACTS), undefined, 'a sandbox');
  assert.equal(filedAllows({ workspace: 'main', harness: 'a2a:far-away' }, ARTIFACTS), undefined, 'a remote agent');
});
