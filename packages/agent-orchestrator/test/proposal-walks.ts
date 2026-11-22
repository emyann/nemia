/**
 * The Proposal door's contract (`ProposalDoor`, `src/proposal/proposal.store.ts`), as walks (`door-walks.ts`, awaited by `walkedOn`):
 * every method's rows, run on the rooted keyspace and on the memory stand-in by `src/proposal/proposal.store.test.ts`. A proposal made
 * is read back at the revision of its record, listed by name in its factory alone, and its factory listed; one written back is at a
 * greater revision, and a list's revision is at least each of its items'. And the door's refusals: a name taken (`Conflict`), one
 * written back that is not there (`Missing`), one written back from a revision it is no longer at (`Conflict`), a name that is no
 * proposal's or no factory's and a proposal that names no namespace (`Invalid`), one the model's `Proposal` refuses (`Invalid`), and one
 * larger than a record holds (`Invalid`), nothing written.
 */
import type { Proposal } from 'objects';
import type { AsyncDoorWalk } from './door-walks.ts';
import { acted, settled } from './door-walks.ts';
import type { ProposalDoorShape } from '../src/proposal/proposal.store.ts';

type Walk = AsyncDoorWalk<ProposalDoorShape>;

/** A waiting proposal `name` of `factory`, of one Workflow update. */
export const aProposal = (name: string, factory = 'acme') =>
  ({
    apiVersion: 'nemia/v1',
    kind: 'Proposal',
    metadata: { name, namespace: factory, creationTimestamp: '2026-11-01T00:00:00.000Z', resourceVersion: '' },
    spec: { objects: [{ kind: 'Workflow', metadata: { name: 'dev', resourceVersion: 'abc' }, spec: { steps: [] } }] },
    status: {
      phase: 'waiting',
      proposedBy: { agent: 'implementer' },
      changes: [{ resource: 'workflows', name: 'dev', verb: 'update', access: 'same' }],
      widens: false,
    },
  }) satisfies Proposal;

/** What a walk reads of a proposal: its name, namespace, phase and whether it carries a revision. */
const seen = (p: Proposal | undefined) =>
  p && {
    name: p.metadata.name,
    namespace: p.metadata.namespace,
    phase: p.status.phase,
    revised: /^[1-9][0-9]*$/.test(p.metadata.resourceVersion),
  };

/** A proposal's revision, as a number. */
const revisionOf = (p: Proposal) => Number(p.metadata.resourceVersion);

export const PROPOSAL_WALKS: Readonly<Record<string, readonly Walk[]>> = {
  'proposals.factories': [
    { name: 'a store with none lists none', walk: ({ door }) => settled(door.proposals.factories()), says: [] },
    {
      name: 'each factory with a proposal, by name',
      walk: async ({ door }) => {
        await settled(door.proposals.create(aProposal('implementer-aaaaa', 'zeta')));
        await settled(door.proposals.create(aProposal('implementer-bbbbb', 'acme')));
        return settled(door.proposals.factories());
      },
      says: ['acme', 'zeta'],
    },
  ],
  'proposals.list': [
    { name: 'a factory with none lists none', walk: ({ door }) => settled(door.proposals.list('acme')), says: [] },
    {
      name: "a factory's own, by name",
      walk: async ({ door }) => {
        await settled(door.proposals.create(aProposal('implementer-bbbbb')));
        await settled(door.proposals.create(aProposal('shipper-aaaaa')));
        await settled(door.proposals.create(aProposal('implementer-ccccc', 'other')));
        return (await settled(door.proposals.list('acme'))).map((p) => p.metadata.name);
      },
      says: ['implementer-bbbbb', 'shipper-aaaaa'],
    },
    {
      name: 'REFUSED: a name that is no factory is Invalid',
      walk: ({ door }) => acted(door.proposals.list('No Factory')),
      says: { refused: 'Invalid' },
    },
  ],
  'proposals.listed': [
    {
      name: "a factory's own, at a revision at least each item's",
      walk: async ({ door }) => {
        await settled(door.proposals.create(aProposal('implementer-bbbbb')));
        const made = await settled(door.proposals.create(aProposal('shipper-aaaaa')));
        await settled(door.proposals.write({ ...made, status: { ...made.status, phase: 'declined' } }));
        const { items, revision } = await settled(door.proposals.listed('acme'));
        return { names: items.map((p) => p.metadata.name), atLeastEach: items.every((p) => revision >= revisionOf(p)) };
      },
      says: { names: ['implementer-bbbbb', 'shipper-aaaaa'], atLeastEach: true },
    },
    {
      name: 'REFUSED: a name that is no factory is Invalid',
      walk: ({ door }) => acted(door.proposals.listed('No Factory')),
      says: { refused: 'Invalid' },
    },
  ],
  'proposals.read': [
    { name: 'none where none is made', walk: ({ door }) => settled(door.proposals.read('acme', 'implementer-aaaaa')), says: undefined },
    {
      name: 'the proposal made, at its revision',
      walk: async ({ door }) => {
        await settled(door.proposals.create(aProposal('implementer-aaaaa')));
        return seen(await settled(door.proposals.read('acme', 'implementer-aaaaa')));
      },
      says: { name: 'implementer-aaaaa', namespace: 'acme', phase: 'waiting', revised: true },
    },
    {
      name: 'REFUSED: a name that is no proposal is Invalid',
      walk: ({ door }) => acted(door.proposals.read('acme', '../x')),
      says: { refused: 'Invalid' },
    },
  ],
  'proposals.create': [
    {
      name: 'made, and answered at its revision',
      walk: async ({ door }) => seen(await settled(door.proposals.create(aProposal('implementer-aaaaa')))),
      says: { name: 'implementer-aaaaa', namespace: 'acme', phase: 'waiting', revised: true },
    },
    {
      name: 'REFUSED: a name taken is Conflict',
      walk: async ({ door }) => {
        await settled(door.proposals.create(aProposal('implementer-aaaaa')));
        return acted(door.proposals.create(aProposal('implementer-aaaaa')));
      },
      says: { refused: 'Conflict' },
    },
    {
      name: 'REFUSED: one that names no namespace is Invalid',
      walk: ({ door }) => {
        const { namespace: _none, ...metadata } = aProposal('implementer-aaaaa').metadata;
        return acted(door.proposals.create({ ...aProposal('implementer-aaaaa'), metadata }));
      },
      says: { refused: 'Invalid' },
    },
    {
      name: 'REFUSED: one the model refuses is Invalid, and nothing is made',
      walk: async ({ door }) => {
        const p = aProposal('implementer-aaaaa');
        const broken = { ...p, status: { ...p.status, phase: 'gone' } } as unknown as Proposal;
        return [await acted(door.proposals.create(broken)), await settled(door.proposals.read('acme', 'implementer-aaaaa'))];
      },
      says: [{ refused: 'Invalid' }, undefined],
    },
    {
      name: 'REFUSED: one larger than a record holds (1.5 MiB) is Invalid, and nothing is made',
      walk: async ({ door }) => {
        const p = aProposal('implementer-aaaaa');
        const large = { ...p, status: { ...p.status, message: 'x'.repeat(1_572_864) } } satisfies Proposal;
        return [await acted(door.proposals.create(large)), await settled(door.proposals.read('acme', 'implementer-aaaaa'))];
      },
      says: [{ refused: 'Invalid' }, undefined],
    },
  ],
  'proposals.write': [
    {
      name: 'written back: its new phase, at a greater revision',
      walk: async ({ door }) => {
        const made = await settled(door.proposals.create(aProposal('implementer-aaaaa')));
        const after = await settled(door.proposals.write({ ...made, status: { ...made.status, phase: 'declined' } }));
        const read = await settled(door.proposals.read('acme', 'implementer-aaaaa'));
        return {
          phase: read?.status.phase,
          greater: revisionOf(after) > revisionOf(made),
          read: read?.metadata.resourceVersion === after.metadata.resourceVersion,
        };
      },
      says: { phase: 'declined', greater: true, read: true },
    },
    {
      name: 'REFUSED: one written back from a revision it is no longer at is Conflict, and what was written stands',
      walk: async ({ door }) => {
        const made = await settled(door.proposals.create(aProposal('implementer-aaaaa')));
        await settled(door.proposals.write({ ...made, status: { ...made.status, phase: 'declined' } }));
        const stale = await acted(
          door.proposals.write({
            ...made,
            status: { ...made.status, phase: 'approved', approvedBy: { by: 'person', at: '2026-11-02T00:00:00.000Z' } },
          }),
        );
        return [stale, (await settled(door.proposals.read('acme', 'implementer-aaaaa')))?.status.phase];
      },
      says: [{ refused: 'Conflict' }, 'declined'],
    },
    {
      name: 'one that names no revision overwrites',
      walk: async ({ door }) => {
        const made = await settled(door.proposals.create(aProposal('implementer-aaaaa')));
        await settled(door.proposals.write({ ...made, status: { ...made.status, phase: 'declined' } }));
        const blind = { ...made, metadata: { ...made.metadata, resourceVersion: '' } };
        await settled(door.proposals.write({ ...blind, status: { ...made.status, phase: 'failed' } }));
        return (await settled(door.proposals.read('acme', 'implementer-aaaaa')))?.status.phase;
      },
      says: 'failed',
    },
    {
      name: 'REFUSED: one that is not there is Missing',
      walk: ({ door }) => acted(door.proposals.write(aProposal('implementer-aaaaa'))),
      says: { refused: 'Missing' },
    },
  ],
};
