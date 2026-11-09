/**
 * `nemia version`'s sessions, read off the engine's records: the last attempt of each task at work, by the release its image sits under
 * and the harness version it recorded; an ended attempt, and a settled task, are no session at work.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from 'test-kit/scratch';
import { eachTest } from '../../test/placed.ts';

const ROOT = scratch('wf-version-');
process.env.WF_ROOT = ROOT;
const { runWith, engineOf } = await import('../runtime-client.ts');
const { versions } = await import('./version.verb.ts');
const { realReleasesDir } = await import('./release.store.ts');
const engine = eachTest(testEngine);

test('nemia version counts the sessions at work by the release and Claude Code version their attempts recorded, and no other', async () => {
  const e = engineOf(engine().layer);
  const image = path.join(realReleasesDir(ROOT), 'v1.2.0', 'packages', 'agent-runtime');
  for (const id of ['a', 'b', 'c', 'd']) await Effect.runPromise(e.file({ id, brief: 'b', cwd: '/r', harness: 'claude' }));
  engine().settle('a', 'working', { image, harnessVersion: '2.1.316' });
  engine().settle('b', 'working', { image, harnessVersion: '2.1.316' });
  engine().settle('c', 'succeeded', { image, harnessVersion: '2.1.315' });
  engine().settle('d', 'working', {});
  const read = await runWith(e, versions(ROOT));
  assert.deepEqual(read.sessions, [
    { release: { kind: 'install', tag: 'v1.2.0' }, harness: { name: 'claude', version: '2.1.316' }, count: 2 },
    { release: null, harness: null, count: 1 },
  ]);
  assert.equal(read.lines.at(-1), 'sessions: 2 on v1.2.0, claude 2.1.316; 1 not recorded');
});
