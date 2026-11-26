/**
 * The definition index (`indexSweep`): a definition file written once is one record, a sweep that sees nothing new writes nothing, an
 * edit is one write, a removed file a tombstone; and a read or a write of a definition numbers it with no write
 * (`definitionRevisionNow`): a definition no sweep has numbered is the next revision.
 */
import { test } from 'vitest';
import { scratch } from 'test-kit/scratch';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { StoreRoot } from '../config/root.store.ts';
import { keyspaceAt, keyspaceFile } from '../keyspace/keyspace.store.ts';
import { definitionJudged, definitionKey, definitionRevisionNow, indexSweep } from './definition-index.store.ts';

/** A store of its own, the library's agents folder in it with the agent `coder`, and what it holds in the index. */
const stored = () => {
  const home = scratch('nemia-index-');
  const agents = path.join(home, 'workflows', 'agents');
  fs.mkdirSync(agents, { recursive: true });
  const file = path.join(agents, 'coder.md');
  fs.writeFileSync(file, '---\nrole: coder\ndescription: Writes code.\n---\nWrite it.\n');
  const run = <A, E>(effect: Effect.Effect<A, E, StoreRoot>) => Effect.runPromise(effect.pipe(Effect.provide(StoreRoot.layer(home))));
  const head = () => run(Effect.flatMap(keyspaceAt(keyspaceFile(home)), (k) => k.head));
  const held = () => run(Effect.flatMap(keyspaceAt(keyspaceFile(home)), (k) => k.get(definitionKey('_library', 'agent', 'coder'))));
  return { home, file, run, head, held };
};

test('a definition file gives one record, a second sweep writes nothing, an edit gives one write, a removal a tombstone', async () => {
  const s = stored();
  await s.run(indexSweep());
  const first = await s.held();
  assert.ok(first !== undefined, 'the agent is indexed');
  assert.equal(JSON.parse(first.value).path, s.file);
  const head = await s.head();
  await s.run(indexSweep());
  assert.equal(await s.head(), head, 'a sweep that sees nothing new writes nothing');
  fs.appendFileSync(s.file, 'More.\n');
  await s.run(indexSweep());
  const edited = await s.held();
  assert.equal(edited?.revision, head + 1, 'an edit is one write');
  fs.rmSync(s.file);
  await s.run(indexSweep());
  assert.equal(await s.held(), undefined, 'a removed file is no record');
});

test('a definition no sweep has numbered reads as the next revision, and a read writes nothing', async () => {
  const s = stored();
  const head = await s.head();
  const read = await s.run(definitionRevisionNow('Agent', undefined, 'coder'));
  assert.equal(read, head + 1, 'a definition nobody has numbered is one past the head');
  assert.equal(await s.run(definitionRevisionNow('Agent', undefined, 'coder')), read, 'the same files, the same revision');
  assert.equal(await s.head(), head, 'a read writes no record');
  assert.equal(await s.held(), undefined, 'and numbers nothing');
});

test("a sweep gives the definition its record's revision, which a hand edit since the sweep moves with no write", async () => {
  const s = stored();
  await s.run(indexSweep());
  const record = await s.held();
  assert.ok(record !== undefined);
  const head = await s.head();
  assert.equal(await s.run(definitionRevisionNow('Agent', undefined, 'coder')), record.revision, "the record's revision once numbered");
  fs.appendFileSync(s.file, 'Edited by hand.\n');
  assert.equal(await s.run(definitionRevisionNow('Agent', undefined, 'coder')), head + 1, 'a hand edit reads as the next revision');
  assert.equal(await s.head(), head, 'and writes nothing');
  await s.run(indexSweep());
  assert.equal((await s.held())?.revision, await s.run(definitionRevisionNow('Agent', undefined, 'coder')), 'a sweep numbers it again');
});

test('a writer that names the revision it read is refused Conflict where a hand edit moved it, with the index untouched', async () => {
  const s = stored();
  await s.run(indexSweep());
  const read = String(await s.run(definitionRevisionNow('Agent', undefined, 'coder')));
  await s.run(definitionJudged('Agent', undefined, 'coder', read, 'write'));
  fs.appendFileSync(s.file, 'Edited by hand.\n');
  await s.run(indexSweep());
  const refused = await Effect.runPromise(
    Effect.flip(definitionJudged('Agent', undefined, 'coder', read, 'write')).pipe(Effect.provide(StoreRoot.layer(s.home))),
  );
  assert.equal(refused._tag, 'Conflict');
});
