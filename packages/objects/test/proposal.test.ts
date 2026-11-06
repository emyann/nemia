/**
 * The Proposal and the Delegation (`src/proposal.ts`, `src/delegation.ts`): each and a page of each decoded from JSON and encoded back
 * equal, one missing every optional key read; and a phase, a verb or a kind outside their closed words refused at decode.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, Delegation, DelegationList, DelegationWrite, Proposal, ProposalCreate, ProposalList } from 'objects';

const meta = { name: 'p-7f3a', namespace: 'mill', creationTimestamp: '2026-11-05T00:00:00.000Z', resourceVersion: 'r1' };

const applied = {
  apiVersion: API_VERSION,
  kind: 'Proposal',
  metadata: meta,
  spec: {
    objects: [
      {
        apiVersion: API_VERSION,
        kind: 'Agent',
        metadata: { name: 'reviewer', namespace: 'mill', resourceVersion: 'a4' },
        spec: { allowedTools: ['Read', 'Bash(nemia propose *)'] },
      },
      { kind: 'Workflow', metadata: { name: 'old' }, verb: 'delete' },
    ],
    applyAt: 'run-end',
    why: 'review needs to propose',
  },
  status: {
    phase: 'applied',
    proposedBy: { agent: 'designer', run: 'build-x-1abc', step: 'design' },
    approvedBy: { by: 'person', at: '2026-11-05T01:00:00.000Z' },
    changes: [
      { resource: 'agents', name: 'reviewer', verb: 'update', access: 'widens' },
      { resource: 'workflows', name: 'old', verb: 'delete', access: 'narrows' },
    ],
    widens: true,
    before: [{ kind: 'Agent', metadata: { name: 'reviewer', resourceVersion: 'a4' }, spec: { allowedTools: ['Read'] } }],
    revisions: ['agent reviewer 5'],
    message: 'applied',
  },
} as const;

/** The person's proposal, waiting: no run, no approval, nothing before. */
const waiting = {
  apiVersion: API_VERSION,
  kind: 'Proposal',
  metadata: meta,
  spec: { objects: [{ kind: 'Hire', metadata: { name: 'build.review' }, spec: { agent: 'reviewer' } }] },
  status: { phase: 'waiting', proposedBy: {}, changes: [], widens: false },
} as const;

const delegation = {
  apiVersion: API_VERSION,
  kind: 'Delegation',
  metadata: { ...meta, name: 'reviewer' },
  spec: { rules: [{ resources: ['workflows'], resourceNames: [], verbs: ['update'] }] },
} as const;

const roundTrip = <S extends Schema.Top>(schema: S, value: unknown) => {
  const decoded = Schema.decodeUnknownSync(schema as never)(value);
  assert.deepEqual(Schema.encodeSync(schema as never)(decoded), value);
};

test('a proposal and a page of them decode from JSON and encode back equal, one missing every optional key read', () => {
  roundTrip(Proposal, applied);
  roundTrip(Proposal, waiting);
  roundTrip(ProposalList, { apiVersion: API_VERSION, kind: 'ProposalList', metadata: {}, items: [applied, waiting] });
  roundTrip(ProposalCreate, applied.spec);
});

test('a phase, a verb or a kind outside their closed words is refused at decode', () => {
  const decode = Schema.decodeUnknownSync(Proposal);
  assert.throws(() => decode({ ...waiting, status: { ...waiting.status, phase: 'merged' } }));
  assert.throws(() => decode({ ...applied, spec: { objects: [{ kind: 'Agent', metadata: { name: 'a' }, verb: 'patch' }] } }));
  assert.throws(() => decode({ ...applied, spec: { objects: [{ kind: 'Volume', metadata: { name: 'v' } }] } }));
});

test('a delegation, a page of them and its write decode and encode back equal; a verb outside the closed words is refused', () => {
  roundTrip(Delegation, delegation);
  roundTrip(DelegationList, { apiVersion: API_VERSION, kind: 'DelegationList', metadata: {}, items: [delegation] });
  roundTrip(DelegationWrite, delegation.spec);
  assert.throws(() =>
    Schema.decodeUnknownSync(Delegation)({ ...delegation, spec: { rules: [{ resources: [], resourceNames: [], verbs: ['get'] }] } }),
  );
});
