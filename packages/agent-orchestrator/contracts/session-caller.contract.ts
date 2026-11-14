/**
 * Who calls the api (agent-orchestrator, src/token/token.ts, `callerOf`), from the token a request presents and what the route it asks
 * needs of one. Two kinds of token: a session's, minted as the session is filed and handed to it in its environment, bound to its run,
 * step and try as a Kubernetes bound ServiceAccount token is bound to its Pod; and a standing one, named, minted by the person through
 * the api (`POST /api/tokens`), printed once, kept as its digest alone and retired by its name, which says its holder: the person, under
 * the name of the device it is for (`laptop`, `board`), or an agent, under the agent's own name (`operator`), bound to one factory or
 * store-wide and maybe narrowed. A record minted before holders were said reads as the person's. What a route needs (`TokenNeed`):
 * nothing, which the api's routes no longer answer (an in-process program alone asks with none, and is the person); a token, any live
 * one (every route the api answers); or a standing one (the MCP port, always: never a session's). Read afresh on each request and
 * remembered nowhere. Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { CallerKind, TokenRefusal } from 'objects';
import type { TokenNeed } from '../src/token/token.ts';
import type { FloorNarrowing } from './token-floor.contract.ts';

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

/** Who holds a standing token: the person, or an agent by its name, bound to a factory (null: store-wide) and maybe narrowed. */
export type TokenHolder =
  | { readonly kind: Extract<CallerKind, 'person'> }
  | {
      readonly kind: Extract<CallerKind, 'agent'>;
      readonly agent: string;
      readonly factory: string | null;
      readonly narrowed: FloorNarrowing | null;
    };

/** What the store keeps of a standing token, found by its digest: its name and its holder. */
export type StandingRecord = { readonly name: string; readonly holder: TokenHolder };

/**
 * The caller a request is: the person, under the name of the token it presented (null: an in-process program, which presents none); an
 * agent, by a live session (its run and step, `token` null) or by a standing token (its name, run and step null, and its narrowing); or
 * refused with its reason.
 */
export type CallerOf =
  | { readonly kind: Extract<CallerKind, 'person'>; readonly token: string | null }
  | {
      readonly kind: Extract<CallerKind, 'agent'>;
      readonly agent: string;
      readonly factory: string | null;
      readonly run: string | null;
      readonly step: string | null;
      readonly token: string | null;
      readonly narrowed: FloorNarrowing | null;
    }
  | { readonly kind: 'refused'; readonly reason: TokenRefusal };

/** Whether `output` is a refusal for `reason`. */
const refusedFor = (output: CallerOf, reason: TokenRefusal): boolean => output.kind === 'refused' && output.reason === reason;

/** A token presented that is no standing one: a session's, or one the store never minted. */
const sessionSide = (presented: boolean, standing: StandingRecord | null): boolean => presented && standing === null;

const callerOfSpec = spec<
  (presented: boolean, need: TokenNeed, standing: StandingRecord | null, record: TokenRecord | null, live: boolean) => CallerOf
>({
  requires: ({ input: [presented, , standing] }) => presented || standing === null,
  ensures: {
    noTokenIsThePersonWhereNoneIsNeeded: {
      description: 'A program that presents no token, to what needs none, is the person, under no token’s name',
      condition: ({ input: [presented, need], output }) =>
        presented || need !== 'none' || (output.kind === 'person' && output.token === null),
    },
    noTokenIsRefusedWhereOneIsNeeded: {
      description: 'A request that presents no token, to a route that needs one, is refused for it',
      condition: ({ input: [presented, need], output }) => presented || need === 'none' || refusedFor(output, 'token-required'),
    },
    aPersonHeldTokenIsThePersonUnderItsName: {
      description: 'A standing token the person holds is the person, under the token’s name, whatever the route needs',
      condition: ({ input: [presented, , standing], output }) =>
        !(presented && standing !== null && standing.holder.kind === 'person') ||
        (output.kind === 'person' && output.token === standing.name),
    },
    anAgentHeldTokenIsItsAgent: {
      description:
        'A standing token an agent holds is that agent, in the factory it is bound to, under the token’s name and narrowing, in no run',
      condition: ({ input: [presented, , standing], output }) =>
        !(presented && standing !== null && standing.holder.kind === 'agent') ||
        (output.kind === 'agent' &&
          output.agent === standing.holder.agent &&
          output.factory === standing.holder.factory &&
          output.narrowed === standing.holder.narrowed &&
          output.token === standing.name &&
          output.run === null &&
          output.step === null),
    },
    aSessionTokenIsNeverThePerson: {
      description: 'A request that presents a token that is no standing one is never the person',
      condition: ({ input: [presented, , standing], output }) => !sessionSide(presented, standing) || output.kind !== 'person',
    },
    unknownRefused: {
      description: 'A token the store never minted is refused as unknown, whatever the route needs',
      condition: ({ input: [presented, , standing, record], output }) =>
        !(sessionSide(presented, standing) && record === null) || refusedFor(output, 'unknown-token'),
    },
    aSessionTokenIsRefusedWhereAStandingOneIsNeeded: {
      description: "A session's token, to a route that needs a standing one, is refused for it",
      condition: ({ input: [presented, need, standing, record], output }) =>
        !(sessionSide(presented, standing) && record !== null && need === 'standing') || refusedFor(output, 'person-token-required'),
    },
    endedRefused: {
      description: "A session's token whose try is no longer live is refused, where the route takes a session's",
      condition: ({ input: [presented, need, standing, record, live], output }) =>
        !(sessionSide(presented, standing) && record !== null && need !== 'standing' && !live) || refusedFor(output, 'session-ended'),
    },
    liveIsItsAgent: {
      description: "A live session's token, where the route takes a session's, is its agent, in its factory, run and step",
      condition: ({ input: [presented, need, standing, record, live], output }) =>
        !(sessionSide(presented, standing) && record !== null && need !== 'standing' && live) ||
        (output.kind === 'agent' &&
          output.agent === record.agent &&
          output.factory === record.factory &&
          output.run === record.run &&
          output.step === record.step &&
          output.token === null &&
          output.narrowed === null),
    },
  },
});

/** `callerOf`'s type, which `src/token/token.ts` takes. */
export type CallerOfToken = Implementation<typeof callerOfSpec>;
