/**
 * The retention's sweep on a scratch store of planted releases and the engine's stand-in: what it keeps for a session in flight, for a
 * running process and as the two newest, what it removes once nothing needs it, and what holds it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from '../../test/scratch.ts';
import { eachTest } from '../../test/placed.ts';
import { story } from '../../test/checkpoints.ts';

const ROOT = scratch('wf-retain-');
process.env.WF_ROOT = ROOT;
const { runWith, engineOf } = await import('../runtime-client.ts');
const { retainOnce, freshRetainMemory } = await import('./retention.verb.ts');
const { releaseDir, releasesDir, realReleasesDir, switchCurrent, writeReleaseFile } = await import('./release.store.ts');
const engine = eachTest(testEngine);

/** Plants a built release of `tag` in `home`, built on day `day` of November. */
function planted(home: string, tag: string, day: number): void {
  fs.mkdirSync(releaseDir(tag, home), { recursive: true });
  writeReleaseFile(releaseDir(tag, home), { tag, commit: `${tag}000000`, source: '/src', builtAt: `2026-11-${String(day).padStart(2, '0')}T00:00:00.000Z` });
}

/** The tags installed in `home`, sorted. */
const tags = (home: string): string[] =>
  fs
    .readdirSync(releasesDir(home))
    .filter((n) => !n.startsWith('.') && n !== 'current')
    .sort();

test('the sweep keeps the current, the two newest and what runs, removes the rest, and holds on a session it cannot place', async (t) => {
  const s = story(t);
  const home = scratch('wf-retain-store-');
  for (const [i, tag] of ['v1', 'v2', 'v3', 'v4'].entries()) planted(home, tag, i + 1);
  switchCurrent('v4', home);
  const e = engineOf(engine().layer);
  const memory = freshRetainMemory();
  const sweep = (processes: Parameters<typeof retainOnce>[1] = []) => runWith(e, retainOnce(home, processes, memory));
  const image = (tag: string) => path.join(realReleasesDir(home), tag, 'packages', 'agent-runtime');

  await s.test('a session in flight on v1 keeps it; v2 goes, v3 and v4 stay as the two newest', async () => {
    await Effect.runPromise(e.file({ id: 'on-v1', brief: 'b', cwd: '/r', harness: 'claude' }));
    engine().settle('on-v1', 'working', { image: image('v1') });
    const done = await sweep();
    assert.deepEqual(done.removed, ['v2']);
    assert.equal(done.held, null);
    assert.deepEqual(tags(home), ['v1', 'v3', 'v4']);
    assert.match(done.lines[0] ?? '', /\bv2\b/);
  });

  await s.test('once that session has ended, the next sweep removes v1', async () => {
    engine().settle('on-v1', 'succeeded', { image: image('v1') });
    const done = await sweep();
    assert.deepEqual(done.removed, ['v1']);
    assert.deepEqual(tags(home), ['v3', 'v4']);
  });

  await s.test('a local session in flight that recorded no release holds every removal, said once; a remote one holds nothing', async () => {
    planted(home, 'v0', 0);
    await Effect.runPromise(e.file({ id: 'unplaced', brief: 'b', cwd: '/r', harness: 'claude' }));
    engine().settle('unplaced', 'working', {});
    const first = await sweep();
    assert.equal(first.held, 'unrecorded');
    assert.deepEqual(first.removed, []);
    assert.match(first.lines[0] ?? '', /\b1 local session\b/);
    assert.ok(tags(home).includes('v0'), 'v0 kept while held');
    assert.equal(memory.said, first.lines[0], 'said, and remembered so the next sweep says it no more');
    await sweep();
    assert.equal(memory.said, first.lines[0]);
    engine().settle('unplaced', 'succeeded', {});
    await Effect.runPromise(e.file({ id: 'remote', brief: 'b', cwd: '/r', harness: 'a2a:x' }));
    engine().settle('remote', 'working', {});
    const after = await sweep();
    assert.equal(after.held, null, 'a remote agent runs on no release here');
    assert.deepEqual(after.removed, ['v0']);
  });

  await s.test('a running process on v3 keeps it once v5 and v6 are newer', async () => {
    planted(home, 'v5', 5);
    planted(home, 'v6', 6);
    switchCurrent('v6', home);
    const done = await sweep([{ kind: 'install', root: releaseDir('v3', home) }]);
    assert.deepEqual(done.removed, ['v4']);
    assert.deepEqual(tags(home), ['v3', 'v5', 'v6']);
  });

  await s.test('a release a sweep moved aside and left is deleted by the next', async () => {
    const left = path.join(releasesDir(home), '.removing-v0-1');
    fs.mkdirSync(path.join(left, 'deep'), { recursive: true });
    await sweep();
    assert.equal(fs.existsSync(left), false);
  });
});

test('with no pointer the sweep removes nothing and asks the engine nothing', async () => {
  const home = scratch('wf-retain-bare-');
  for (const [i, tag] of ['v1', 'v2', 'v3'].entries()) planted(home, tag, i + 1);
  const done = await runWith({} as never, retainOnce(home, [])); // an engine with no verbs: asking it anything dies
  assert.equal(done.held, 'no pointer');
  assert.deepEqual(tags(home), ['v1', 'v2', 'v3']);
});
