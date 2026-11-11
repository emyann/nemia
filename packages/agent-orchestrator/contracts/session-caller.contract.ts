/**
 * Who calls the api (agent-orchestrator, src/token/token.ts, `callerOf`), from the token a request presents and what the route it asks
 * needs of one. Two kinds of token: a session's, minted as the session is filed and handed to it in its environment, bound to its run,
 * step and try as a Kubernetes bound ServiceAccount token is bound to its Pod; and a person's, named, minted by the person at the store's
 * machine (`nemia token add`), printed once, kept as its digest alone and revoked by its name — every one of them is the person. What a
 * route needs (`TokenNeed`): nothing, where a request with no token is still the person (a store not marked exposed); a token, any
 * live one (every route of a store marked exposed); or a person's token (the MCP port, always). Read afresh on each request and
 * remembered nowhere. Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { CallerKind, TokenRefusal } from 'objects';
import type { TokenNeed } from '../src/token/token.ts';

/**
 * What the store keeps of a session token it minted, found by the token's digest: the session's agent, its factory (null for a session
 * of the store's own, Nemia's, which works in every factory), and the run, step and try it was filed for (null for a session that is no
 * run's).
 */
export type TokenRecord = {
  readonly agent: string;
  readonly factory: string | null;
  readonly run: string | null;
  readonly step: string | null;
  readonly attempt: number;
};

/** The caller a request is: the person, an agent's live session, or refused with its reason. */
export type CallerOf =
  | { readonly kind: Extract<CallerKind, 'person'> }
  | {
      readonly kind: Extract<CallerKind, 'agent'>;
      readonly agent: string;
      readonly factory: string | null;
      readonly run: string | null;
      readonly step: string | null;
    }
  | { readonly kind: 'refused'; readonly reason: TokenRefusal };

/** Whether `output` is a refusal for `reason`. */
const refusedFor = (output: CallerOf, reason: TokenRefusal): boolean => output.kind === 'refused' && output.reason === reason;

/** A token presented that is no person's: a session's, or one the store never minted. */
const sessionSide = (presented: boolean, person: boolean): boolean => presented && !person;

const callerOfSpec = spec<(presented: boolean, need: TokenNeed, person: boolean, record: TokenRecord | null, live: boolean) => CallerOf>({
  requires: ({ input: [presented, , person] }) => presented || !person,
  ensures: {
    noTokenIsThePersonWhereNoneIsNeeded: {
      description: 'A request that presents no token, to a route that needs none, is the person',
      condition: ({ input: [presented, need], output }) => presented || need !== 'none' || output.kind === 'person',
    },
    noTokenIsRefusedWhereOneIsNeeded: {
      description: 'A request that presents no token, to a route that needs one, is refused for it',
      condition: ({ input: [presented, need], output }) => presented || need === 'none' || refusedFor(output, 'token-required'),
    },
    aPersonsTokenIsThePerson: {
      description: "A request that presents one of the person's tokens is the person, whatever the route needs",
      condition: ({ input: [presented, , person], output }) => !(presented && person) || output.kind === 'person',
    },
    aSessionTokenIsNeverThePerson: {
      description: "A request that presents a token that is no person's is never the person",
      condition: ({ input: [presented, , person], output }) => !sessionSide(presented, person) || output.kind !== 'person',
    },
    unknownRefused: {
      description: 'A token the store never minted is refused as unknown, whatever the route needs',
      condition: ({ input: [presented, , person, record], output }) =>
        !(sessionSide(presented, person) && record === null) || refusedFor(output, 'unknown-token'),
    },
    aSessionTokenIsRefusedWhereThePersonsIsNeeded: {
      description: "A session's token, to a route that needs the person's, is refused for it",
      condition: ({ input: [presented, need, person, record], output }) =>
        !(sessionSide(presented, person) && record !== null && need === 'person') || refusedFor(output, 'person-token-required'),
    },
    endedRefused: {
      description: "A session's token whose try is no longer live is refused, where the route takes a session's",
      condition: ({ input: [presented, need, person, record, live], output }) =>
        !(sessionSide(presented, person) && record !== null && need !== 'person' && !live) || refusedFor(output, 'session-ended'),
    },
    liveIsItsAgent: {
      description: "A live session's token, where the route takes a session's, is its agent, in its factory, run and step",
      condition: ({ input: [presented, need, person, record, live], output }) =>
        !(sessionSide(presented, person) && record !== null && need !== 'person' && live) ||
        (output.kind === 'agent' &&
          output.agent === record.agent &&
          output.factory === record.factory &&
          output.run === record.run &&
          output.step === record.step),
    },
  },
});

/** `callerOf`'s type, which `src/token/token.ts` takes. */
export type CallerOfToken = Implementation<typeof callerOfSpec>;
