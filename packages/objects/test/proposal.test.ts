/**
 * The Proposal and the Delegation (`src/proposal.ts`, `src/delegation.ts`): each and a page of each as the Api's endpoints answer them,
 * every key kept, one missing every optional key read, and their writes as the Api takes them; and a phase, a verb or a kind outside
 * their closed words refused at decode.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, Delegation, Proposal } from 'objects';
import { answered, taken } from './served.ts';

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

test("the Api's get answers a proposal, its list a page of them, its create takes the spec; another kind refused", () => {
  assert.deepEqual(answered('proposals', 'get', applied), applied);
  assert.deepEqual(answered('proposals', 'get', waiting), waiting);
  const page = { apiVersion: API_VERSION, kind: 'ProposalList', metadata: {}, items: [applied, waiting] };
  assert.deepEqual(answered('proposals', 'list', page), page);
  assert.deepEqual(taken('proposals', 'create', applied.spec), applied.spec);
  assert.equal(answered('proposals', 'get', delegation), undefined);
  assert.equal(answered('proposals', 'list', { ...page, kind: 'DelegationList' }), undefined);
  assert.equal(taken('proposals', 'create', delegation.spec), undefined);
});

test('a phase, a verb or a kind outside their closed words is refused at decode', () => {
  const decode = Schema.decodeUnknownSync(Proposal);
  assert.throws(() => decode({ ...waiting, status: { ...waiting.status, phase: 'merged' } }));
  assert.throws(() => decode({ ...applied, spec: { objects: [{ kind: 'Agent', metadata: { name: 'a' }, verb: 'patch' }] } }));
  assert.throws(() => decode({ ...applied, spec: { objects: [{ kind: 'Volume', metadata: { name: 'v' } }] } }));
});

test("the Api's get answers a delegation, its list a page of them, its put takes the write; a verb outside the closed words is refused", () => {
  assert.deepEqual(answered('delegations', 'get', delegation), delegation);
  const page = { apiVersion: API_VERSION, kind: 'DelegationList', metadata: {}, items: [delegation] };
  assert.deepEqual(answered('delegations', 'list', page), page);
  assert.deepEqual(taken('delegations', 'put', delegation.spec), delegation.spec);
  assert.equal(answered('delegations', 'get', applied), undefined);
  assert.equal(taken('delegations', 'put', applied.spec), undefined);
  assert.throws(() =>
    Schema.decodeUnknownSync(Delegation)({ ...delegation, spec: { rules: [{ resources: [], resourceNames: [], verbs: ['get'] }] } }),
  );
});
