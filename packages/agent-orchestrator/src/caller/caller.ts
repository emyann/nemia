/**
 * Who calls a proposal's program: the contract's `Caller` (`contracts/proposal-approval.contract.ts`), and, for an agent's session that is
 * a run's, its run and step, and for an agent's standing token its narrowing. The api obtains it from the token a request presents; a
 * program here only takes it. And the actor a write records of its caller (`actorOf`), objects' `Actor`, which the board shows.
 */
import type { Actor } from 'objects';
import type { Caller } from '../../contracts/proposal-approval.contract.ts';
import type { FloorNarrowing } from '../../contracts/token-floor.contract.ts';

export type { Caller } from '../../contracts/proposal-approval.contract.ts';

/**
 * A caller, with the run and the step of its session where it is a run's, and the narrowing of the standing token it presented where an
 * agent presented one.
 */
export type ProposalCaller = Caller & {
  readonly run?: string | null;
  readonly step?: string | null;
  readonly narrowed?: FloorNarrowing | null;
};

/** The person, as an in-process program calls: no token presented, so under no token's name. */
export const PERSON: ProposalCaller = { kind: 'person' };

/** The name a caller's proposals are minted under: its agent, or `person`. */
export const proposerOf = (caller: ProposalCaller): string => (caller.kind === 'agent' ? caller.agent : 'person');

/**
 * The actor a write by `caller` records: the person, under the name of the token presented where one was; an agent under its name, with
 * the standing token's name where it presented one, else its session's run and step where it has them. A key with no value is left out.
 */
export function actorOf(caller: ProposalCaller): Actor {
  const token = caller.token ?? undefined;
  if (caller.kind === 'person') return token === undefined ? { kind: 'person' } : { kind: 'person', token };
  const run = caller.run ?? undefined;
  const step = caller.step ?? undefined;
  return {
    kind: 'agent',
    agent: caller.agent,
    ...(token === undefined ? {} : { token }),
    ...(token === undefined && run !== undefined ? { run } : {}),
    ...(token === undefined && step !== undefined ? { step } : {}),
  };
}
