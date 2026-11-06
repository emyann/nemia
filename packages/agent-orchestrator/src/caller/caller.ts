/**
 * Who calls a proposal's program: the contract's `Caller` (`contracts/proposal-approval.contract.ts`), and, for an agent's session that is
 * a run's, its run and step. The api obtains it from the session's token; a program here only takes it.
 */
import type { Caller } from '../../contracts/proposal-approval.contract.ts';

export type { Caller } from '../../contracts/proposal-approval.contract.ts';

/** A caller, with the run and the step of its session where it is a run's. */
export type ProposalCaller = Caller & { readonly run?: string | null; readonly step?: string | null };

/** The person: a caller with no session's token. */
export const PERSON: ProposalCaller = { kind: 'person' };

/** The name a caller's proposals are minted under: its agent, or `person`. */
export const proposerOf = (caller: ProposalCaller): string => (caller.kind === 'agent' ? caller.agent : 'person');
