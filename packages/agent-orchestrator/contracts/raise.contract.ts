/**
 * A step's raise of its cap (agent-orchestrator, src/retry/retry.ts): `raiseVerdict`, the one place it is decided whether a person
 * raises a step's cap with a try (`nemia retry --budget`) or with a round (`nemia retry --round --budget`), and what the raise has to
 * pass. Its gatherer, `stepRaise`, reads the run (`retryable`, `ownStatus`, `loopOver`) and hands it what it judges: the run page's
 * `raise` and `nemia decide`'s raise lines both read that one verdict, so the two cannot say different things.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { StepStatus } from '../src/record/record.ts';
import type { RetryMode } from '../src/retry/index.ts';

/**
 * What a step's raise is judged from. `called`: the run was cancelled, pruned or held, where no raise is asked. `tryRaise`: the raise
 * its try carries (`retryable`'s `raise`), null where a try of it needs none. `modes`: the ways a try of it is taken (`retryable`).
 * `status`: its word (`standing`). `own`: how it ended on its own work, its budget aside (`ownStatus`). `loop`: whether it loops.
 * `over`: what each step of its loop over its budget has cost (`loopOver`), in dollars.
 */
export type RaiseInput = {
  called: boolean;
  tryRaise: { above: number } | null;
  modes: RetryMode[];
  status: StepStatus;
  own: StepStatus | null;
  loop: boolean;
  over: readonly number[];
};

/** A raise the package takes: by a try or by a round, what the budget has to be more than, and for a try its modes and own status. */
export type RaiseVerdict = { by: 'retry' | 'round'; above: number; modes: RetryMode[]; own: StepStatus | null };

/** A try's raise is due: the try carries one, and there is a way to try it. */
const tryDue = (i: RaiseInput): boolean => i.tryRaise !== null && i.modes.length > 0;

/** A looping step whose round waits on its budget: over it, or out of rounds, with a step of its loop over its cap. */
const roundDue = (i: RaiseInput): boolean =>
  !tryDue(i) && i.loop && (i.status === 'over budget' || i.status === 'exhausted') && i.over.length > 0;

/** Two lists of modes that say the same ways, in the same order. */
const sameModes = (a: readonly RetryMode[], b: readonly RetryMode[]): boolean => a.length === b.length && a.every((m, k) => m === b.at(k));

const raiseSpec = spec<(i: RaiseInput) => RaiseVerdict | null>({
  /**
   * What a step's tries cost is never below nothing (`stepSpend` adds up costs), so each loop step's spend is a number at 0 or more; and
   * a try's raise is above the most of that and the cap in force (`raiseOf`), a `budget:` above 0.
   */
  requires: ({ input: [r] }) => r.over.every((o) => o >= 0) && (r.tryRaise === null || r.tryRaise.above >= 0),
  ensures: {
    noRaiseOnARunCalledOff: {
      description: 'A run that is cancelled, pruned or held offers no raise',
      condition: ({ input: [r], output }) => !r.called || output === null,
    },
    byRetryExactlyWhenTheTryCarriesARaise: {
      description: 'A step’s raise is a retry’s exactly when its try carries a raise and some mode to retry by, on a run not called off',
      condition: ({ input: [r], output }) => (output !== null && output.by === 'retry') === (!r.called && tryDue(r)),
    },
    retryAboveIsTheTrysAbove: {
      description: 'A retry’s raise is above what its try’s raise says, offered by the try’s own modes and own status',
      condition: ({ input: [r], output }) =>
        output === null ||
        output.by !== 'retry' ||
        (r.tryRaise !== null && output.above === r.tryRaise.above && sameModes(output.modes, r.modes) && output.own === r.own),
    },
    byRoundWhenALoopRanOut: {
      description:
        'A looping step over budget or out of rounds, with a step of its loop over its cap and no try’s raise, is raised by a round',
      condition: ({ input: [r], output }) => (output !== null && output.by === 'round') === (!r.called && roundDue(r)),
    },
    roundAboveIsTheMostARoundSpent: {
      description: 'A round’s raise is above the most any step of its loop over its cap has cost, and never below nothing',
      condition: ({ input: [r], output }) => {
        if (output === null || output.by !== 'round') return true;
        const above = output.above;
        return above >= 0 && r.over.every((o) => above >= o) && (above === 0 || r.over.some((o) => o === above));
      },
    },
    roundOffersNoModes: {
      description: 'A raise by round names no mode and no own status: a round is asked for as it is, with a budget',
      condition: ({ output }) => output === null || output.by !== 'round' || (output.modes.length === 0 && output.own === null),
    },
    noRaiseOtherwise: {
      description: 'Where neither a try’s raise nor a round’s is due, no raise',
      condition: ({ input: [r], output }) => tryDue(r) || roundDue(r) || output === null,
    },
  },
});
export type RaiseVerdictOf = Implementation<typeof raiseSpec>;

/** The most any step of a loop over its cap has cost, or nothing where none is: what a round's raise has to be more than. */
const mostSpentSpec = spec<(over: readonly number[]) => number>({
  /** Each a step's spend, never below nothing (`stepSpend`). */
  requires: ({ input: [over] }) => over.every((o) => o >= 0),
  ensures: {
    noneSpentMore: {
      description: 'No step of the loop has cost more',
      condition: ({ input: [over], output }) => over.every((o) => output >= o),
    },
    neverBelowNothing: {
      description: 'Never below nothing',
      condition: ({ output }) => output >= 0,
    },
    oneOfThemOrNothing: {
      description: 'What one of them cost, or nothing where none is over its cap',
      condition: ({ input: [over], output }) => output === 0 || over.some((o) => o === output),
    },
  },
});
export type MostSpent = Implementation<typeof mostSpentSpec>;
