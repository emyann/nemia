/**
 * What the board decides of a factory's proposals: which of Approve and Decline one offers in its phase (`proposalOffers`) and the order
 * the factory page lists them in (`proposalBefore`, `proposalsInOrder`), both proved by `contracts/proposal.contract.ts`; and the
 * resources a delegation may grant (`DELEGABLE`). Pure.
 */
import { PROPOSABLE_KINDS, RESOURCE_PLURALS, type ProposalPhase } from 'objects';
import type { ProposalBefore, ProposalOffersOf, ProposalOrderFacts } from '../../contracts/proposal.contract.ts';

export type { ProposalOffers } from '../../contracts/proposal.contract.ts';

/**
 * Approve while it waits; Decline while it waits or stands approved and not yet applied (the verbs' own refusals, said before a click).
 * @param phase The proposal's phase.
 */
export const proposalOffers: ProposalOffersOf = (phase: ProposalPhase) => ({
  approve: phase === 'waiting',
  decline: phase === 'waiting' || phase === 'approved',
});

/** What waits on the person first, then the newer of one kind first; even where nothing tells them apart. */
const proposalBefore: ProposalBefore = (a: ProposalOrderFacts, b: ProposalOrderFacts) => {
  if (a.waiting !== b.waiting) return a.waiting ? -1 : 1;
  if (a.at === b.at) return 0;
  return a.at > b.at ? -1 : 1;
};

/** What the order is read off: a proposal's phase and when it was made, as its list's row says them. */
type Ordered = { readonly phase: ProposalPhase; readonly creationTimestamp: string };

/** What the order reads of `proposal`: whether it waits, and when it was made (none read as the oldest). */
const orderFactsOf = (proposal: Ordered) => {
  const at = Date.parse(proposal.creationTimestamp);
  return { waiting: proposal.phase === 'waiting', at: Number.isFinite(at) && at >= 0 ? at : 0 };
};

/**
 * `list` in the order the factory page lists it (`proposalBefore`), a new array; the api's order kept where nothing tells two apart.
 * @param list The factory's proposals, as the rows of their list (`ProposalRow`), in the api's order.
 */
export const proposalsInOrder = <P extends Ordered>(list: readonly P[]) =>
  [...list].sort((a, b) => proposalBefore(orderFactsOf(a), orderFactsOf(b)));

/** The resources a delegation may grant: each kind a proposal may change, by its plural, as the orchestrator computes them. */
export const DELEGABLE: readonly string[] = PROPOSABLE_KINDS.map((kind) => RESOURCE_PLURALS[kind]);

/**
 * The hue a proposal's *Widens access* mark and its widening changes are drawn in: `yours` while it waits on the person, who judges it,
 * and grey once it is judged, since `yours` says only what waits on them.
 * @param phase The proposal's phase.
 */
export const widensHue = (phase: ProposalPhase) => (phase === 'waiting' ? 'yours' : 'grey');
