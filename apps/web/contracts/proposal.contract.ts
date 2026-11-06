/**
 * What the board decides of a factory's proposals (apps/web, src/lib/proposals.ts): which of Approve and Decline a proposal offers in its
 * phase (`proposalOffers`), and the order the factory page lists them in (`proposalBefore`, the comparator its sort takes).
 *
 * The offers are the verbs' own refusals said ahead of a click (packages/agent-orchestrator/src/approval/approve.verb.ts): a proposal is
 * approved only while it waits, and declined while it waits or stands approved and not yet applied (one that applies at its run's end).
 * So the board never offers a button the api refuses, and offers each the api takes.
 *
 * The order puts what waits on the person first, then the newest of each kind first, by when it was made.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { ProposalPhase } from 'objects';

/** What a proposal offers the person: Approve, Decline, each where its verb takes it in the proposal's phase. */
export type ProposalOffers = { readonly approve: boolean; readonly decline: boolean };

const proposalOffersSpec = spec<(phase: ProposalPhase) => ProposalOffers>({
  ensures: {
    approveExactlyWhileWaiting: {
      description: 'Approve is offered exactly while the proposal waits on an approval',
      condition: ({ input: [phase], output }) => output.approve === (phase === 'waiting'),
    },
    declineExactlyBeforeItApplies: {
      description: 'Decline is offered exactly while the proposal waits, or stands approved and not yet applied',
      condition: ({ input: [phase], output }) => output.decline === (phase === 'waiting' || phase === 'approved'),
    },
  },
});
export type ProposalOffersOf = Implementation<typeof proposalOffersSpec>;

/** What the order reads of a proposal: whether it waits on the person, and when it was made, in milliseconds since the epoch. */
export type ProposalOrderFacts = { readonly waiting: boolean; readonly at: number };

/** Whether `a` and `b` are of one kind: both waiting, or neither. */
const sameKind = (a: ProposalOrderFacts, b: ProposalOrderFacts): boolean => a.waiting === b.waiting;

const proposalBeforeSpec = spec<(a: ProposalOrderFacts, b: ProposalOrderFacts) => number>({
  requires: ({ input: [a, b] }) => a.at >= 0 && b.at >= 0,
  ensures: {
    waitingFirst: {
      description: 'A proposal that waits on the person is listed before one that does not',
      condition: ({ input: [a, b], output }) => !(a.waiting && !b.waiting) || output < 0,
    },
    restAfterWaiting: {
      description: 'A proposal that does not wait is listed after one that does',
      condition: ({ input: [a, b], output }) => !(!a.waiting && b.waiting) || output > 0,
    },
    newerFirst: {
      description: 'Of two of one kind, the one made later is listed first',
      condition: ({ input: [a, b], output }) => !(sameKind(a, b) && a.at > b.at) || output < 0,
    },
    olderAfter: {
      description: 'Of two of one kind, the one made earlier is listed after',
      condition: ({ input: [a, b], output }) => !(sameKind(a, b) && a.at < b.at) || output > 0,
    },
    evenWhereNothingTells: {
      description: 'Two of one kind made at the same moment are even, so the sort keeps the order the api listed them in',
      condition: ({ input: [a, b], output }) => !(sameKind(a, b) && a.at === b.at) || output === 0,
    },
  },
});
export type ProposalBefore = Implementation<typeof proposalBeforeSpec>;
