/**
 * The keyspace's records of runs' observed status (`runStatusesWritten`, `runStatusesHeld`): the first observation of a run creates its
 * record, the same again keeps it so the head stands, a status that moved updates it, a run no longer observed deletes it, and a status
 * past what a record holds is left unwritten while the others are written.
 */
import { test } from 'vitest';
import { scratch } from 'test-kit/scratch';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { StoreRoot } from '../config/root.store.ts';
import { keyspaceAt, keyspaceFile, RECORD_CEILING } from '../keyspace/keyspace.store.ts';
import { recordIn, type StatusRecord } from './run-status.ts';
import { runStatusesHeld, runStatusesWritten } from './run-status.store.ts';

/** A store of its own, and the programs run in it. */
const stored = () => {
  const home = scratch('nemia-run-status-');
  const run = <A, E>(effect: Effect.Effect<A, E, StoreRoot>) => Effect.runPromise(effect.pipe(Effect.provide(StoreRoot.layer(home))));
  const head = () => run(Effect.flatMap(keyspaceAt(keyspaceFile(home)), (k) => k.head));
  return { run, head };
};

/** The record of a run in `phase`, its status as long as `padding` says. */
const recordOf = (phase: string, padding = '') => {
  const read = recordIn(JSON.stringify({ spec: { steps: [] }, status: { phase, state: 'finished', padding } }));
  assert.ok(read !== null);
  return read satisfies StatusRecord;
};

test('a first observation creates the record, the same again keeps it, a moved status updates it, a run gone deletes it', async () => {
  const s = stored();
  await s.run(runStatusesWritten(new Map([['aaaa', recordOf('running')]])));
  const created = (await s.run(runStatusesHeld())).get('aaaa');
  assert.ok(created !== undefined, 'the run is recorded');
  const head = await s.head();
  assert.equal(await s.run(runStatusesWritten(new Map([['aaaa', recordOf('running')]]))), 0, 'nothing observed anew is written');
  assert.equal(await s.head(), head, 'the head stands');
  await s.run(runStatusesWritten(new Map([['aaaa', recordOf('finished')]])));
  const updated = (await s.run(runStatusesHeld())).get('aaaa');
  assert.ok(updated !== undefined && updated.revision > created.revision, 'a moved status is one write');
  await s.run(runStatusesWritten(new Map()));
  assert.equal((await s.run(runStatusesHeld())).size, 0, 'a run no longer observed has no record');
});

test('a status past what a record holds is left unwritten, and the others are written', async () => {
  const s = stored();
  const huge = recordOf('running', 'x'.repeat(RECORD_CEILING));
  await s.run(
    runStatusesWritten(
      new Map([
        ['big', huge],
        ['small', recordOf('running')],
      ]),
    ),
  );
  const held = await s.run(runStatusesHeld());
  assert.deepEqual([...held.keys()], ['small']);
});
