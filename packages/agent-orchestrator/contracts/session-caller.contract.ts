/**
 * Who calls the api (agent-orchestrator, src/token/token.ts, `callerOf`), from the token a request presents: a token per session the store
 * starts, minted as the session is filed and handed to it in its environment, bound to its run, step and try as a Kubernetes bound
 * ServiceAccount token is bound to its Pod. A request that presents none is the person (until the MCP intake gives other callers a
 * credential); a request that presents one is never the person: one the store never minted is refused, and so is one whose try is no
 * longer the step's live one (settled, superseded, or its run gone), read afresh on each request and remembered nowhere. Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * What the store keeps of a token it minted, found by the token's digest: the session's agent, its factory (null for a session of the
 * store's own, Nemia's, which works in every factory), and the run, step and try it was filed for (null for a session that is no run's).
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
  | { readonly kind: 'person' }
  | {
      readonly kind: 'agent';
      readonly agent: string;
      readonly factory: string | null;
      readonly run: string | null;
      readonly step: string | null;
    }
  | { readonly kind: 'refused'; readonly reason: 'unknown-token' | 'session-ended' };

const callerOfSpec = spec<(presented: boolean, record: TokenRecord | null, live: boolean) => CallerOf>({
  ensures: {
    noTokenIsThePerson: {
      description: 'A request that presents no token is the person',
      condition: ({ input: [presented], output }) => presented || output.kind === 'person',
    },
    aTokenIsNeverThePerson: {
      description: 'A request that presents a token is never the person, whatever the token',
      condition: ({ input: [presented], output }) => !presented || output.kind !== 'person',
    },
    unknownRefused: {
      description: 'A token the store never minted is refused',
      condition: ({ input: [presented, record], output }) =>
        !(presented && record === null) || (output.kind === 'refused' && output.reason === 'unknown-token'),
    },
    endedRefused: {
      description: "A token whose session's try is no longer live is refused",
      condition: ({ input: [presented, record, live], output }) =>
        !(presented && record !== null && !live) || (output.kind === 'refused' && output.reason === 'session-ended'),
    },
    liveIsItsAgent: {
      description: "A live session's token is its agent, in its factory, run and step",
      condition: ({ input: [presented, record, live], output }) =>
        !(presented && record !== null && live) ||
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
