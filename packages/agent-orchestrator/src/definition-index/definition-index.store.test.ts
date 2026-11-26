/**
 * The definition index (`indexSweep`): a definition file written once is one record, a sweep that sees nothing new writes nothing, an
 * edit is one write, a removed file a tombstone; and a write of a definition names the revision it was read at (`definitionRevisionNow`).
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Effect } from 'effect';
import { StoreRoot } from '../config/root.store.ts';
import { keyspaceAt, keyspaceFile } from '../keyspace/keyspace.store.ts';
import { definitionKey, definitionRevisionNow, indexSweep } from './definition-index.store.ts';

/** A store of its own, the library's agents folder in it with the agent `coder`, and what it holds in the index. */
const stored = () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nemia-index-'));
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

test('the revision a write names is the one the files hold now: an edit since the read moves it', async () => {
  const s = stored();
  const read = await s.run(definitionRevisionNow('Agent', undefined, 'coder'));
  assert.equal(await s.run(definitionRevisionNow('Agent', undefined, 'coder')), read, 'the same files, the same revision');
  fs.appendFileSync(s.file, 'Edited by hand.\n');
  assert.ok((await s.run(definitionRevisionNow('Agent', undefined, 'coder'))) > read, 'a hand edit since the read moved it');
});
