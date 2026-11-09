/**
 * The Proposal door's two layers held to its walks (`test/proposal-walks.ts`): the files, each walk on a fresh scratch store, and the
 * memory stand-in, each on a stand-in of its own — what the files say, the stand-in says. And what only the files can be asked: the file
 * a proposal is kept at, and a file that does not read refused `Invalid`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { act, done, doorFrom, walksOn } from '../../test/door-walks.ts';
import { aProposal, PROPOSAL_WALKS } from '../../test/proposal-walks.ts';
import { ProposalDoor, proposalDoorFiles } from './proposal.store.ts';
import { proposalDoorMemory } from './memory.store.ts';

for (const [name, body] of walksOn(PROPOSAL_WALKS, () => {
  const root = scratch('wf-proposal-door-');
  return { door: doorFrom(ProposalDoor, proposalDoorFiles(root)), root, layer: 'files' };
}))
  test(`files: ${name}`, body);

for (const [name, body] of walksOn(PROPOSAL_WALKS, () => ({
  door: doorFrom(ProposalDoor, proposalDoorMemory()),
  root: '/memory',
  layer: 'memory',
})))
  test(`memory: ${name}`, body);

test('a proposal is kept at <store>/factories/<factory>/proposals/<name>.json, and a file that does not read is refused Invalid', () => {
  const root = scratch('wf-proposal-door-');
  const door = doorFrom(ProposalDoor, proposalDoorFiles(root));
  done(door.proposals.create(aProposal('implementer-aaaaa')));
  const file = path.join(root, 'factories', 'acme', 'proposals', 'implementer-aaaaa.json');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).metadata.name, 'implementer-aaaaa');
  fs.writeFileSync(file, '{');
  assert.deepEqual(act(door.proposals.read('acme', 'implementer-aaaaa')), { refused: 'Invalid' });
});
