/**
 * The Proposal door's contract (`ProposalDoor`, `src/proposal/proposal.store.ts`), as walks (`door-walks.ts`): every method's rows, run on
 * the files and on the memory stand-in by `src/proposal/proposal.store.test.ts`. A proposal made is read back stamped with the digest of
 * its spec and status, listed by name in its factory alone, and its factory listed; one written back is a new version. And the door's
 * refusals: a name taken (`Conflict`), one written back that is not there (`Missing`), a name that is no proposal's or no factory's and a
 * proposal that names no namespace (`Invalid`), and one the model's `Proposal` refuses (`Invalid`), nothing written.
 */
import type { Proposal } from 'objects';
import type { DoorWalk } from './door-walks.ts';
import { act, done } from './door-walks.ts';
import type { ProposalDoorShape } from '../src/proposal/proposal.store.ts';

type Walk = DoorWalk<ProposalDoorShape>;

/** A waiting proposal `name` of `factory`, of one Workflow update. */
export const aProposal = (name: string, factory = 'acme'): Proposal => ({
  apiVersion: 'nemia/v1',
  kind: 'Proposal',
  metadata: { name, namespace: factory, creationTimestamp: '2026-11-01T00:00:00.000Z', resourceVersion: '' },
  spec: { objects: [{ kind: 'Workflow', metadata: { name: 'dev', resourceVersion: 'abc' }, spec: { steps: [] } }] },
  status: {
    phase: 'waiting',
    proposedBy: { agent: 'seldon' },
    changes: [{ resource: 'workflows', name: 'dev', verb: 'update', access: 'same' }],
    widens: false,
  },
});

/** What a walk reads of a proposal: its name, namespace, phase and whether it carries a version. */
const seen = (p: Proposal | undefined) =>
  p && { name: p.metadata.name, namespace: p.metadata.namespace, phase: p.status.phase, stamped: p.metadata.resourceVersion !== '' };

export const PROPOSAL_WALKS: Readonly<Record<string, readonly Walk[]>> = {
  'proposals.factories': [
    { name: 'a store with none lists none', walk: ({ door }) => done(door.proposals.factories()), says: [] },
    {
      name: 'each factory with a proposal, by name',
      walk: ({ door }) => {
        done(door.proposals.create(aProposal('seldon-aaaaa', 'zeta')));
        done(door.proposals.create(aProposal('seldon-bbbbb', 'acme')));
        return done(door.proposals.factories());
      },
      says: ['acme', 'zeta'],
    },
  ],
  'proposals.list': [
    { name: 'a factory with none lists none', walk: ({ door }) => done(door.proposals.list('acme')), says: [] },
    {
      name: "a factory's own, by name",
      walk: ({ door }) => {
        done(door.proposals.create(aProposal('seldon-bbbbb')));
        done(door.proposals.create(aProposal('iris-aaaaa')));
        done(door.proposals.create(aProposal('seldon-ccccc', 'other')));
        return done(door.proposals.list('acme')).map((p) => p.metadata.name);
      },
      says: ['iris-aaaaa', 'seldon-bbbbb'],
    },
    {
      name: 'REFUSED: a name that is no factory is Invalid',
      walk: ({ door }) => act(door.proposals.list('No Factory')),
      says: { refused: 'Invalid' },
    },
  ],
  'proposals.read': [
    { name: 'none where none is made', walk: ({ door }) => done(door.proposals.read('acme', 'seldon-aaaaa')), says: undefined },
    {
      name: 'the proposal made, stamped with its version',
      walk: ({ door }) => {
        done(door.proposals.create(aProposal('seldon-aaaaa')));
        return seen(done(door.proposals.read('acme', 'seldon-aaaaa')));
      },
      says: { name: 'seldon-aaaaa', namespace: 'acme', phase: 'waiting', stamped: true },
    },
    {
      name: 'REFUSED: a name that is no proposal is Invalid',
      walk: ({ door }) => act(door.proposals.read('acme', '../x')),
      says: { refused: 'Invalid' },
    },
  ],
  'proposals.create': [
    {
      name: 'made, and answered stamped',
      walk: ({ door }) => seen(done(door.proposals.create(aProposal('seldon-aaaaa')))),
      says: { name: 'seldon-aaaaa', namespace: 'acme', phase: 'waiting', stamped: true },
    },
    {
      name: 'REFUSED: a name taken is Conflict',
      walk: ({ door }) => {
        done(door.proposals.create(aProposal('seldon-aaaaa')));
        return act(door.proposals.create(aProposal('seldon-aaaaa')));
      },
      says: { refused: 'Conflict' },
    },
    {
      name: 'REFUSED: one that names no namespace is Invalid',
      walk: ({ door }) => {
        const { namespace: _none, ...metadata } = aProposal('seldon-aaaaa').metadata;
        return act(door.proposals.create({ ...aProposal('seldon-aaaaa'), metadata }));
      },
      says: { refused: 'Invalid' },
    },
    {
      name: 'REFUSED: one the model refuses is Invalid, and nothing is made',
      walk: ({ door }) => {
        const p = aProposal('seldon-aaaaa');
        const broken = { ...p, status: { ...p.status, phase: 'gone' } } as unknown as Proposal;
        return [act(door.proposals.create(broken)), done(door.proposals.read('acme', 'seldon-aaaaa'))];
      },
      says: [{ refused: 'Invalid' }, undefined],
    },
  ],
  'proposals.write': [
    {
      name: 'written back: its new phase, at a new version',
      walk: ({ door }) => {
        const made = done(door.proposals.create(aProposal('seldon-aaaaa')));
        const after = done(door.proposals.write({ ...made, status: { ...made.status, phase: 'declined' } }));
        const read = done(door.proposals.read('acme', 'seldon-aaaaa'));
        return { phase: read?.status.phase, moved: after.metadata.resourceVersion !== made.metadata.resourceVersion };
      },
      says: { phase: 'declined', moved: true },
    },
    {
      name: 'REFUSED: one that is not there is Missing',
      walk: ({ door }) => act(door.proposals.write(aProposal('seldon-aaaaa'))),
      says: { refused: 'Missing' },
    },
  ],
};
