/**
 * A pin is numbered at the definition's revision in the run's namespace (`pinsOf`, `passRevisions`): the number the definition is served
 * at, swept first so no pin takes a provisional one, and still the definition's after a write that is no definition moves the keyspace
 * head. A pin written before pins were numbered so still resolves, since drift is judged by digest and never by number (`kindsDrift`).
 */
import { test } from 'vitest';
import { scratch } from 'test-kit/scratch';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { StoreRoot } from '../config/root.store.ts';
import { plantRecord } from '../../testing.ts';
import { definitionRevisionNow, indexSweep } from '../definition-index/definition-index.store.ts';
import { WorkflowDoor } from '../workflows/workflows.store.ts';
import { WorkflowDir } from '../folder/folder.model.ts';
import { kindsDrift, type Pin } from './revisions.ts';
import { passRevisions, pinsOf } from './pin.verb.ts';

/** A store of its own with the library's agent `coder` and the library's workflow `dev`, whose one step is `coder`'s. */
const stored = () => {
  const home = scratch('nemia-pin-');
  fs.mkdirSync(path.join(home, 'workflows', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(home, 'workflows', 'agents', 'coder.md'), '---\nrole: coder\ndescription: Writes code.\n---\nWrite it.\n');
  const dir = path.join(home, 'workflows', 'dev');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'build.md'), '---\nplace: git\nagent: coder\n---\nBuild it.\n');
  const run = <A, E>(effect: Effect.Effect<A, E, StoreRoot>) => Effect.runPromise(effect.pipe(Effect.provide(StoreRoot.layer(home))));
  const folder = { workflowDir: dir };
  const steps = Effect.flatMap(WorkflowDoor, (door) => door.workflows.read(WorkflowDir.read(dir), { home }));
  const pinned = () => run(Effect.flatMap(steps, (read) => pinsOf(folder, read)));
  const looked = () =>
    run(
      Effect.gen(function* () {
        const read = yield* passRevisions();
        return yield* pinsOf(folder, yield* steps, read, read.looked);
      }),
    );
  return { home, run, pinned, looked };
};

const coderOf = (pins: readonly Pin[]) => pins.find((p) => p.kind === 'agent' && p.name === 'coder');

test('a pin names its definition at the revision it is served at, after an unrelated write moves the head', async () => {
  const s = stored();
  const pins = await s.pinned();
  const at = coderOf(pins)?.n;
  assert.ok(at !== undefined && at > 0, 'the agent is pinned at a revision the index holds');

  plantRecord(s.home, '/registry/probe/moved', 'a write that is no definition');
  await s.run(indexSweep());

  assert.equal(
    await s.run(definitionRevisionNow('Agent', 'default', 'coder')),
    at,
    'the pin is still the revision the definition stands at',
  );
  assert.deepEqual(kindsDrift(pins, await s.looked()), [], 'and the run is behind on nothing');
});

test('a pin written before pins were numbered by revision still resolves: its digest decides drift, never its number', async () => {
  const s = stored();
  const pins = await s.pinned();
  const hash = coderOf(pins)?.hash ?? '';
  const counted: Pin = { kind: 'agent', name: 'coder', n: 3, hash };
  assert.deepEqual(kindsDrift([counted], await s.looked()), [], 'a pin of the same digest is no drift, whatever its number');

  const moved = kindsDrift([{ ...counted, hash: '0000000000000000' }], await s.looked());
  assert.deepEqual(moved, [
    { kind: 'agent', name: 'coder', pinned: 3, now: await s.run(definitionRevisionNow('Agent', 'default', 'coder')) },
  ]);
});
