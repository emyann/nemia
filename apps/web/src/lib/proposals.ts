/**
 * What the board decides of a factory's proposals: which of Approve and Decline one offers in its phase (`proposalOffers`) and the order
 * the factory page lists them in (`proposalBefore`, `proposalsInOrder`), both proved by `contracts/proposal.contract.ts`; and the
 * resources a delegation may grant (`DELEGABLE`). Pure.
 */
import { PROPOSABLE_KINDS, RESOURCE_PLURALS, type Proposal, type ProposalPhase } from 'objects';
import type {
  ProposalBefore,
  ProposalOffers,
  ProposalOffersOf,
  ProposalOrderFacts,
} from '../../contracts/proposal.contract.ts';

export type { ProposalOffers, ProposalOrderFacts } from '../../contracts/proposal.contract.ts';

/** Approve while it waits; Decline while it waits or stands approved and not yet applied (the verbs' own refusals, said before a click). */
export const proposalOffers: ProposalOffersOf = (phase: ProposalPhase): ProposalOffers => ({
  approve: phase === 'waiting',
  decline: phase === 'waiting' || phase === 'approved',
});

/** What waits on the person first, then the newer of one kind first; even where nothing tells them apart. */
export const proposalBefore: ProposalBefore = (a: ProposalOrderFacts, b: ProposalOrderFacts): number => {
  if (a.waiting !== b.waiting) return a.waiting ? -1 : 1;
  if (a.at === b.at) return 0;
  return a.at > b.at ? -1 : 1;
};

/** What the order reads of `proposal`: whether it waits, and when it was made (none read as the oldest). */
const orderFactsOf = (proposal: Proposal): ProposalOrderFacts => {
  const at = Date.parse(proposal.metadata.creationTimestamp);
  return { waiting: proposal.status.phase === 'waiting', at: Number.isFinite(at) && at >= 0 ? at : 0 };
};

/** `list` in the order the factory page lists it (`proposalBefore`), a new array; the api's order kept where nothing tells two apart. */
export const proposalsInOrder = (list: readonly Proposal[]): Proposal[] =>
  [...list].sort((a, b) => proposalBefore(orderFactsOf(a), orderFactsOf(b)));

/** The resources a delegation may grant: each kind a proposal may change, by its plural, as the orchestrator computes them. */
export const DELEGABLE: readonly string[] = PROPOSABLE_KINDS.map((kind) => RESOURCE_PLURALS[kind]);
