/**
 * Who calls the api, from the token a request presents (`callerOf`): none is the person, one the store never minted is refused
 * `unknown-token`, one whose session's try is no longer the live one `session-ended`, and a live one its agent in its factory, run and
 * step. Pure: the store's read of the record and the judge of liveness are `caller.verb.ts`'s, afresh on each request.
 */
import type { CallerOfToken } from '../../contracts/session-caller.contract.ts';

export type { CallerOf, TokenRecord } from '../../contracts/session-caller.contract.ts';

/**
 * The caller a request is, from whether it presented a token, the record the store keeps of it (null: none) and whether its try is
 * live.
 */
export const callerOf: CallerOfToken = (presented, record, live) => {
  if (!presented) return { kind: 'person' };
  if (record === null) return { kind: 'refused', reason: 'unknown-token' };
  if (!live) return { kind: 'refused', reason: 'session-ended' };
  return { kind: 'agent', agent: record.agent, factory: record.factory, run: record.run, step: record.step };
};
