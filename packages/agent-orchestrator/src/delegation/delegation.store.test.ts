/**
 * The Delegation door's two layers held to its walks (`test/delegation-walks.ts`): the files, each walk on a fresh scratch store, and the
 * memory stand-in, each on a stand-in of its own. And what only the files can be asked: the file a delegation is kept at, and a file
 * that does not read refused `Invalid`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { act, done, doorFrom, walksOn } from '../../test/door-walks.ts';
import { aDelegation, DELEGATION_WALKS } from '../../test/delegation-walks.ts';
import { DelegationDoor, delegationDoorFiles } from './delegation.store.ts';
import { delegationDoorMemory } from './memory.store.ts';

for (const [name, body] of walksOn(DELEGATION_WALKS, () => {
  const root = scratch('wf-delegation-door-');
  return { door: doorFrom(DelegationDoor, delegationDoorFiles(root)), root, layer: 'files' };
}))
  test(`files: ${name}`, body);

for (const [name, body] of walksOn(DELEGATION_WALKS, () => ({
  door: doorFrom(DelegationDoor, delegationDoorMemory()),
  root: '/memory',
  layer: 'memory',
})))
  test(`memory: ${name}`, body);

test('a delegation is kept at <store>/factories/<factory>/delegations/<agent>.json, and a file that does not read is refused Invalid', () => {
  const root = scratch('wf-delegation-door-');
  const door = doorFrom(DelegationDoor, delegationDoorFiles(root));
  done(door.delegations.write(aDelegation('implementer')));
  const file = path.join(root, 'factories', 'acme', 'delegations', 'implementer.json');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).spec, aDelegation('implementer').spec);
  fs.writeFileSync(file, '{"since": 1}');
  assert.deepEqual(act(door.delegations.read('acme', 'implementer')), { refused: 'Invalid' });
});
