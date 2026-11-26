/**
 * The programs' controller over the engine's stand-in and a token store of its own (`programsBeat`): one task filed for a declared program
 * — the command harness, long-lived, in the factory's tree, with a session token whose record is no run's —, none filed again by a second
 * beat or once the runtime settled it, a stop asked for the one whose factory went, and the old id stopped and the new one filed where
 * what a program runs changed. The record of the ids it filed is the store's `programs.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from 'test-kit/scratch';
import { StoreRoot } from '../config/root.store.ts';
import { engineOf, EngineService } from '../runtime-client.ts';
import { SESSION_TOKEN } from '../filed/filed.ts';
import { TokenDoor, tokenDoorAt } from '../token/token.store.ts';
import type { FactoryListing } from '../factory/factory.ts';
import { declaredPrograms, programsBeat } from './program.verb.ts';

const listed = (run: string, name = 'mill') =>
  ({
    name,
    file: `/f/${name}.json`,
    volumes: [],
    workflows: [],
    hires: {},
    schedules: {},
    tree: `/trees/${name}`,
    programs: { 'ci-writer': { run, writes: ['ci'] } },
  }) as FactoryListing;

/** A store of its own, an engine's stand-in, and a beat over the programs the given factories declare. */
const world = () => {
  const root = scratch('wf-programs-');
  const stand = testEngine();
  const layers = [EngineService.layer(engineOf(stand.layer)), tokenDoorAt(root), StoreRoot.layer(root)] as const;
  const beat = (...factories: FactoryListing[]) =>
    Effect.runPromise(
      programsBeat(declaredPrograms(factories)).pipe(Effect.provide(layers[0]), Effect.provide(layers[1]), Effect.provide(layers[2])),
    );
  const record = () => JSON.parse(fs.readFileSync(path.join(root, 'programs.json'), 'utf8')) as string[];
  const tokenRecord = (token: string) =>
    Effect.runPromise(Effect.flatMap(TokenDoor, (door) => door.tokens.read(token)).pipe(Effect.provide(layers[1])));
  return { stand, beat, record, tokenRecord };
};

test('files one command task for a declared program, long-lived, in the factory’s tree, under a token that is no run’s, and none again', async () => {
  const { stand, beat, record, tokenRecord } = world();
  await beat(listed('node writer.ts'));
  assert.equal(stand.specs.length, 1);
  const spec = stand.specs[0];
  assert.ok(spec);
  assert.deepEqual([spec.harness, spec.restartPolicy, spec.cwd], ['command', 'Always', '/trees/mill']);
  const token = (spec.config as { env: Record<string, string> }).env[SESSION_TOKEN];
  assert.ok(token, 'the program is given its session token');
  const kept = await tokenRecord(token);
  assert.deepEqual([kept?.run, kept?.step, kept?.factory], [null, null, 'mill']);
  await beat(listed('node writer.ts'));
  assert.equal(stand.specs.length, 1, 'a second beat files nothing');
  assert.deepEqual(record(), [spec.id]);
});

test('asks the stop of a program whose factory went, and files the new id and stops the old where what it runs changed', async () => {
  const { stand, beat } = world();
  await beat(listed('node writer.ts'));
  const first = stand.specs[0]?.id;
  await beat();
  assert.deepEqual(stand.stopped, [first], 'the factory’s removal stops its program');
  await beat(listed('node other.ts'));
  assert.equal(stand.specs.length, 2, 'a changed run is a task of its own');
  assert.notEqual(stand.specs[1]?.id, first);
  await beat(listed('node other.ts'));
  assert.deepEqual(stand.stopped, [first], 'nothing else is stopped');
});

test('does not file again a program whose task the runtime settled, and forgets a settled one no factory declares', async () => {
  const { stand, beat, record } = world();
  await beat(listed('node writer.ts'));
  const id = stand.specs[0]?.id ?? '';
  stand.settle(id, 'failed');
  await beat(listed('node writer.ts'));
  assert.equal(stand.specs.length, 1, 'a settled task is not filed again under its id');
  assert.deepEqual(record(), [id]);
  await beat();
  assert.deepEqual(record(), [], 'the record forgets a settled task no factory declares');
});
