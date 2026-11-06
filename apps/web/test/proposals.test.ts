/**
 * What the board reads and decides of a factory's proposals, pure: a proposal's board address read back (`proposalLinkOf`), the order the
 * factory page lists them in (`proposalsInOrder`), the resources a delegation may grant (`DELEGABLE`) and a word for every phase
 * (`PROPOSAL_WORDS`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROPOSABLE_KINDS, PROPOSAL_PHASES, RESOURCE_PLURALS, type Proposal, type ProposalPhase } from 'objects';
import { proposalLinkOf } from '../src/lib/proposalLink.ts';
import { DELEGABLE, proposalsInOrder, widensHue } from '../src/lib/proposals.ts';
import { PROPOSAL_WORDS } from '../src/lib/words.ts';

/** A proposal named `name` in `phase`, made at `at`. */
const proposal = (name: string, phase: ProposalPhase, at: string): Proposal => ({
  apiVersion: 'nemia/v1',
  kind: 'Proposal',
  metadata: { name, namespace: 'acme', resourceVersion: '1', creationTimestamp: at },
  spec: { objects: [] },
  status: { phase, proposedBy: { agent: 'nemia' }, changes: [], widens: false },
});

test('a proposal link is read as its factory and its name, each decoded', () => {
  assert.deepEqual(proposalLinkOf('/factories/acme/proposals/nemia-ab12c'), { factory: 'acme', name: 'nemia-ab12c' });
  assert.deepEqual(proposalLinkOf('/factories/acme/proposals/nemia%2Dab12c'), { factory: 'acme', name: 'nemia-ab12c' });
});

test('every near miss of a proposal link is no link', () => {
  for (const href of [
    '/factories/acme/proposals',
    '/factories/acme/proposals/x/y',
    '/factories/acme/proposals/x?y=1',
    '/factories//proposals/x',
    '/factories/acme/proposals/%E0%A4%A',
    '/proposals/x',
  ])
    assert.equal(proposalLinkOf(href), undefined, href);
});

test('the factory lists what waits first, the newer of each kind first', () => {
  const list = [
    proposal('old-applied', 'applied', '2026-11-01T00:00:00Z'),
    proposal('old-waiting', 'waiting', '2026-11-02T00:00:00Z'),
    proposal('new-applied', 'applied', '2026-11-05T00:00:00Z'),
    proposal('new-waiting', 'waiting', '2026-11-04T00:00:00Z'),
  ];
  assert.deepEqual(
    proposalsInOrder(list).map((p) => p.metadata.name),
    ['new-waiting', 'old-waiting', 'new-applied', 'old-applied'],
  );
});

test('a delegation may grant every kind a proposal changes, by its plural', () => {
  assert.deepEqual(
    DELEGABLE,
    PROPOSABLE_KINDS.map((kind) => RESOURCE_PLURALS[kind]),
  );
  assert.ok(DELEGABLE.includes('hires'));
});

test('every phase of a proposal has its word', () => {
  for (const phase of PROPOSAL_PHASES) assert.ok(PROPOSAL_WORDS[phase].word, phase);
});

test('a widening proposal is drawn in the colour of what waits on you while it waits, and grey once judged', () => {
  assert.equal(widensHue('waiting'), 'yours');
  for (const phase of PROPOSAL_PHASES.filter((p) => p !== 'waiting')) assert.equal(widensHue(phase), 'grey', phase);
});
