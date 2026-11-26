/**
 * The Delegation door held to its walks (`test/delegation-walks.ts`): the rooted door, each walk on the keyspace of a fresh scratch store,
 * and the memory stand-in, each on a keyspace in memory of its own. And what only a store's root can be asked: a delegation file of
 * before the keyspace imported and moved aside, one that does not read left where it is.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { doorFrom, rootedOn, settled, walkedOn } from '../../test/door-walks.ts';
import { aDelegation, DELEGATION_WALKS } from '../../test/delegation-walks.ts';
import { DelegationDoor } from './delegation.store.ts';
import { delegationDoorMemory } from './memory.store.ts';

for (const [name, body] of walkedOn(DELEGATION_WALKS, () => {
  const root = scratch('wf-delegation-door-');
  return { door: rootedOn(Effect.runSync(DelegationDoor), root), root, layer: 'keyspace' };
}))
  test(`keyspace: ${name}`, body);

for (const [name, body] of walkedOn(DELEGATION_WALKS, () => ({
  door: doorFrom(DelegationDoor, delegationDoorMemory()),
  root: '/memory',
  layer: 'memory',
})))
  test(`memory: ${name}`, body);

test('a delegation file of before the keyspace is imported and moved aside, and one that does not read stays', async () => {
  const root = scratch('wf-delegation-import-');
  const dir = path.join(root, 'factories', 'acme', 'delegations');
  fs.mkdirSync(dir, { recursive: true });
  const { since, spec } = aDelegation('implementer');
  fs.writeFileSync(path.join(dir, 'implementer.json'), JSON.stringify({ since, spec }));
  fs.writeFileSync(path.join(dir, 'reviewer.json'), '{"since": 1}');
  const door = rootedOn(Effect.runSync(DelegationDoor), root);
  assert.deepEqual(await settled(door.delegations.list('acme')), [aDelegation('implementer')]);
  assert.deepEqual(fs.readdirSync(dir), ['reviewer.json']);
  assert.ok(fs.existsSync(path.join(root, 'imported', 'factories', 'acme', 'delegations', 'implementer.json')));
});
