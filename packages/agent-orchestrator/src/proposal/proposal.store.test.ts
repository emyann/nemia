/**
 * The Proposal door's two layers held to its walks (`test/proposal-walks.ts`): the rooted door, each walk on the keyspace of a fresh
 * scratch store, and the memory stand-in, each on a keyspace in memory of its own — what the one says, the other says. And what only a
 * store's root can be asked: the import of the proposal files of before the keyspace, moved aside once imported, a key the keyspace holds
 * kept, a file that does not read left where it is.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { acted, doorFrom, settled, walkedOn } from '../../test/door-walks.ts';
import { aProposal, PROPOSAL_WALKS } from '../../test/proposal-walks.ts';
import { StoreRoot } from '../config/root.store.ts';
import { ProposalDoor, proposalKeyspace, proposalsImported, type ProposalDoorShape } from './proposal.store.ts';
import { proposalDoorMemory } from './memory.store.ts';

/** The rooted door at `root`: each method given the store's root, as a program composed at it is. */
function rootedAt(root: string) {
  const door = Effect.runSync(ProposalDoor);
  const given = Object.fromEntries(
    Object.entries(door.proposals).map(([name, method]) => [
      name,
      (...args: never[]) => Effect.provideService((method as (...a: never[]) => Effect.Effect<unknown>)(...args), StoreRoot, root),
    ]),
  );
  return { proposals: given } as unknown as ProposalDoorShape;
}

for (const [name, body] of walkedOn(PROPOSAL_WALKS, () => {
  const root = scratch('wf-proposal-door-');
  return { door: rootedAt(root), root, layer: 'keyspace' };
}))
  test(`keyspace: ${name}`, body);

for (const [name, body] of walkedOn(PROPOSAL_WALKS, () => ({
  door: doorFrom(ProposalDoor, proposalDoorMemory()),
  root: '/memory',
  layer: 'memory',
})))
  test(`memory: ${name}`, body);

/** The file of the proposal `name` of `factory` in the store `root`, as stores before the keyspace kept it. */
const fileOf = (root: string, factory: string, name: string) => path.join(root, 'factories', factory, 'proposals', `${name}.json`);

/** `proposal` planted as a file of before the keyspace, with a digest for its version, as those stores stamped it. */
function planted(
  root: string,
  factory: string,
  name: string,
  text = JSON.stringify({
    ...aProposal(name, factory),
    metadata: { ...aProposal(name, factory).metadata, resourceVersion: 'sha256-0123' },
  }),
) {
  const file = fileOf(root, factory, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
}

/** What is under `dir`, as paths from it, sorted; none where it is not there. */
const under = (dir: string) =>
  fs.existsSync(dir) ? (fs.readdirSync(dir, { recursive: true }) as string[]).filter((p) => p.endsWith('.json')).sort() : [];

test('a store’s proposal files are imported on the first open, each moved aside under imported/proposals/, and a second open makes none twice', async () => {
  const root = scratch('wf-proposal-import-');
  planted(root, 'acme', 'implementer-aaaaa');
  planted(root, 'acme', 'shipper-bbbbb');
  planted(root, 'zeta', 'implementer-ccccc');
  const door = rootedAt(root);
  assert.deepEqual(await settled(door.proposals.factories()), ['acme', 'zeta']);
  const read = await settled(door.proposals.read('acme', 'implementer-aaaaa'));
  assert.match(read?.metadata.resourceVersion ?? '', /^[1-9][0-9]*$/, 'read at its revision, not the digest of the file');
  assert.deepEqual(under(path.join(root, 'factories')), []);
  assert.deepEqual(under(path.join(root, 'imported', 'proposals')), [
    path.join('acme', 'implementer-aaaaa.json'),
    path.join('acme', 'shipper-bbbbb.json'),
    path.join('zeta', 'implementer-ccccc.json'),
  ]);
  planted(root, 'acme', 'implementer-aaaaa');
  assert.deepEqual(
    (await settled(rootedAt(root).proposals.list('acme'))).map((p) => p.metadata.name),
    ['implementer-aaaaa', 'shipper-bbbbb'],
  );
});

test('a file whose key the keyspace holds is moved aside, and the keyspace keeps its own record', async () => {
  const root = scratch('wf-proposal-import-');
  const door = rootedAt(root);
  const made = await settled(door.proposals.create(aProposal('implementer-aaaaa')));
  await settled(door.proposals.write({ ...made, status: { ...made.status, phase: 'declined' } }));
  planted(root, 'acme', 'implementer-aaaaa');
  const keyspace = await Effect.runPromise(proposalKeyspace(root));
  assert.equal(await Effect.runPromise(proposalsImported(root, keyspace)), 0);
  assert.equal((await settled(door.proposals.read('acme', 'implementer-aaaaa')))?.status.phase, 'declined');
  assert.deepEqual(under(path.join(root, 'factories')), []);
  assert.deepEqual(under(path.join(root, 'imported', 'proposals')), [path.join('acme', 'implementer-aaaaa.json')]);
});

test('a file that does not read stays where it is, and the rest are imported', async () => {
  const root = scratch('wf-proposal-import-');
  const bad = planted(root, 'acme', 'implementer-aaaaa', '{');
  planted(root, 'acme', 'shipper-bbbbb');
  const door = rootedAt(root);
  assert.deepEqual(
    (await settled(door.proposals.list('acme'))).map((p) => p.metadata.name),
    ['shipper-bbbbb'],
  );
  assert.equal(fs.existsSync(bad), true);
});

test('REFUSED: a file larger than a record holds stops the import before anything moves, Invalid', async () => {
  const root = scratch('wf-proposal-import-');
  const small = planted(root, 'acme', 'implementer-aaaaa');
  const p = aProposal('shipper-bbbbb');
  planted(root, 'acme', 'shipper-bbbbb', JSON.stringify({ ...p, status: { ...p.status, message: 'x'.repeat(1_572_864) } }));
  assert.deepEqual(await acted(rootedAt(root).proposals.list('acme')), { refused: 'Invalid' });
  assert.equal(fs.existsSync(small), true);
  assert.deepEqual(under(path.join(root, 'imported')), []);
});
