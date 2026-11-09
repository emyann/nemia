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
import { scratch } from 'test-kit/scratch';
import { eachTest } from '../../test/placed.ts';
import { story } from 'test-kit/checkpoints';

const ROOT = scratch('wf-retain-');
process.env.WF_ROOT = ROOT;
const { runWith, engineOf } = await import('../runtime-client.ts');
const { retainOnce, freshRetainMemory } = await import('./retention.verb.ts');
const { releaseDir, releasesDir, realReleasesDir, switchCurrent, writeReleaseFile } = await import('../release/release.store.ts');
const engine = eachTest(testEngine);

/** A pid no process has: past the highest Linux allows (2^22) and macOS's. */
const DEAD = 4_194_305;

/** Plants a built release of `tag` in `home`, built on day `day` of November. */
function planted(home: string, tag: string, day: number): void {
  fs.mkdirSync(releaseDir(tag, home), { recursive: true });
  writeReleaseFile(releaseDir(tag, home), {
    tag,
    commit: `${tag}000000`,
    source: '/src',
    builtAt: `2026-11-${String(day).padStart(2, '0')}T00:00:00.000Z`,
  });
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

  await s.test(
    'a local session in flight that recorded no release holds every removal, said once; a remote one holds nothing',
    async () => {
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
    },
  );

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

test('with no pointer the sweep removes nothing and asks the engine nothing: an engine with no verbs would die of being asked', async () => {
  const home = scratch('wf-retain-bare-');
  for (const [i, tag] of ['v1', 'v2', 'v3'].entries()) planted(home, tag, i + 1);
  const noVerbs = {} as never;
  const done = await runWith(noVerbs, retainOnce(home, []));
  assert.equal(done.held, 'no pointer');
  assert.deepEqual(tags(home), ['v1', 'v2', 'v3']);
});

test("a crashed first upgrade's leftovers are swept on a store with no pointer, and a live build is not", async (t) => {
  const s = story(t);
  const home = scratch('wf-retain-crashed-');
  const releases = releasesDir(home);
  const at = (name: string) => path.join(releases, name);
  fs.mkdirSync(at(`.building-v1-${DEAD}/trial/engine`), { recursive: true });
  fs.writeFileSync(at(`.building-v1-${DEAD}/trial/engine/x`), 'x');
  fs.mkdirSync(at(`.building-v2-${process.pid}/tree`), { recursive: true });
  fs.symlinkSync('v1', at(`.current-${DEAD}`));
  fs.mkdirSync(at('.logs'));
  fs.writeFileSync(at('.logs/old.log'), 'npm ci failed\n');
  const longAgo = (Date.now() - 31 * 24 * 60 * 60 * 1000) / 1000;
  fs.utimesSync(at('.logs/old.log'), longAgo, longAgo);
  fs.writeFileSync(at('.logs/new.log'), 'building\n');
  const noVerbs = {} as never;
  const sweep = () => runWith(noVerbs, retainOnce(home, []));

  await s.test('the dead build, its trial store and the dead link go, and the old log; the live build and the fresh log stay', async () => {
    const done = await sweep();
    assert.equal(done.held, 'no pointer');
    assert.deepEqual([...done.swept.entries].sort(), [`.building-v1-${DEAD}`, `.current-${DEAD}`]);
    assert.deepEqual(done.swept.logs, ['old.log']);
    assert.equal(fs.existsSync(at(`.building-v1-${DEAD}`)), false);
    assert.equal(fs.lstatSync(at(`.current-${DEAD}`), { throwIfNoEntry: false }), undefined);
    assert.equal(fs.existsSync(at('.logs/old.log')), false);
    assert.ok(fs.existsSync(at(`.building-v2-${process.pid}/tree`)), 'a live build is never touched');
    assert.ok(fs.existsSync(at('.logs/new.log')));
    assert.ok(done.lines.some((line) => line.includes(`.building-v1-${DEAD}`)));
    assert.deepEqual(
      fs.readdirSync(releases).filter((n) => n.startsWith('.removing-')),
      [],
      'deleted, not only moved aside',
    );
  });

  await s.test('a second sweep removes nothing more', async () => {
    const done = await sweep();
    assert.deepEqual(done.swept, { entries: [], logs: [] });
    assert.deepEqual(done.lines, []);
  });

  await s.test('a leftover a sweep moved aside and left is deleted by the next', async () => {
    const left = at('.removing-.building-v3-1-1');
    fs.mkdirSync(path.join(left, 'trial'), { recursive: true });
    await sweep();
    assert.equal(fs.existsSync(left), false);
  });
});
