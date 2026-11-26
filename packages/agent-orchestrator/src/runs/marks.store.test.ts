/**
 * A run's markers as records of the keyspace: the files a store kept of them before are imported once, each moved under `imported/` and
 * never deleted, and those that do not read stay where they are; a guarded write is one transaction; a marker moves its run's stamp
 * alone; a run's id is taken by any marker of it.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { RunDoor, runDoorKeyspace } from './runs.store.ts';
import { RunId } from '../record/record.model.ts';
import type { Run } from '../record/record.ts';
import { act, doorFrom } from '../../test/door-walks.ts';
import { aRun } from '../../test/run-walks.ts';
import { forgettingKey, keysUnder, markerKeys, markerText, plantMarker, plantRecord, runKey, runMarksPrefix } from '../../testing.ts';

const at = '2026-11-26T09:00:00.000Z';
const idOf = (id: string) => RunId.read(id) satisfies RunId;

/** A store of its own with the run `id` made through the door. */
const stored = (id: string) => {
  const root = scratch('wf-marks-');
  const door = doorFrom(RunDoor, runDoorKeyspace(root));
  act(door.runs.create(aRun(id)));
  return { root, door };
};

/** Every file under `dir`, relative to it, sorted. */
const filesUnder = (dir: string) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => path.relative(dir, path.join(e.parentPath, e.name)))
        .sort()
    : [];

/** `text` written as the file `rel` under `root`. */
const planted = (root: string, rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};

describe("a store's marker files imported into its keyspace once, moved aside and never deleted", () => {
  test('each marker file reads back through the door as the file answered, and moves under imported/', () => {
    const { root, door } = stored('m-run');
    planted(root, 'runs/m-run.cancelled', JSON.stringify({ at, actor: { kind: 'person', token: 'laptop' } }));
    planted(root, 'runs/m-run.pruned', JSON.stringify({ at, worktrees: [] }));
    planted(root, 'runs/m-run.hold', JSON.stringify({ at, until: ['m-other'], why: 'wait' }));
    planted(root, 'runs/m-run.unheld', JSON.stringify({ since: at, actor: { kind: 'person', token: 'laptop' } }));
    planted(root, 'runs/m-run.labels', JSON.stringify({ team: 'core' }));
    planted(root, 'runs/m-run.refresh', JSON.stringify({ at }));
    planted(root, 'runs/m-run.said/1.json', JSON.stringify({ step: 'implement', at, text: 'widen it' }));
    planted(root, 'forgetting/m-gone.json', JSON.stringify({ run: 'm-gone', taskIds: ['t-1'] }));
    const run = act(door.runs.read(idOf('m-run'))) as Run;
    assert.equal(run.cancelledAt, at);
    assert.deepEqual(run.cancelledBy, { kind: 'person', token: 'laptop' });
    assert.deepEqual(run.pruned, { at, worktrees: [] });
    assert.deepEqual(run.hold?.until, ['m-other']);
    assert.ok(run.unheld);
    assert.deepEqual(run.labels, { team: 'core' });
    assert.deepEqual(run.saidBefore?.implement, [{ at, text: 'widen it' }]);
    assert.equal(act(door.refresh.stands(idOf('m-run'))), true);
    assert.deepEqual(act(door.forgetting.read(idOf('m-gone'))), ['t-1']);
    assert.deepEqual(act(door.forgetting.list()), ['m-gone']);
    assert.deepEqual(filesUnder(path.join(root, 'runs')), []);
    assert.deepEqual(filesUnder(path.join(root, 'imported')), [
      'forgetting/m-gone.json',
      'runs/m-run.cancelled',
      'runs/m-run.hold',
      'runs/m-run.labels',
      'runs/m-run.pruned',
      'runs/m-run.refresh',
      'runs/m-run.said/1.json',
      'runs/m-run.unheld',
    ]);
  });
  test('a cancellation written as a bare time reads as its time and no actor', () => {
    const { root, door } = stored('m-bare');
    planted(root, 'runs/m-bare.cancelled', `${at}\n`);
    const run = act(door.runs.read(idOf('m-bare'))) as { cancelledAt?: string; cancelledBy?: unknown };
    assert.deepEqual([run.cancelledAt, run.cancelledBy], [at, undefined]);
  });
  test('REFUSED: a labels file that is no object of strings, a word that is no `{ step, at, text }`, a marker naming another run and a stray stay where they are', () => {
    const { root, door } = stored('m-bad');
    planted(root, 'runs/m-bad.labels', '["team"]');
    planted(root, 'runs/m-bad.said/1.json', '{"text": 1}');
    planted(root, 'forgetting/m-bad.json', JSON.stringify({ run: 'another', taskIds: [] }));
    planted(root, 'runs/m-bad.other', 'a file nothing reads');
    const run = act(door.runs.read(idOf('m-bad'))) as { labels?: unknown; saidBefore?: unknown };
    assert.deepEqual([run.labels, run.saidBefore], [undefined, undefined]);
    assert.deepEqual(act(door.forgetting.list()), []);
    assert.deepEqual(filesUnder(path.join(root, 'runs')), ['m-bad.labels', 'm-bad.other', 'm-bad.said/1.json']);
    assert.deepEqual(filesUnder(path.join(root, 'forgetting')), ['m-bad.json']);
    assert.deepEqual(keysUnder(root, runMarksPrefix('m-bad')), []);
  });
  test('a file dropped after the first import is imported at the next open, and one already imported is not made again', () => {
    const { root, door } = stored('m-late');
    act(door.runs.read(idOf('m-late')));
    planted(root, 'runs/m-late.hold', JSON.stringify({ at, until: [] }));
    assert.equal(act(door.holds.stands(idOf('m-late'))), true);
    planted(root, 'runs/m-late.hold', JSON.stringify({ at: '2020-01-01T00:00:00.000Z', until: ['x'] }));
    assert.deepEqual((act(door.runs.read(idOf('m-late'))) as { hold?: { until: string[] } }).hold?.until, []);
  });
});

describe('a guarded write is one transaction', () => {
  test('two cancels at once keep the first time, two holds put at once leave one, and two words said take 1 and 2', () => {
    const { root, door } = stored('m-race');
    const [a, b] = act(Effect.all([door.runs.cancel(idOf('m-race')), door.runs.cancel(idOf('m-race'))], { concurrency: 'unbounded' })) as [
      string,
      string,
    ];
    assert.equal(a, b);
    const holds = act(
      Effect.all([door.holds.put(idOf('m-race'), ['x'], {}), door.holds.put(idOf('m-race'), ['y'], {})], { concurrency: 'unbounded' }),
    ) as unknown[];
    assert.equal(holds.filter((h) => h !== null).length, 1);
    act(
      Effect.all([door.said.put(idOf('m-race'), 'implement', 'one'), door.said.put(idOf('m-race'), 'implement', 'two')], {
        concurrency: 'unbounded',
      }),
    );
    assert.deepEqual(markerKeys(root, 'm-race'), ['cancelled', 'hold', 'said/1', 'said/2']);
  });
  test('a hold lifted by a person writes who, and the hold is gone', () => {
    const { root, door } = stored('m-lift');
    const hold = act(door.holds.put(idOf('m-lift'), [], {})) as { at: string };
    assert.equal(act(door.holds.lift(idOf('m-lift'), hold.at, { kind: 'person', token: 'laptop' })), true);
    assert.deepEqual(markerKeys(root, 'm-lift'), ['unheld']);
  });
});

describe("a run's stamp and the ids it takes", () => {
  test("a marker written for a run moves that run's stamp and no other's, and removed moves it again", () => {
    const { door } = stored('m-stamp-a');
    act(door.runs.create(aRun('m-stamp-b')));
    const stamps = () => act(door.runs.stamps()) as Map<string, string>;
    const before = stamps();
    act(door.labels.put(idOf('m-stamp-a'), { team: 'core' }));
    const written = stamps();
    assert.notEqual(written.get('m-stamp-a'), before.get('m-stamp-a'));
    assert.equal(written.get('m-stamp-b'), before.get('m-stamp-b'));
    act(door.labels.put(idOf('m-stamp-a'), {}));
    assert.notEqual(stamps().get('m-stamp-a'), written.get('m-stamp-a'));
  });
  test('a new run is refused an id only a marker, only a forgetting marker or only a directory holds', () => {
    const root = scratch('wf-marks-taken-');
    const door = doorFrom(RunDoor, runDoorKeyspace(root));
    plantMarker(root, 't-marker', 'refresh', '{}');
    plantRecord(root, forgettingKey('t-forgetting'), JSON.stringify({ run: 't-forgetting', taskIds: [] }));
    fs.mkdirSync(path.join(root, 'runs', 't-dir'), { recursive: true });
    for (const id of ['t-marker', 't-forgetting', 't-dir']) assert.equal(act(door.runs.taken(idOf(id))), true, id);
    assert.equal(act(door.runs.taken(idOf('t-free'))), false);
    assert.equal(markerText(root, 't-marker', 'refresh'), '{}');
    assert.equal(runKey('t-free').endsWith('t-free'), true);
  });
});
