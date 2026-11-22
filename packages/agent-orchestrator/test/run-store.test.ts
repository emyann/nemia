/**
 * The run store's interface (`RunStore`, `src/record/record.ts`), held to what its keyspace implementation answers (`runDoorKeyspace`,
 * `src/runs/records.store.ts`): a record made with its card's claim in one transaction, read with a person's files composed onto it,
 * written back with none of them, refused once it is gone; whether a run is there and whether a person called it off; the stamps a pass
 * compares, and the asks it reads, settles and answers from, each a record at its key; and the tick asking it, before each filing,
 * whether a person called the run off since (`mayFileOf`). And a person's writes: an ask of each kind at its key, never over a record
 * there, a hold standing while its file does, a run forgotten key by key and file by file. And the import of a store's run files, once,
 * moved aside under `<root>/imported/` and never deleted. And what `nemia rm` and `nemia prune --artifacts` read of it.
 *
 * And the refusals that keep the interface the one way in: a file of `src` but the store's own that imports a run's or a person's file
 * functions from `record.store.ts`, or through `runner.ts`, and a read of runs past the door a program is given. The store is the
 * file's own, at `ROOT`.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { seamUses, sourcesUnder } from 'test-kit/debt';
import type { Run } from '../src/run.ts';
import type { PersonRequest } from '../src/record/record.ts';
import { scratch } from 'test-kit/scratch';
import { RunDoor, runDoorKeyspace } from '../src/runs/runs.store.ts';
import { runsImported } from '../src/runs/records.store.ts';
import { keyspaceAt, keyspaceFile, RECORD_CEILING } from '../src/keyspace/keyspace.store.ts';
import { StoreRoot } from '../src/config/root.store.ts';
import { act, doorFrom, walksOn } from './door-walks.ts';
import { RUN_WALKS, aRun } from './run-walks.ts';
import { RunId } from '../src/record/record.model.ts';
import { mayFileOf } from '../src/tick/advance.verb.ts';
import { resumePause, putPause } from '../src/pause/pause.store.ts';
import {
  acceptanceIn,
  approvalIn,
  askIn,
  holdFile,
  markCancelled,
  pruneFile,
  roundAskIn,
  runsDir,
  writeHold,
} from '../src/record/record.store.ts';
import { askKey, asksPrefix, claimKey, keysUnder, plantRecord, recordText, runFilesImported, runKey, runsNow } from '../testing.ts';

const ROOT = scratch('wf-run-store-');
const store = runsNow(ROOT);
const PKG = path.join(import.meta.dirname, '..');
const at = '2026-09-30T09:00:00.000Z';

/** A run made in the store under `id`. */
const made = (id: string) => {
  const run = aRun(id);
  store.runs.create(run);
  return run satisfies Run;
};

/** A prune marker, as `nemia prune` writes one. */
const pruned = (id: string) => fs.writeFileSync(pruneFile(ROOT, id), JSON.stringify({ at, worktrees: [] }, null, 2));

/** The record at the run's key, read as JSON. */
const stored = (id: string) => JSON.parse(recordText(ROOT, runKey(id)) ?? 'null') as Record<string, unknown> | null;

/** The Run door over the keyspace of this file's store. */
const door = doorFrom(RunDoor, runDoorKeyspace(ROOT));

/** `program` run at once at the store `ROOT`. */
const atRoot = <A, E>(program: Effect.Effect<A, E, StoreRoot>) => Effect.runSync(Effect.provideService(program, StoreRoot, ROOT));

for (const [name, body] of walksOn(RUN_WALKS, () => ({ door, root: ROOT, layer: 'keyspace' }))) test(name, body);

test('a record of an older shape reads through the door as the one Run type, and is written back with nothing refused or lost', () => {
  const id = 'r-older-shape';
  const older = {
    ...aRun(id),
    steps: {
      implement: { taskId: `${id}-implement-try2`, tries: [{ taskId: `${id}-implement`, then: 'retries' }], workspace: '/w/implement' },
      review: { taskId: null },
    },
    gatesTimed: [{ step: 'implement', try: 1 }],
    deniedCounted: [{ task: `${id}-implement`, attempts: 2 }],
    settlesCounted: [`${id}-implement`],
    runTimed: true,
    slotHeldAt: '2026-09-01T00:01:00.000Z',
    keyNobodyNames: 'kept as it was',
  };
  plantRecord(ROOT, runKey(id), JSON.stringify(older));
  const read = act(door.runs.read(RunId.read(id)));
  assert.ok(!('refused' in read), 'an older record reads');
  assert.equal(read.steps.implement?.tries?.[0]?.cause, 'retries', "a try's former `then` is read as its cause");
  assert.deepEqual(read.gatesTimed, older.gatesTimed, 'a counter of the tick reads as the model names it');
  assert.equal(act(door.runs.rewrite(read)), true, 'and is written back through the model with nothing refused');
  assert.equal(stored(id)?.keyNobodyNames, 'kept as it was');
});

describe('a record in the store, read and written back through the door: what it holds is what it held', () => {
  test('a record stored under an id runId would not mint still reads through the door, and is written back (RunId on read is nominal)', () => {
    const id = 'Old_Id';
    plantRecord(ROOT, runKey(id), JSON.stringify(aRun(id)));
    const read = act(door.runs.read(RunId.read(id)));
    assert.ok(!('refused' in read), 'a stored id is read as it is');
    assert.equal(act(door.runs.rewrite(read)), true);
  });
  test('a new run at an id with a record is refused before a byte of the first is written over', () => {
    const run = made('r-exclusive');
    const text = recordText(ROOT, runKey(run.id));
    assert.deepEqual(act(door.runs.create({ ...run, brief: 'another' })), { refused: 'Conflict' });
    assert.equal(recordText(ROOT, runKey(run.id)), text);
  });
  test('a record read and written back moves no byte, a key no nemia writes included', () => {
    const id = 'r-bytes';
    made(id);
    store.runs.rewrite({ ...store.runs.read(id), laterKey: { kept: [1, 2] } } as unknown as Run);
    const text = recordText(ROOT, runKey(id));
    assert.equal(store.runs.rewrite(store.runs.read(id)), true);
    assert.equal(recordText(ROOT, runKey(id)), text);
    assert.deepEqual(stored(id)?.laterKey, { kept: [1, 2] });
  });
  test('a record that is not JSON is left out of the list and said, and the other runs are listed', () => {
    made('r-listed');
    plantRecord(ROOT, runKey('r-not-json'), '{ not json');
    const said: string[] = [];
    try {
      const ids = store.runs.list((line) => said.push(line)).map((run) => run.id);
      assert.ok(ids.includes('r-listed'));
      assert.equal(ids.includes('r-not-json'), false);
      assert.equal(said.length, 1);
      assert.match(said[0], /r-not-json/);
    } finally {
      store.runs.forget('r-not-json');
    }
  });
  test("a person's files are composed onto the run read, and never written into its record", () => {
    const run = made('r-composed');
    markCancelled(ROOT, run.id);
    writeHold(ROOT, run.id, ['other-run']);
    const read = store.runs.read(run.id);
    assert.ok(read.cancelledAt && read.hold);
    assert.equal(store.runs.rewrite(read), true);
    const written = stored(run.id);
    assert.equal(written && ('cancelledAt' in written || 'hold' in written), false);
  });
});

describe('whether a person called a run off: a pause, a hold and a record gone, as the store and the tick each read it', () => {
  test('every run is called off while the store is paused, and none once the pause is lifted', () => {
    const run = made('r-paused');
    putPause(ROOT, { by: 'ann' });
    try {
      assert.equal(store.runs.calledOff(run.id), true);
    } finally {
      resumePause(ROOT);
    }
    assert.equal(store.runs.calledOff(run.id), false);
  });
  test("the store's pause is composed onto every run read and listed, and written back into none", () => {
    const run = made('r-pause-read');
    const pause = putPause(ROOT, { why: 'merging by hand', by: 'ann' });
    try {
      const read = store.runs.read(run.id);
      assert.deepEqual(read.pause, pause);
      assert.deepEqual(store.runs.list().find((r) => r.id === run.id)?.pause, pause);
      assert.equal(store.runs.rewrite(read), true);
      assert.equal('pause' in (stored(run.id) ?? {}), false, 'the pause is written into the record');
    } finally {
      resumePause(ROOT);
    }
    assert.equal('pause' in store.runs.read(run.id), false, 'lifted, no run reads it');
  });
  test('a pass files for a run until a person holds it, and not again in that pass once the hold is lifted', () => {
    const run = made('r-may-file');
    const mayFile = mayFileOf(run);
    assert.equal(atRoot(mayFile), true);
    const hold = writeHold(ROOT, run.id, ['other-run']);
    assert.ok(hold);
    assert.equal(atRoot(mayFile), false);
    assert.equal(store.holds.lift(run.id, hold.at), true);
    assert.equal(atRoot(mayFile), false);
    assert.equal(atRoot(mayFileOf(run)), true);
  });
  test('a pass files nothing for a run whose record is gone', () => {
    const run = made('r-may-file-gone');
    store.runs.forget(run.id);
    assert.equal(atRoot(mayFileOf(run)), false);
  });
});

/** One ask of each kind a person writes, with the key the tick reads it at and its reader's words for a record there that is not one. */
const asksOfEachKind = (id: string) => {
  const made: Array<{ asked: PersonRequest; key: string; stray: (text: string) => unknown }> = [
    {
      asked: { kind: 'retry', of: 'try', ask: { step: 'implement', try: 2, mode: 'fresh', message: 'again', at } },
      key: askKey(id, { of: 'try', step: 'implement', n: 2 }),
      stray: (text) => askIn(text, 'implement', 2),
    },
    {
      asked: { kind: 'retry', of: 'round', ask: { step: 'review', round: 3, at } },
      key: askKey(id, { of: 'round', step: 'review', n: 3 }),
      stray: (text) => roundAskIn(text, 'review', 3),
    },
    {
      asked: { kind: 'approve', of: 'gate', ask: { step: 'implement', try: 1, at, message: 'yes' } },
      key: askKey(id, { of: 'gate', step: 'implement', n: 1 }),
      stray: (text) => approvalIn(text, 'implement', 1),
    },
    {
      asked: { kind: 'approve', of: 'loop', ask: { step: 'review', try: 1, at, message: 'good enough' } },
      key: askKey(id, { of: 'loop', step: 'review', n: 1 }),
      stray: (text) => acceptanceIn(text, 'review', 1),
    },
  ];
  return made;
};

test('an ask of each kind is written at the key the tick reads it by, holding the ask alone, and answered where it is', () => {
  const run = made('r-write-asks');
  for (const { asked, key } of asksOfEachKind(run.id)) {
    const n = asked.of === 'round' ? asked.ask.round : asked.of === 'base' ? asked.ask.merge.try : asked.ask.try;
    assert.equal(store.asks.where(run.id, { of: asked.of, step: asked.ask.step, n }), key);
    assert.deepEqual(store.asks.write(run.id, asked), { written: true, where: key });
    assert.deepEqual(JSON.parse(recordText(ROOT, key) ?? ''), asked.ask, `${asked.of} is written as the ask alone`);
  }
  const read = store.asks.read(run.id);
  assert.equal(read.asks.length, 1);
  assert.equal(read.rounds.length, 1);
  assert.deepEqual(read.notes, []);
  assert.equal(store.runs.read(run.id).approvals?.length, 1, 'an approval is composed onto the run read');
});

test('a merge ask is written at its target and try, holding its loop, round, base and commit, and read back as a round ask of its loop', () => {
  const run = made('r-write-merge');
  const merge = { target: 'implement', try: 3, onto: 'main', sha: 'a'.repeat(40) };
  const key = store.asks.where(run.id, { of: 'base', step: 'implement', n: 3 });
  assert.equal(key, `${asksPrefix(run.id)}merge-implement-3`);
  assert.deepEqual(store.asks.write(run.id, { kind: 'refresh', of: 'base', ask: { step: 'review', round: 2, at, merge } }), {
    written: true,
    where: key,
  });
  assert.deepEqual(JSON.parse(recordText(ROOT, key) ?? ''), { loop: 'review', round: 2, onto: 'main', sha: 'a'.repeat(40), at });
  assert.deepEqual(store.asks.read(run.id).rounds, [{ step: 'review', round: 2, at, merge }]);
});

test("an ask written where a record that is not one stands is refused with the tick's words for it, and leaves it as it was", () => {
  const run = made('r-write-stray');
  for (const { asked, key, stray } of asksOfEachKind(run.id)) {
    plantRecord(ROOT, key, 'not json');
    const words = stray('not json');
    assert.equal(typeof words, 'string');
    assert.deepEqual(store.asks.write(run.id, asked), { written: false, where: key, stray: words });
    assert.equal(recordText(ROOT, key), 'not json');
  }
});

test('a hold file stands while it is there, read as a hold or not, and not once it is gone', () => {
  const run = made('r-stands');
  assert.equal(store.holds.stands(run.id), false);
  fs.writeFileSync(holdFile(ROOT, run.id), 'not json');
  assert.equal(store.holds.stands(run.id), true);
  fs.rmSync(holdFile(ROOT, run.id));
  assert.equal(store.holds.stands(run.id), false);
});

test("a run forgotten loses its record, its claim and its asks, key by key, then every person's file and its directory; another run keeps its own", () => {
  const run = { ...aRun('r-forget'), from: { inbox: 'c-forget' } } satisfies Run;
  store.runs.create(run);
  const other = made('r-forget-other');
  for (const id of [run.id, other.id]) {
    store.holds.put(id, ['x'], {});
    store.runs.cancel(id);
    pruned(id);
    store.asks.write(id, { kind: 'approve', of: 'gate', ask: { step: 'implement', try: 1, at } });
    fs.mkdirSync(path.join(runsDir(ROOT), id, 'artifacts'), { recursive: true });
    fs.writeFileSync(path.join(runsDir(ROOT), id, 'artifacts', 'x'), 'x');
  }
  assert.deepEqual(store.runs.forget(run.id), [
    runKey(run.id),
    claimKey('c-forget'),
    askKey(run.id, { of: 'gate', step: 'implement', n: 1 }),
    `runs/${run.id}.cancelled`,
    `runs/${run.id}.pruned`,
    `runs/${run.id}.hold`,
    `runs/${run.id}/`,
  ]);
  assert.deepEqual(keysUnder(ROOT, asksPrefix(run.id)), []);
  assert.deepEqual(
    fs.readdirSync(runsDir(ROOT)).filter((name) => name === run.id || name.startsWith(`${run.id}.`)),
    [],
  );
  assert.equal(store.runs.exists(other.id), true);
  const kept = store.runs.read(other.id);
  assert.ok(kept.cancelledAt && kept.pruned && kept.hold && kept.approvals);
  assert.equal(fs.existsSync(path.join(runsDir(ROOT), other.id, 'artifacts', 'x')), true);
  assert.deepEqual(store.runs.forget(run.id), []);
});

describe("a run's stamp: what a pass compares to know a run moved", () => {
  test('its record written moves it, an ask written moves it, a marker moves it, and the pause does not', () => {
    const run = made('r-stamp');
    const stamp = () => store.runs.stamps().get(run.id);
    const first = stamp();
    assert.ok(first);
    store.runs.rewrite({ ...store.runs.read(run.id), brief: 'again' });
    const second = stamp();
    assert.notEqual(second, first);
    store.asks.write(run.id, { kind: 'approve', of: 'gate', ask: { step: 'implement', try: 1, at } });
    const third = stamp();
    assert.notEqual(third, second);
    markCancelled(ROOT, run.id);
    const fourth = stamp();
    assert.notEqual(fourth, third);
    putPause(ROOT, { by: 'ann' });
    try {
      assert.equal(stamp(), fourth);
    } finally {
      resumePause(ROOT);
    }
  });
  test('a run forgotten has no stamp', () => {
    const run = made('r-stamp-gone');
    store.runs.forget(run.id);
    assert.equal(store.runs.stamps().has(run.id), false);
  });
});

/** A run under `id` started out of the inbox's card `card`. */
const fromCard = (id: string, card: string) => ({ ...aRun(id), from: { inbox: card } }) satisfies Run;

describe("a card's claim: a record at /registry/claims/<card>, written with its run in one transaction", () => {
  test('a run from a card writes its claim naming it, and no listing of runs, taken id or stamp reads it', () => {
    act(door.runs.create(fromCard('c-unread-run', 'c-unread')));
    assert.deepEqual(JSON.parse(recordText(ROOT, claimKey('c-unread')) ?? ''), { run: 'c-unread-run' });
    assert.deepEqual(
      {
        listed: store.runs.list(() => {}).some((r) => r.id === 'c-unread'),
        ids: store.runs.ids().includes('c-unread'),
        stamped: store.runs.stamps().has('c-unread'),
        taken: store.runs.taken('c-unread'),
      },
      { listed: false, ids: false, stamped: false, taken: false },
    );
  });
  test('REFUSED: the loser of a card leaves no record under its id, and the claim names the first run', () => {
    act(door.runs.create(fromCard('c-won', 'c-twice')));
    assert.deepEqual(act(door.runs.create(fromCard('c-lost', 'c-twice'))), { refused: 'Conflict' });
    assert.equal(recordText(ROOT, runKey('c-lost')), undefined);
    assert.equal(fs.existsSync(path.join(runsDir(ROOT), 'c-lost')), false);
    assert.deepEqual(JSON.parse(recordText(ROOT, claimKey('c-twice')) ?? ''), { run: 'c-won' });
  });
  test('a run forgotten takes its claim with it, so its card starts again', () => {
    act(door.runs.create(fromCard('c-again-1', 'c-again')));
    store.runs.forget('c-again-1');
    assert.equal(recordText(ROOT, claimKey('c-again')), undefined);
    assert.equal(act(door.runs.create(fromCard('c-again-2', 'c-again'))), undefined);
  });
});

/** A store of its own with run files planted as a store before the keyspace keeps them. */
const planted = () => {
  const root = scratch('run-import-');
  fs.mkdirSync(path.join(root, 'runs', 'i-run.asks', 'done'), { recursive: true });
  fs.writeFileSync(path.join(root, 'runs', 'i-run.json'), JSON.stringify(fromCard('i-run', 'i-card'), null, 2));
  fs.writeFileSync(path.join(root, 'runs', 'i-run.asks', 'approve-implement-1'), JSON.stringify({ step: 'implement', try: 1, at }));
  fs.writeFileSync(path.join(root, 'runs', 'i-run.asks', 'done', 'retry-implement-1'), JSON.stringify({ at }));
  fs.writeFileSync(path.join(root, 'runs', 'i-run.cancelled'), JSON.stringify({ at }));
  fs.mkdirSync(path.join(root, 'started'), { recursive: true });
  fs.writeFileSync(path.join(root, 'started', 'i-card.json'), JSON.stringify({ run: 'i-run' }));
  return root;
};

/** The import of the store `root` run at once: how many records it made, or `{ refused }`. */
const imported = (root: string) => act(Effect.flatMap(keyspaceAt(keyspaceFile(root)), (keyspace) => runsImported(root, keyspace)));

/** Every file under `dir`, relative to it, sorted. */
const filesUnder = (dir: string) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile())
        .map((e) => path.relative(dir, path.join(e.parentPath, e.name)))
        .sort()
    : [];

describe("a store's run files imported into its keyspace once, moved aside under imported/ and never deleted", () => {
  test("a run's record, its asks and its claim become records at their keys, and each file is moved aside; a person's marker stays", () => {
    const root = planted();
    assert.equal(imported(root), 4);
    assert.equal(JSON.parse(recordText(root, runKey('i-run')) ?? '{}').id, 'i-run');
    assert.deepEqual(keysUnder(root, asksPrefix('i-run')), [
      `${asksPrefix('i-run')}approve-implement-1`,
      `${asksPrefix('i-run')}done/retry-implement-1`,
    ]);
    assert.deepEqual(JSON.parse(recordText(root, claimKey('i-card')) ?? '{}'), { run: 'i-run' });
    assert.deepEqual(filesUnder(path.join(root, 'imported')), [
      'runs/i-run.asks/approve-implement-1',
      'runs/i-run.asks/done/retry-implement-1',
      'runs/i-run.json',
      'started/i-card.json',
    ]);
    assert.deepEqual(filesUnder(path.join(root, 'runs')), ['i-run.cancelled']);
    assert.ok(runsNow(root).runs.read('i-run').cancelledAt, 'the marker still composes onto the record');
  });
  test('imported again, nothing is left to import, and nothing moves', () => {
    const root = planted();
    imported(root);
    assert.equal(imported(root), 0);
  });
  test('a claim whose run is gone, or whose run was started from another card, is stale: moved aside, and no record', () => {
    const root = planted();
    fs.writeFileSync(path.join(root, 'started', 'i-gone.json'), JSON.stringify({ run: 'i-nobody' }));
    fs.writeFileSync(path.join(root, 'started', 'i-other.json'), JSON.stringify({ run: 'i-run' }));
    assert.equal(imported(root), 4);
    assert.equal(recordText(root, claimKey('i-gone')), undefined);
    assert.equal(recordText(root, claimKey('i-other')), undefined);
    assert.ok(fs.existsSync(path.join(root, 'imported', 'started', 'i-gone.json')));
    assert.ok(fs.existsSync(path.join(root, 'imported', 'started', 'i-other.json')));
  });
  test('REFUSED: a record larger than the keyspace holds stops the import whole, and nothing is moved', () => {
    const root = planted();
    fs.writeFileSync(path.join(root, 'runs', 'i-huge.json'), JSON.stringify({ ...aRun('i-huge'), brief: 'x'.repeat(RECORD_CEILING) }));
    assert.deepEqual(imported(root), { refused: 'Invalid' });
    assert.equal(fs.existsSync(path.join(root, 'imported')), false);
    assert.equal(recordText(root, runKey('i-run')), undefined);
  });
  test('a key the keyspace already holds is never written over, and the file is still moved aside', () => {
    const root = planted();
    act(
      Effect.flatMap(keyspaceAt(keyspaceFile(root)), (keyspace) =>
        keyspace.write(runKey('i-run'), {
          verb: 'create',
          expected: null,
          value: JSON.stringify({ ...fromCard('i-run', 'i-card'), brief: 'kept' }),
        }),
      ),
    );
    imported(root);
    assert.equal(JSON.parse(recordText(root, runKey('i-run')) ?? '{}').brief, 'kept');
    assert.ok(fs.existsSync(path.join(root, 'imported', 'runs', 'i-run.json')));
  });
  test('a file moved aside never lands over one moved before it', () => {
    const root = planted();
    imported(root);
    fs.writeFileSync(path.join(root, 'runs', 'i-run.json'), JSON.stringify(fromCard('i-run', 'i-card')));
    imported(root);
    assert.deepEqual(
      filesUnder(path.join(root, 'imported', 'runs')).filter((n) => n.startsWith('i-run.json')),
      ['i-run.json', 'i-run.json.2'],
    );
  });
  test('an ask that is no JSON stays where it is, and the rest is imported', () => {
    const root = planted();
    fs.writeFileSync(path.join(root, 'runs', 'i-run.asks', 'retry-implement-2'), 'not json');
    imported(root);
    assert.equal(fs.readFileSync(path.join(root, 'runs', 'i-run.asks', 'retry-implement-2'), 'utf8'), 'not json');
    assert.equal(recordText(root, askKey('i-run', { of: 'try', step: 'implement', n: 2 })), undefined);
  });
  test('a store with no run file makes no keyspace file when it is read', async () => {
    const root = scratch('run-import-empty-');
    await runFilesImported(root);
    assert.deepEqual(runsNow(root).runs.ids(), []);
    assert.equal(fs.existsSync(keyspaceFile(root)), false);
  });
});

describe("what `nemia rm` and `nemia prune --artifacts` read of the store: each run's id, read or not, and its files directory found and dropped", () => {
  test("every run id with a record is listed, read or not, and none from a person's file alone", () => {
    const listed = () => store.runs.ids().filter((id) => id.startsWith('r-ids-')) satisfies string[];
    made('r-ids-read');
    plantRecord(ROOT, runKey('r-ids-torn'), '{ "id": ');
    markCancelled(ROOT, 'r-ids-cancelled');
    store.holds.put('r-ids-held', ['x'], {});
    plantRecord(ROOT, askKey('r-ids-asked', { of: 'gate', step: 'implement', n: 1 }), '{}');
    assert.deepEqual(listed(), ['r-ids-read', 'r-ids-torn']);
    assert.ok(!store.runs.list(() => {}).some((run) => run.id === 'r-ids-torn'), 'where list leaves the torn record out');
  });
  test('no run id is listed in a store with no run', () => {
    assert.deepEqual(runsNow(scratch('wf-run-store-ids-')).runs.ids(), []);
  });
  test("a run's files directory is found while it is a directory, and not when it is absent or a link to one", () => {
    const files = (id: string) => path.join(runsDir(ROOT), id, 'artifacts');
    fs.mkdirSync(files('r-files-there'), { recursive: true });
    assert.equal(store.runs.filesAt('r-files-there'), files('r-files-there'));
    assert.equal(store.runs.filesAt('r-files-never'), undefined);
    fs.mkdirSync(path.join(runsDir(ROOT), 'r-files-linked'), { recursive: true });
    fs.symlinkSync(files('r-files-there'), files('r-files-linked'));
    assert.equal(store.runs.filesAt('r-files-linked'), undefined);
  });
  test("a run's files directory dropped is gone, and one never there drops as gone", () => {
    const files = path.join(runsDir(ROOT), 'r-drop-files', 'artifacts');
    fs.mkdirSync(path.join(files, 'implement'), { recursive: true });
    fs.writeFileSync(path.join(files, 'implement', 'shot.png'), 'x');
    assert.equal(store.runs.dropFiles('r-drop-files'), null);
    assert.equal(fs.existsSync(files), false);
    assert.equal(fs.existsSync(path.join(runsDir(ROOT), 'r-drop-files')), true, 'the run keeps its own directory');
    assert.equal(store.runs.dropFiles('r-drop-never'), null);
  });
  test("REFUSED: a run's files directory that cannot be removed answers why in one line, and stays", (c) => {
    if (process.getuid?.() === 0) return c.skip('root removes what a mode forbids');
    const files = path.join(runsDir(ROOT), 'r-drop-stuck', 'artifacts');
    fs.mkdirSync(path.join(files, 'implement'), { recursive: true });
    fs.writeFileSync(path.join(files, 'implement', 'shot.png'), 'x');
    fs.chmodSync(path.join(files, 'implement'), 0o555);
    c.onTestFinished(() => fs.chmodSync(path.join(files, 'implement'), 0o755));
    const why = store.runs.dropFiles('r-drop-stuck');
    assert.match(why ?? '', /EACCES/);
    assert.ok(!why?.includes('\n'), why ?? '');
    assert.equal(fs.existsSync(path.join(files, 'implement', 'shot.png')), true);
  });
});

/** The functions of `record.store.ts` that read or write a run's record or a person's files beside it: `runStore` says each. */
const GUARDED = [
  'runRecord',
  'listRuns',
  'writeRun',
  'rewriteRun',
  'restStamps',
  'composedRun',
  'recordValue',
  'recordIn',
  'readAsks',
  'readAnswers',
  'consumeAsks',
  'removeHold',
  'markCancelled',
  'writeHold',
  'writeAsk',
  'runFile',
  'cancelFile',
  'holdFile',
  'pruneFile',
  'readPruned',
];

/** The files the interface is built from, which alone may import them for good. */
const OWN = ['src/record/record.store.ts', 'src/record/files.store.ts', 'src/runs/records.store.ts'];

/** `record.store.ts`, and `runner.ts`, which re-exports some of its functions. */
const STORE_MODULE = /(?:^|\/)(?:record\.store|runner)(?:\.ts)?$/;

/** The module a store import names, as a refusal says it: `record.store.ts` or `runner.ts`. */
const moduleOf = (spec: string) => (/(?:^|\/)runner(?:\.ts)?$/.test(spec) ? 'runner.ts' : 'record.store.ts');

/**
 * The guarded functions a source text imports or re-exports from `record.store.ts` or through `runner.ts`, by name across line breaks,
 * each by the module it came from; `*` for a namespace or a dynamic import of either, which reaches every one.
 */
function importsFrom(text: string) {
  const found = new Map<string, Set<string>>();
  const add = (spec: string, name: string) => {
    const from = moduleOf(spec);
    found.set(from, (found.get(from) ?? new Set()).add(name));
  };
  for (const m of text.matchAll(/\b(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    if (!STORE_MODULE.test(m[2])) continue;
    for (const part of m[1].split(',')) {
      const name = part
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)[0];
      if (GUARDED.includes(name)) add(m[2], name);
    }
  }
  for (const m of text.matchAll(/\bimport\s*\*\s*as\s+\w+\s+from\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g))
    if (STORE_MODULE.test(m[1] ?? m[2])) add(m[1] ?? m[2], '*');
  return new Map([...found].sort(([a], [b]) => a.localeCompare(b)).map(([from, names]) => [from, [...names].sort()])) satisfies Map<
    string,
    string[]
  >;
}

/** The guarded functions a source text imports, whichever module they came from (`importsFrom`). */
const directImports = (text: string) => [...new Set([...importsFrom(text).values()].flat())].sort() satisfies string[];

/** A line for each file among `sources` that imports a guarded function directly, naming the module each import came from. */
function refusals(sources: Record<string, string>) {
  const out: string[] = [];
  for (const [file, text] of Object.entries(sources)) {
    for (const [from, names] of importsFrom(text))
      out.push(
        `${file} imports ${names.join(', ')} from ${from}: read and write through the Run door (RunDoor, src/runs/runs.store.ts), adding ` +
          'the method to RunStore (src/record/record.ts)',
      );
  }
  return out satisfies string[];
}

/** `said` refuses each of `imported` in turn, naming the file, the function and its module, and the fix: a method on RunStore. */
function refusedFor(said: readonly string[], ...imported: Array<[fn: string, from: string]>) {
  assert.equal(said.length, imported.length, said.join('\n'));
  imported.forEach(([fn, from], i) => {
    assert.ok(said[i].startsWith(`src/new/new.verb.ts imports ${fn} from ${from}: `), said[i]);
    assert.ok(said[i].includes('RunDoor, src/runs/runs.store.ts'), said[i]);
    assert.ok(said[i].includes('RunStore (src/record/record.ts)'), said[i]);
  });
}

test('a file that imports a run function from record.store.ts is refused, naming the file and the function', () => {
  const sources = { 'src/new/new.verb.ts': "import { runRecord, stepsOf } from '../record/record.store.ts';\n" };
  refusedFor(refusals(sources), ['runRecord', 'record.store.ts']);
});

test('an import spread over lines is refused, as is a re-export, a namespace and a dynamic import', () => {
  const spread = "import {\n  artifactsDir,\n  cancelFile,\n  holdFile as held,\n  stepsOf,\n} from '../record/record.store.ts';\n";
  assert.deepEqual(directImports(spread), ['cancelFile', 'holdFile']);
  assert.deepEqual(directImports("export {\n  listRuns,\n} from './record/record.store.ts';\n"), ['listRuns']);
  assert.deepEqual(directImports("import * as store from '../record/record.store.ts';\n"), ['*']);
  assert.deepEqual(directImports("const store = await import('../record/record.store.ts');\n"), ['*']);
  assert.deepEqual(
    directImports("import { runRecord } from '../other/other.store.ts';\nimport { stepsOf } from './record.store.ts';\n"),
    [],
  );
});

test('a run function imported through runner.ts is refused, naming runner.ts as the module it came from', () => {
  const sources = { 'src/new/new.verb.ts': "import {\n  HOME,\n  runRecord,\n} from '../runner.ts';\n" };
  refusedFor(refusals(sources), ['runRecord', 'runner.ts']);
  const both = {
    'src/new/new.verb.ts': "import { listRuns } from '../runner.ts';\nimport { readAsks } from '../record/record.store.ts';\n",
  };
  refusedFor(refusals(both), ['readAsks', 'record.store.ts'], ['listRuns', 'runner.ts']);
  assert.deepEqual(directImports("import { runRecord } from '../runners.ts';\nimport { stepsOf } from '../../runner.ts';\n"), []);
});

test("no file of src but the store's own imports a run's functions from record.store.ts or through runner.ts", () => {
  assert.deepEqual(refusals(sourcesUnder(PKG, 'src', OWN)), []);
});

/**
 * A read of the run store past the Run door: its files store by name (`filesStoreAt`, `filesStore` before it took its root), the run
 * store's former binding (`runStore.`), or its records layer (`runRecords`). Each is gone or the door's own; this refuses one named.
 */
const PAST_THE_DOOR = /\bfilesStore(?:At)?\b|\brunRecords\s*\(|\brunStore\s*\.\s*(?:runs|asks|holds|refresh|forgetting|labels)\b/g;

/** The files the rule leaves out: the records layer, which defines it, and the Run door, its one reader. */
const DOOR_AND_FILES = ['src/runs/records.store.ts', 'src/runs/runs.store.ts'];

/** What a read past the door says: the file, how many uses, and the fix. */
const pastTheDoor = (sources: Record<string, string>) =>
  [...seamUses(sources, PAST_THE_DOOR)].map(
    ([file, n]) => `${file} reads the run store past the Run door ${n} time(s): yield RunDoor (src/runs/runs.store.ts) in a program`,
  ) satisfies string[];

test('no file of src but the Run door reads the run store: every other yields RunDoor', () => {
  assert.deepEqual(pastTheDoor(sourcesUnder(PKG, 'src', DOOR_AND_FILES)), []);
});

test('REFUSED: a file of src that reads the files store, the records layer or the run store by its former binding, is named', () => {
  const sources = sourcesUnder(PKG, 'src', DOOR_AND_FILES);
  const planted = {
    ...sources,
    'src/cancel/cancel.verb.ts': `${sources['src/cancel/cancel.verb.ts']}\nimport { filesStoreAt } from '../record/files.store.ts';\nconst x = filesStoreAt(home).runs.read('a');\n`,
    'src/try/try.verb.ts': `${sources['src/try/try.verb.ts']}\nconst y = runStore.asks.read('a');\nconst z = runRecords(home, open, held);\n`,
  };
  const said = pastTheDoor(planted);
  assert.equal(said.length, 2, said.join('\n'));
  assert.ok(said[0]?.startsWith('src/cancel/cancel.verb.ts reads the run store past the Run door 2 time(s)'), said[0]);
  assert.ok(said[1]?.startsWith('src/try/try.verb.ts reads the run store past the Run door 2 time(s)'), said[1]);
});

/** A read of runs that a door given to the program does not see: a call of `runsAtOnce`, the synchronous Run door the keyspace retired. */
const UNROOTED_READ = /\brunsAtOnce\s*\(/g;

test('no file of src reads runs past the door it is given: no runsAtOnce is left, and none is owed', () => {
  assert.deepEqual([...seamUses(sourcesUnder(PKG, 'src', DOOR_AND_FILES), UNROOTED_READ)], []);
});

test('REFUSED: a runsAtOnce(home).runs.read(id) is named with its file', () => {
  const sources = sourcesUnder(PKG, 'src', DOOR_AND_FILES);
  const planted = {
    ...sources,
    'src/disk/disk.verb.ts': `${sources['src/disk/disk.verb.ts']}\nconst run = (home: string, id: string) => runsAtOnce(home).runs.read(id);\n`,
  };
  assert.deepEqual([...seamUses(planted, UNROOTED_READ)], [['src/disk/disk.verb.ts', 1]]);
});
