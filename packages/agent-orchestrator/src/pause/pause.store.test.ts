/**
 * The store's pause on disk: put once, read back, refused a second time while it stands, lifted once, refused a second lift; and a file
 * that does not read as the pause still pauses; and a cordon `nemia cordon` put before the switch, at the same `WF_ROOT/cordon`, is the
 * pause, honoured by every reader and resumed by `nemia resume`. On a store of its own at `ROOT`, given as `ENV`.
 *
 * And the store against its machine (pause-machine.ts): each event brought to a store in each mode leaves the file in the mode `pauseMove`
 * answers, or is refused as it refuses, so a move the machine does not make is one the store does not write; and no file of `src` but
 * the store's own names the pause's file.
 */
import { type Env, settingsOf } from '../config/config.store.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { names } from '../../test/assessed.ts';
import { PAUSE_EVENTS, PAUSE_MODES, pauseMove, type PauseEvent, type PauseMode } from '../pause-machine/pause-machine.ts';
import { cutPause, liftLapsedPause, modeAt, pauseFile, resumePause, putPause, readPause } from './pause.store.ts';
import { storeAdmission } from '../runtime-client.ts';

const ROOT = scratch('wf-pause-store-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT };

/** Whether `fn` refuses with exit 2, of `kind`, its message naming each of `facts`: the command its fix names, and who and when. */
function refusedAs(fn: () => unknown, kind: string, ...facts: string[]): void {
  try {
    fn();
  } catch (err) {
    const e = err as Error & { exitCode?: number; _tag?: string };
    assert.equal(e.exitCode, 2);
    assert.equal(e._tag, kind);
    names(e.message, ...facts);
    return;
  }
  assert.fail('expected a refusal');
}

test('the pause on disk: put, read back, refused, lifted, read when it does not parse, and a cordon put before the switch', async (t) => {
  await t.test('a pause is put once, read back, refused while it stands, and lifted once', () => {
    assert.equal(readPause(ROOT), null);
    const put = putPause(ROOT, { why: 'merging by hand', by: 'ann' }, new Date('2026-10-04T12:00:00.000Z'));
    assert.deepEqual(put, { at: '2026-10-04T12:00:00.000Z', by: 'ann', why: 'merging by hand' });
    assert.equal(pauseFile(ROOT), path.join(ROOT, 'cordon'));
    assert.deepEqual(readPause(ROOT), put);
    refusedAs(
      () => putPause(ROOT, { by: 'bob' }),
      'Conflict',
      'already paused',
      'ann',
      '2026-10-04T12:00:00.000Z',
      'nemia resume',
      'nemia pause --now',
    );
    assert.deepEqual(readPause(ROOT), put);
    assert.deepEqual(resumePause(ROOT), put);
    assert.equal(readPause(ROOT), null);
    refusedAs(() => resumePause(ROOT), 'Missing', 'not paused', 'nemia pause');
  });
  await t.test('a pause put with no name is put by the machine user, and with no words has no why', () => {
    const put = putPause(ROOT, {});
    assert.equal(typeof put.by, 'string');
    assert.ok(put.by.length > 0);
    assert.equal('why' in put, false);
    resumePause(ROOT);
  });
  await t.test('a pause file that does not read as one still pauses the store, its fields empty', () => {
    for (const text of ['not json', '[1, 2]', '{"at": 3, "by": ["x"]}']) {
      fs.writeFileSync(pauseFile(ROOT), text);
      assert.deepEqual(readPause(ROOT), { at: '', by: '' }, text);
      assert.deepEqual(resumePause(ROOT), { at: '', by: '' });
    }
  });
  await t.test('a cordon put before the switch is the pause: read, refused a second, unschedulable to the runtime, and resumed', () => {
    const cordon = { at: '2026-10-03T08:00:00.000Z', by: 'ann', why: 'merging by hand' };
    fs.writeFileSync(path.join(ROOT, 'cordon'), `${JSON.stringify(cordon)}\n`);
    assert.deepEqual(readPause(ROOT), cordon);
    assert.equal(storeAdmission(ROOT, settingsOf(ENV)).unschedulable(), true, 'the runtime admits nothing under it');
    refusedAs(() => putPause(ROOT, { by: 'bob' }), 'Conflict', 'already paused', 'ann', cordon.at, 'nemia resume', 'nemia pause --now');
    assert.deepEqual(resumePause(ROOT), cordon);
    assert.equal(fs.existsSync(path.join(ROOT, 'cordon')), false, 'nemia resume removes it');
    assert.equal(storeAdmission(ROOT, settingsOf(ENV)).unschedulable(), false);
  });
  await t.test('a pause put with a timeout keeps it on its file; an old file of `{at, by}` has none', () => {
    const put = putPause(ROOT, { by: 'ann' }, new Date('2026-10-04T12:00:00.000Z'), 900_000);
    assert.deepEqual(put, { at: '2026-10-04T12:00:00.000Z', by: 'ann', timeoutMs: 900_000 });
    assert.deepEqual(readPause(ROOT), put);
    resumePause(ROOT);
    fs.writeFileSync(pauseFile(ROOT), `${JSON.stringify({ at: '2026-10-03T08:00:00.000Z', by: 'ann' })}\n`);
    assert.deepEqual(readPause(ROOT), { at: '2026-10-03T08:00:00.000Z', by: 'ann' }, 'no timeout: the pause parks nothing');
    fs.writeFileSync(pauseFile(ROOT), `${JSON.stringify({ at: '2026-10-03T08:00:00.000Z', by: 'ann', timeoutMs: 'ten' })}\n`);
    assert.deepEqual(readPause(ROOT), { at: '2026-10-03T08:00:00.000Z', by: 'ann' }, 'a timeout that is no count of milliseconds is none');
    resumePause(ROOT);
  });
  await t.test('cutPause sets the timeout to 0, keeping when, by whom and why; with no pause it is refused', () => {
    putPause(ROOT, { by: 'ann', why: 'the bill' }, new Date('2026-10-04T12:00:00.000Z'), 600_000);
    assert.deepEqual(cutPause(ROOT), { at: '2026-10-04T12:00:00.000Z', by: 'ann', why: 'the bill', timeoutMs: 0 });
    assert.deepEqual(readPause(ROOT), { at: '2026-10-04T12:00:00.000Z', by: 'ann', why: 'the bill', timeoutMs: 0 });
    resumePause(ROOT);
    refusedAs(() => cutPause(ROOT), 'Missing', 'nemia pause');
  });
  await t.test(
    'a pause put by a caller keeps its `by` and, beside it, who put it, through a cut; one that names no actor reads with none',
    () => {
      const actor = { kind: 'agent', agent: 'operator', token: 'ops' } as const;
      const put = putPause(ROOT, { by: 'ann', actor }, new Date('2026-10-04T12:00:00.000Z'));
      assert.deepEqual(put, { at: '2026-10-04T12:00:00.000Z', by: 'ann', actor });
      assert.deepEqual(readPause(ROOT), put);
      assert.deepEqual(cutPause(ROOT), { ...put, timeoutMs: 0 }, 'a cut keeps who put it');
      resumePause(ROOT);
      fs.writeFileSync(pauseFile(ROOT), `${JSON.stringify({ at: '2026-10-03T08:00:00.000Z', by: 'ann', actor: { kind: 'robot' } })}\n`);
      assert.deepEqual(
        readPause(ROOT),
        { at: '2026-10-03T08:00:00.000Z', by: 'ann' },
        'an actor that does not read is none, the pause stands',
      );
      resumePause(ROOT);
    },
  );
});

test("the engine's ceiling is the store's sessions per pool, and none at all where the setting is refused", () => {
  const root = scratch('wf-ceiling-');
  assert.equal(storeAdmission(root, settingsOf({ WF_MAX_CONCURRENT: '3' })).maxConcurrent, 3);
  assert.equal('maxConcurrent' in storeAdmission(root, settingsOf({ WF_MAX_CONCURRENT: 'many' })), false);
});

/** A process no machine runs: the holder each walked pause names, so a lapse is seen of it. */
const HOLDER = { pid: 2 ** 22 + 1 };

/** A store brought to each mode, by the store's own verbs. */
const ARRANGED: Readonly<Record<PauseMode, (home: string) => void>> = {
  none: () => {},
  holding: (home) => void putPause(home, {}, new Date(), undefined, HOLDER),
  draining: (home) => void putPause(home, {}, new Date(), 60_000, HOLDER),
  cut: (home) => void putPause(home, {}, new Date(), 0, HOLDER),
};

/** Each event as the store's verbs bring it; a lapse is the pass's lift of a pause whose holder the process table says is gone. */
const BROUGHT: Readonly<Record<PauseEvent, (home: string) => unknown>> = {
  put: (home) => putPause(home, {}, new Date()),
  'put-timeout': (home) => putPause(home, {}, new Date(), 60_000),
  'put-now': (home) => putPause(home, {}, new Date(), 0),
  cut: (home) => cutPause(home),
  resume: (home) => resumePause(home),
  lapse: (home) => liftLapsedPause(home, () => 'gone'),
};

test('the store writes the moves its machine makes and no other: each event in each mode leaves the file where pauseMove says, or is refused as it says', async (t) => {
  for (const from of PAUSE_MODES)
    for (const event of Object.keys(PAUSE_EVENTS) as PauseEvent[])
      await t.test(`${event} on a store in ${from}`, () => {
        const home = scratch('wf-pause-walk-');
        ARRANGED[from](home);
        assert.equal(modeAt(home), from, 'the store stands in the mode arranged');
        const move = pauseMove(from, event);
        if (move.kind === 'refused') {
          assert.throws(
            () => BROUGHT[event](home),
            (err: Error & { _tag?: string }) => err._tag === move.as,
          );
          assert.equal(modeAt(home), from, 'a refused move writes nothing');
          return;
        }
        BROUGHT[event](home);
        assert.equal(modeAt(home), move.kind === 'edge' ? move.to : from);
      });
});

/** The files among `sources`, each a path and its text, that name the pause's file and are not the store's own. */
const namesTheFile = (sources: ReadonlyMap<string, string>): string[] =>
  [...sources]
    .filter(([file, text]) => file !== 'pause/pause.store.ts' && /\bpauseFile\(|\bresumedFile\(/.test(text))
    .map(([file]) => file);

test("no file of src but the store's own names the pause's file, so nothing else can write it; REFUSED: a verb planted that does", () => {
  const src = path.join(import.meta.dirname, '..');
  const sources = new Map(
    fs
      .readdirSync(src, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
      .map((file) => [file.split(path.sep).join('/'), fs.readFileSync(path.join(src, file), 'utf8')] as const),
  );
  assert.ok(sources.has('pause/pause.store.ts'), 'the store is among the files read');
  assert.deepEqual(namesTheFile(sources), []);
  const planted = new Map([...sources, ['pause/eager.verb.ts', 'fs.rmSync(pauseFile(home));'] as const]);
  assert.deepEqual(namesTheFile(planted), ['pause/eager.verb.ts']);
});
