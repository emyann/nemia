/**
 * Who calls the api (`callerOf`), from the token a request presents and what its route needs of one (`TokenNeed`): none, where the route
 * needs none, is the person, and refused `token-required` where it needs one; one of the person's tokens is the person, whatever the
 * route needs; one the store never minted is refused `unknown-token`; a session's, to a route that needs the person's,
 * `person-token-required`; one whose session's try is no longer the live one `session-ended`; and a live one its agent in its factory,
 * run and step. Pure: the store's reads of the records and the judge of liveness are `caller.verb.ts`'s, afresh on each request.
 */
import type { CallerOfToken } from '../../contracts/session-caller.contract.ts';

export type { CallerOf, TokenRecord } from '../../contracts/session-caller.contract.ts';

/**
 * What a request's route needs of a token: `none`, a request with none being the person (a store not marked exposed); `token`, any live
 * one (every route of a store marked exposed); `person`, one of the person's (the MCP port, always).
 */
export type TokenNeed = 'none' | 'token' | 'person';

/**
 * The caller a request is, from whether it presented a token, what its route needs of one, whether the token is one of the person's, the
 * record the store keeps of it as a session's (null: none) and whether that session's try is live.
 */
export const callerOf: CallerOfToken = (presented, need, person, record, live) => {
  if (!presented) return need === 'none' ? { kind: 'person' } : { kind: 'refused', reason: 'token-required' };
  if (person) return { kind: 'person' };
  if (record === null) return { kind: 'refused', reason: 'unknown-token' };
  if (need === 'person') return { kind: 'refused', reason: 'person-token-required' };
  if (!live) return { kind: 'refused', reason: 'session-ended' };
  return { kind: 'agent', agent: record.agent, factory: record.factory, run: record.run, step: record.step };
};
