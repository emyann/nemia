/**
 * A machine need — a command a workflow or a place declares it needs, with the check that says whether it is in place and the fix that
 * puts it there (src/needs/) — judged three ways:
 *
 * - `needStateOf`: what one check's run says of its need. Exit 0 is met, any other exit missing; a check that did not answer in its
 *   time, or whose shell did not start, is `unknown`: an unknown answer is not a missing one, as Codex's sign-in check reads its own
 *   (`signedOutRefusal`, agent-runtime's harness/codex/codex.ts).
 * - `needsHolding`: the needs that hold a run before its first session. A run that has filed no task yet waits on every need of its
 *   workflow that is missing, and on none other; a run that has filed one is never held by a need, so a sign-in lapsing mid-run does not
 *   stop work in flight. Level-triggered: the pass hands the reading of this sweep, and a need met on the next starts the run.
 * - `fixRefusal`: whether a caller may start a need's fix. A place's fix (the builtin places) always; a workflow's only where the
 *   factory it came with has its places trusted (`nemia factory trust <factory>`), the trust command named otherwise.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What a check said of its need. Implement moves it into objects' words, beside the readiness read. */
export type NeedState = 'met' | 'missing' | 'unknown';

/** How a check's run ended: an exit with its code, past its time, or a shell that did not start. */
export type NeedRan =
  | { readonly kind: 'exited'; readonly code: number }
  | { readonly kind: 'timed-out' }
  | { readonly kind: 'unstartable' };

const needStateOfSpec = spec<(ran: NeedRan) => NeedState>({
  ensures: {
    exitZeroIsMet: {
      description: 'A check that exits 0 says its need is met',
      condition: ({ input: [ran], output }) => ran.kind !== 'exited' || ran.code !== 0 || output === 'met',
    },
    anyOtherExitIsMissing: {
      description: 'A check that exits with any other code says its need is missing',
      condition: ({ input: [ran], output }) => ran.kind !== 'exited' || ran.code === 0 || output === 'missing',
    },
    noAnswerIsUnknown: {
      description: 'A check that did not answer in its time, or did not start, says nothing: its need is unknown, never missing',
      condition: ({ input: [ran], output }) => ran.kind === 'exited' || output === 'unknown',
    },
  },
});

/** `needStateOf`'s type, which src/needs/needs.ts takes. */
export type NeedStateOf = Implementation<typeof needStateOfSpec>;

/** A need of a run's workflow as this sweep read it. */
export type NeedRead = { readonly name: string; readonly state: NeedState };

const needsHoldingSpec = spec<(filedAny: boolean, needs: readonly NeedRead[]) => readonly string[]>({
  ensures: {
    aStartedRunIsNeverHeld: {
      description: 'A run that has filed a task is held by no need',
      condition: ({ input: [filedAny], output }) => !filedAny || output.length === 0,
    },
    aMissingNeedHoldsAFreshRun: {
      description: 'A run that has filed nothing waits on every need of its workflow that is missing',
      condition: ({ input: [filedAny, needs], output }) =>
        filedAny || needs.every((n) => n.state !== 'missing' || output.includes(n.name)),
    },
    onlyAMissingNeedHolds: {
      description: 'A need met or unknown holds nothing: each name held is a need read missing',
      condition: ({ input: [, needs], output }) =>
        output.every((name) => needs.some((n) => n.name === name && n.state === 'missing')),
    },
  },
});

/** `needsHolding`'s type, which src/needs/needs.ts takes. */
export type NeedsHolding = Implementation<typeof needsHoldingSpec>;

/** Where a fix was declared: a builtin place, or a workflow of a factory whose places are trusted or not. */
export type FixOrigin = { readonly kind: 'place' } | { readonly kind: 'workflow'; readonly trusted: boolean };

/** Whether a fix may be started, or why not. */
export type FixRefusal = 'allowed' | 'untrusted';

const fixRefusalSpec = spec<(origin: FixOrigin) => FixRefusal>({
  ensures: {
    aPlacesFixIsAllowed: {
      description: 'A fix a builtin place declares may be started by any caller with a person’s token',
      condition: ({ input: [origin], output }) => origin.kind !== 'place' || output === 'allowed',
    },
    aTrustedWorkflowsFixIsAllowed: {
      description: 'A fix a workflow declares may be started where its factory’s places are trusted',
      condition: ({ input: [origin], output }) => origin.kind !== 'workflow' || !origin.trusted || output === 'allowed',
    },
    anUntrustedWorkflowsFixIsRefused: {
      description: 'A fix a workflow of an untrusted factory declares is refused until the factory is trusted',
      condition: ({ input: [origin], output }) => origin.kind !== 'workflow' || origin.trusted || output === 'untrusted',
    },
  },
});

/** `fixRefusal`'s type, which src/needs/needs.ts takes. */
export type FixRefusalOf = Implementation<typeof fixRefusalSpec>;
