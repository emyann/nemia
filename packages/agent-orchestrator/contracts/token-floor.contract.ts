/**
 * The floor of an agent's standing token (agent-orchestrator, src/admission/floor.ts, `floorOf`): whether a request the api takes under
 * a token the person minted for an agent reaches what it asks, judged as an agent's session is judged by admission (`admissionOf`), by
 * the same command classes, the same factory levels and the same confirmed list at `auto`, with the one difference that the api has no
 * prompt: what admission would ask the person of (`ask`, an `answer` that waits on the person and no rule lets through) is refused here,
 * and so is what is out of an agent's reach (`none`). The person may narrow a token when minting it (`narrowed`: `read`, or `act`, the
 * highest class it reaches), never widen it. A token bound to one factory reaches no other; a store-wide one (`factory: null`) reaches
 * each factory as that factory's level grants, as Nemia's session does. A session's token and the person's are never judged here: a
 * session is judged at its harness, where the person can answer an ask, and the person is the floor's owner. Pure: the verb reads the
 * levels, the wait and the list (`floor.verb.ts`), afresh on each request.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { CommandClass } from 'objects';
import { atLeast, type Level } from '../src/level/level.ts';

/** The highest class a narrowed token reaches: `read` (reads alone), or `act` (reads and writes that run unasked). */
export type FloorNarrowing = 'read' | 'act';

/** An agent's standing token as the floor reads it: the factory it is bound to (null: store-wide) and its narrowing, if any. */
export type FloorHolder = { readonly factory: string | null; readonly narrowed: FloorNarrowing | null };

/**
 * A request as the floor reads it: the class of the command its endpoint serves for an agent (`agentClassOf`, a bare read's setting
 * resolved to its `sets`), the factory it acts in (null: none, a store-wide read) and that factory's level, the level an agent's call
 * must find it at (`least`, admission's `Scope.atLeast`), whether it answers what waits on the person (`waits`, admission's `askedOf`)
 * and whether a rule of the person's list lets it through at `auto` (`ruled`, admission's `policyAllows`).
 */
export type FloorCall = {
  readonly class: Exclude<CommandClass, object>;
  readonly factory: string | null;
  readonly level: Level | null;
  readonly least: Level;
  readonly waits: boolean;
  readonly ruled: boolean;
};

/** Why the floor refuses a request (a 403, `Forbidden`'s `reason`): each names what the person types or clicks instead. */
export type FloorRefusal = 'out-of-reach' | 'asks-the-person' | 'narrowed' | 'other-factory' | 'below-level' | 'waits-on-person';

/** The floor's answer: the request reaches what it asks, or is refused for a reason. */
export type FloorAnswer = { readonly decision: 'allow' } | { readonly decision: 'deny'; readonly reason: FloorRefusal };

/** Whether `answer` refuses for `reason`. */
const deniedFor = (answer: FloorAnswer, reason: FloorRefusal): boolean => answer.decision === 'deny' && answer.reason === reason;

/** Whether `c`, a class, is above the narrowing `n`: anything but a read above `read`, an answer or an ask above `act`. */
const aboveNarrowing = (c: FloorCall['class'], n: FloorNarrowing | null): boolean =>
  n !== null && c !== 'read' && (n === 'read' || c !== 'act');

const floorOfSpec = spec<(call: FloorCall, holder: FloorHolder) => FloorAnswer>({
  ensures: {
    outOfReachRefused: {
      description: 'A command out of an agent’s reach (`none`) is refused, whatever else holds',
      condition: ({ input: [call], output }) => call.class !== 'none' || deniedFor(output, 'out-of-reach'),
    },
    anAskIsRefused: {
      description: 'A command that asks the person every time is refused: the api has no prompt to ask it at',
      condition: ({ input: [call], output }) => call.class !== 'ask' || deniedFor(output, 'asks-the-person'),
    },
    aNarrowedTokenReachesNoHigher: {
      description: 'A token the person narrowed reaches no class above its narrowing',
      condition: ({ input: [call, holder], output }) =>
        call.class === 'none' || call.class === 'ask' || !aboveNarrowing(call.class, holder.narrowed) || deniedFor(output, 'narrowed'),
    },
    aBoundTokenStaysInItsFactory: {
      description: 'A token bound to one factory is refused a request that acts in another',
      condition: ({ input: [call, holder], output }) =>
        holder.factory === null || call.factory === null || call.factory === holder.factory || output.decision === 'deny',
    },
    belowTheLevelIsLeftAlone: {
      description: 'A write in a factory below the level an agent’s call needs is refused, as admission denies it',
      condition: ({ input: [call], output }) =>
        call.class === 'read' || call.level === null || atLeast(call.level, call.least) || output.decision === 'deny',
    },
    whatWaitsOnThePersonStaysTheirs: {
      description: 'An answer to what waits on the person is refused unless a rule the person confirmed lets it through',
      condition: ({ input: [call], output }) => call.class !== 'answer' || !call.waits || call.ruled || output.decision === 'deny',
    },
    aReadInReachIsAllowed: {
      description: 'A read in the token’s factory, or of none, is allowed',
      condition: ({ input: [call, holder], output }) =>
        call.class !== 'read' ||
        !(holder.factory === null || call.factory === null || call.factory === holder.factory) ||
        output.decision === 'allow',
    },
    anActInReachIsAllowed: {
      description: 'A write that runs unasked, in reach, at the level it needs and within the narrowing, is allowed',
      condition: ({ input: [call, holder], output }) =>
        call.class !== 'act' ||
        holder.narrowed === 'read' ||
        !(holder.factory === null || call.factory === null || call.factory === holder.factory) ||
        !(call.level === null || atLeast(call.level, call.least)) ||
        output.decision === 'allow',
    },
    anAnswerNoOneWaitsOnOrARuleTakesIsAllowed: {
      description: 'An answer in reach, unnarrowed, at the level it needs, that waits on no one or that a rule lets through, is allowed',
      condition: ({ input: [call, holder], output }) =>
        call.class !== 'answer' ||
        holder.narrowed !== null ||
        !(holder.factory === null || call.factory === null || call.factory === holder.factory) ||
        !(call.level === null || atLeast(call.level, call.least)) ||
        (call.waits && !call.ruled) ||
        output.decision === 'allow',
    },
  },
});

/** `floorOf`'s type, which `src/admission/floor.ts` takes. */
export type FloorOf = Implementation<typeof floorOfSpec>;
