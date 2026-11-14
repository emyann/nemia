/**
 * Who calls the api (`callerOf`), from the token a request presents and what its route needs of one (`TokenNeed`): none, where the route
 * needs none (an in-process program, which presents none), is the person under no token's name, and refused `token-required` where it
 * needs one; a standing token, one the person minted, is its holder — the person under the token's name, or an agent under its own, in
 * the factory the token is bound to, with its narrowing — whatever the route needs; one the store never minted is refused
 * `unknown-token`; a session's, to a route that needs a standing one, `person-token-required`; one whose session's try is no longer the
 * live one `session-ended`; and a live one its agent in its factory, run and step. Pure: the store's reads of the records and the judge
 * of liveness are `caller.verb.ts`'s, afresh on each request.
 */
import type { CallerOfToken } from '../../contracts/session-caller.contract.ts';

export type { CallerOf, StandingRecord, TokenHolder, TokenRecord } from '../../contracts/session-caller.contract.ts';

/**
 * What a request's route needs of a token: `none`, a request with none being the person (an in-process program; no route the api answers);
 * `token`, any live one (every route the api answers); `standing`, one the person minted, held by the person or an agent (the MCP port).
 */
export type TokenNeed = 'none' | 'token' | 'standing';

/**
 * The caller a request is, from whether it presented a token, what its route needs of one, the standing record the store keeps of it
 * (null: none), the record the store keeps of it as a session's (null: none) and whether that session's try is live.
 */
export const callerOf: CallerOfToken = (presented, need, standing, record, live) => {
  if (!presented) return need === 'none' ? { kind: 'person', token: null } : { kind: 'refused', reason: 'token-required' };
  if (standing !== null) {
    const holder = standing.holder;
    if (holder.kind === 'person') return { kind: 'person', token: standing.name };
    return {
      kind: 'agent',
      agent: holder.agent,
      factory: holder.factory,
      run: null,
      step: null,
      token: standing.name,
      narrowed: holder.narrowed,
    };
  }
  if (record === null) return { kind: 'refused', reason: 'unknown-token' };
  if (need === 'standing') return { kind: 'refused', reason: 'person-token-required' };
  if (!live) return { kind: 'refused', reason: 'session-ended' };
  return {
    kind: 'agent',
    agent: record.agent,
    factory: record.factory,
    run: record.run,
    step: record.step,
    token: null,
    narrowed: null,
  };
};
