/**
 * The code an attempt in flight runs on and its harness's version, journalled as its sighting says them (`imageFacts`), what the
 * fold makes of them, and a pass that writes them before the end it records.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Layer } from 'effect';
import { fold, nameFor, type Event, type Sighting } from '../domain.ts';
import { imageFacts } from './image.ts';
import { Journal } from './journal.ts';
import { Runner } from '../../harness/seam.ts';
import type { SpawnRequest } from '../../harness/seam.ts';
import { file } from './filing.ts';
import { tick } from './engine.ts';
import { tickMemoLayer } from './memo.ts';
import { TaskId } from '../model.ts';

const T0 = Date.parse('2026-01-01T00:00:00Z');
const at = (ms: number) => new Date(T0 + ms).toISOString();
const TASK = 't-1';
const V1 = '/store/releases/v1.2.0/packages/agent-runtime';
const V2 = '/store/releases/v1.3.0/packages/agent-runtime';

const inFlight = (...more: Event[]): Event[] => [
  { kind: 'filed', at: at(0), brief: 'b', cwd: '/r', queued: false },
  { kind: 'starting', at: at(1), attempt: 1 },
  { kind: 'spawned', at: at(2), attempt: 1 },
  ...more,
];
const imaged = (image?: string, harnessVersion?: string, attempt = 1): Event => ({
  kind: 'image',
  at: at(10),
  attempt,
  ...(image ? { image } : {}),
  ...(harnessVersion ? { harnessVersion } : {}),
});
const seen = (image?: string, harnessVersion?: string): Sighting => ({
  sessionId: 's1',
  state: 'working',
  ...(image ? { image } : {}),
  ...(harnessVersion ? { harnessVersion } : {}),
});
const ended: Event = { kind: 'ended', at: at(30), attempt: 1, sessionId: 's1', observed: 'succeeded', reason: 'harness' };
/** An `image` entry naming the mode `ranIn`, and the code `image` where given. */
const moded = (ranIn: string, image?: string): Event => ({ kind: 'image', at: at(10), attempt: 1, ...(image ? { image } : {}), ranIn });
/** An end that says the mode `ranIn`. */
const endedIn = (ranIn: string): Event => ({ ...ended, kind: 'ended', ranIn });

test('imageFacts: the code and harness version of an attempt in flight, journalled whenever its sighting says other than the record', async (t) => {
  await t.test('IMAGE: an unended attempt sighted with both is written one image entry with both', () => {
    assert.deepEqual(imageFacts(fold(TASK, inFlight()), seen(V1, '2.1.316'), at(20)), [
      { kind: 'image', at: at(20), attempt: 1, image: V1, harnessVersion: '2.1.316' },
    ]);
  });
  await t.test('IMAGE: the same sighting again writes nothing', () => {
    assert.deepEqual(imageFacts(fold(TASK, inFlight(imaged(V1, '2.1.316'))), seen(V1, '2.1.316'), at(20)), []);
  });
  await t.test('IMAGE: a new holder on other code is written its image alone', () => {
    assert.deepEqual(imageFacts(fold(TASK, inFlight(imaged(V1, '2.1.316'))), seen(V2, '2.1.316'), at(20)), [
      { kind: 'image', at: at(20), attempt: 1, image: V2 },
    ]);
  });
  await t.test('IMAGE: a new harness version alone is written alone', () => {
    assert.deepEqual(imageFacts(fold(TASK, inFlight(imaged(V1, '2.1.316'))), seen(V1, '2.1.317'), at(20)), [
      { kind: 'image', at: at(20), attempt: 1, harnessVersion: '2.1.317' },
    ]);
  });
  await t.test('IMAGE: a sighting that says neither writes nothing, and takes nothing away', () => {
    assert.deepEqual(imageFacts(fold(TASK, inFlight()), seen(), at(20)), []);
    assert.deepEqual(imageFacts(fold(TASK, inFlight(imaged(V1, '2.1.316'))), seen(), at(20)), []);
  });
  await t.test('IMAGE: nothing is written for an ended attempt', () => {
    assert.deepEqual(imageFacts(fold(TASK, inFlight(ended)), seen(V1, '2.1.316'), at(40)), []);
  });
  await t.test('IMAGE: nothing is written for a settled task', () => {
    const settled = fold(TASK, inFlight({ kind: 'settled', at: at(15), outcome: 'stopped' }));
    assert.deepEqual(imageFacts(settled, seen(V1, '2.1.316'), at(20)), []);
  });
  await t.test('IMAGE: nothing is written with no sighting', () => {
    assert.deepEqual(imageFacts(fold(TASK, inFlight()), undefined, at(20)), []);
  });
  await t.test(
    'IMAGE: the mode a sighting says the session runs in, other than the record, is written; the same again writes nothing',
    () => {
      assert.deepEqual(imageFacts(fold(TASK, inFlight(imaged(V1, '2.1.316'))), { ...seen(V1, '2.1.316'), ranIn: 'auto' }, at(20)), [
        { kind: 'image', at: at(20), attempt: 1, ranIn: 'auto' },
      ]);
      const auto = fold(TASK, inFlight(moded('auto', V1)));
      assert.deepEqual(imageFacts(auto, { ...seen(V1), ranIn: 'auto' }, at(20)), []);
      assert.deepEqual(imageFacts(auto, { ...seen(V1), ranIn: 'default' }, at(20)), [
        { kind: 'image', at: at(20), attempt: 1, ranIn: 'default' },
      ]);
      assert.deepEqual(imageFacts(auto, seen(V1), at(20)), [], 'a sighting that says none takes nothing away');
    },
  );
});

test('fold: an attempt keeps the latest image and harness version its entries said, and an end keeps them', async (t) => {
  await t.test('FOLD: the latest of each wins, and one entry naming one leaves the other', () => {
    const [a] = fold(TASK, inFlight(imaged(V1, '2.1.316'), imaged(V2), imaged(undefined, '2.1.317'))).attempts;
    assert.equal(a?.image, V2);
    assert.equal(a?.harnessVersion, '2.1.317');
  });
  await t.test('FOLD: the latest mode an entry said wins, and an end that says one sets it', () => {
    const [a] = fold(TASK, inFlight(moded('auto', V1), moded('default'), imaged(V2))).attempts;
    assert.equal(a?.ranIn, 'default');
    const [b] = fold(TASK, inFlight(moded('auto', V1), endedIn('default'))).attempts;
    assert.equal(b?.ranIn, 'default');
    const [c] = fold(TASK, inFlight(moded('auto', V1), ended)).attempts;
    assert.equal(c?.ranIn, 'auto', 'an end that says none keeps it');
  });
  await t.test('FOLD: an end keeps them', () => {
    const [a] = fold(TASK, inFlight(imaged(V1, '2.1.316'), ended)).attempts;
    assert.deepEqual([a?.image, a?.harnessVersion], [V1, '2.1.316']);
  });
  await t.test('FOLD: an entry of another attempt is not this one, and a journal with none folds with neither', () => {
    const [a] = fold(TASK, inFlight(imaged(V1, '2.1.316', 2))).attempts;
    assert.deepEqual([a?.image, a?.harnessVersion], [undefined, undefined]);
  });
});

test('a pass: a job first seen already over is journalled its image and mode before its end, under the memo in check mode', async () => {
  const sessions = new Map<string, Sighting>();
  const spawned: SpawnRequest[] = [];
  const layer = Layer.mergeAll(Journal.test(), Runner.test({ sessions, spawned }), tickMemoLayer({ verify: true }));
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
  const id = await run(file({ brief: 'do the thing', cwd: '/repo' }));
  await run(tick());
  const name = nameFor(id, 1);
  const s = sessions.get(name);
  assert.ok(s, 'the pass started a session');
  sessions.set(name, { ...s, state: 'completed', exitCode: 0, image: V1, harnessVersion: '2.1.316', ranIn: 'auto' });
  await run(tick());
  const events = await run(Effect.flatMap(Journal, (j) => j.read(TaskId.read(id))));
  const kinds = events.map((e) => e.kind);
  assert.ok(kinds.indexOf('image') !== -1 && kinds.indexOf('image') < kinds.indexOf('ended'), `image before ended: ${kinds.join(', ')}`);
  const [a] = fold(id, events).attempts;
  assert.deepEqual([a?.image, a?.harnessVersion, a?.ranIn], [V1, '2.1.316', 'auto']);
  const end = events.find((e) => e.kind === 'ended');
  assert.equal(end?.kind === 'ended' && end.ranIn, 'auto', 'the end carries the mode, as it does the model');
});
