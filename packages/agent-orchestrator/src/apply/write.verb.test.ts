/**
 * A LibraryAdd proposal applied (`objectWritten`, `write.verb.ts`): the factory's record of its adds written as the proposal says, and the
 * proposal's read of what is there now (`currentOf`) agreeing with it, an add made and then taken off.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { ProposedObject } from 'objects';
import { scratch } from 'test-kit/scratch';
import { TEAM } from '../../test/team.ts';
import { objectWritten } from './write.verb.ts';
import { currentOf } from '../propose/current.verb.ts';
import { readLibraryAdds } from '../library/library.store.ts';
import type { Refusal } from '../refusal/refusal.ts';

/** `program` run with what a LibraryAdd's write and read reach alone: the store's root, which they are given. */
const ran = <A>(program: Effect.Effect<A, Refusal, unknown>): Promise<A> => Effect.runPromise(program as Effect.Effect<A, Refusal>);

test('a LibraryAdd proposal applied writes the add, then its removal takes it off, each read back as the proposal reads it', async () => {
  const home = scratch('wf-apply-adds-');
  fs.cpSync(TEAM, path.join(home, 'workflows'), { recursive: true });
  const place = { home };
  const add: ProposedObject = {
    kind: 'LibraryAdd',
    metadata: { name: 'Skill.create-an-agent' },
    verb: 'create',
    spec: { kind: 'Skill', name: 'create-an-agent' },
  };
  assert.equal((await ran(currentOf(place, 'default', 'LibraryAdd', add.metadata.name))).version, null, 'not added yet');
  await ran(objectWritten(place, 'default', add));
  assert.ok(readLibraryAdds(home, 'default')?.some((a) => a.kind === 'Skill' && a.name === 'create-an-agent'), 'the record holds it');
  assert.notEqual((await ran(currentOf(place, 'default', 'LibraryAdd', add.metadata.name))).version, null, 'read as there now');
  await ran(objectWritten(place, 'default', { kind: 'LibraryAdd', metadata: { name: add.metadata.name }, verb: 'delete' }));
  assert.equal(
    readLibraryAdds(home, 'default')?.some((a) => a.kind === 'Skill' && a.name === 'create-an-agent'),
    false,
    'a removal named alone, with no spec, takes it off by its name',
  );
});

test('REFUSED: a LibraryAdd whose name is no add, and one of an item the library does not hold, each by its kind', async () => {
  const home = scratch('wf-apply-adds-refused-');
  const refused = (object: ProposedObject) =>
    ran(objectWritten({ home }, 'default', object)).then(
      () => assert.fail('written'),
      (e: { _tag?: string }) => e._tag,
    );
  assert.equal(await refused({ kind: 'LibraryAdd', metadata: { name: 'nothing' }, verb: 'create' }), 'Invalid');
  assert.equal(
    await refused({ kind: 'LibraryAdd', metadata: { name: 'Skill.nowhere' }, verb: 'create', spec: { kind: 'Skill', name: 'nowhere' } }),
    'Missing',
  );
});
