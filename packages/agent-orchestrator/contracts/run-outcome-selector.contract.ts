/**
 * A RunList's `?fieldSelector=` on a finished run's outcome (agent-orchestrator, src/run-list/run-list.ts, `runOutcomeSelector`; no code
 * yet), beside the one on its state (`runStateSelector`, contracts/run-state-selector.contract.ts), as Kubernetes spells a field
 * selector: one field, `status.outcome`, how a finished run ended (`RUN_OUTCOMES`: `succeeded`, `failed`, `cancelled`, `undecided`),
 * with one of Kubernetes' three operators — `=` and `==`, which mean the same, and `!=`. One term, on either field: Kubernetes chains
 * terms with a comma, which this list still refuses. Anything else is no selector of it (null), which the door refuses `Invalid`.
 *
 * And which runs a list's selector takes (`selectorTakes`; no code yet), off the state the list judged a run in and its outcome — a
 * finished run's alone, null for every other and for a finished run the list could not judge, as `status.outcome` is null on a run's
 * status: a selector on the state takes the runs in that state, or every other; one on the outcome the finished runs that ended so, or
 * every other run, a run not finished among them, since it has no outcome. So `status.outcome=undecided` is the finished runs nobody
 * decided, which the board's floor reads beside the runs not finished.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { RunOutcome, RunState } from 'objects';
import type { RunStateSelector } from './run-state-selector.contract.ts';

/** What a selector on the outcome asks: the finished runs that ended `outcome` (`equal`), or every run but those (`!equal`). */
export type RunOutcomeSelector = { readonly outcome: RunOutcome; readonly equal: boolean };

/** A selector of the runs' list: on the run's state, or on a finished run's outcome. `run-list.ts` re-exports both. */
export type RunSelector = RunStateSelector | RunOutcomeSelector;

/** What a selector reads of a run: the state the list judged it in, and its outcome, null but for a finished run. */
export type SelectedRun = { readonly state: RunState; readonly outcome: RunOutcome | null };

/** The field the outcome is selected by. */
const FIELD = 'status.outcome';

/** Whether `word` is a finished run's outcome. */
const isOutcome = (word: string): boolean => word === 'succeeded' || word === 'failed' || word === 'cancelled' || word === 'undecided';

/** Whether `text` is the field, `operator`, then an outcome. */
const spelled = (text: string, operator: string): boolean =>
  text.startsWith(FIELD + operator) && isOutcome(text.slice(FIELD.length + operator.length));

const runOutcomeSelectorSpec = spec<(text: string) => RunOutcomeSelector | null>({
  ensures: {
    eachSpellingTaken: {
      description: 'status.outcome, then =, == or !=, then an outcome, is a selector of the list',
      condition: ({ input: [text], output }) => !(spelled(text, '=') || spelled(text, '==') || spelled(text, '!=')) || output !== null,
    },
    readAsSpelled: {
      description:
        'A selector taken says the outcome its text names, and takes the runs that ended so exactly where its operator is = or ==',
      condition: ({ input: [text], output }) =>
        output === null ||
        (output.equal
          ? text === FIELD + '=' + output.outcome || text === FIELD + '==' + output.outcome
          : text === FIELD + '!=' + output.outcome),
    },
  },
});

/** `runOutcomeSelector`'s type, which `src/run-list/run-list.ts` takes: the selector `text` spells, or null where it spells none. */
export type RunOutcomeSelectorOf = Implementation<typeof runOutcomeSelectorSpec>;

const selectorTakesSpec = spec<(selector: RunSelector, run: SelectedRun) => boolean>({
  requires: ({ input: [, run] }) => run.outcome === null || run.state === 'finished',
  ensures: {
    byState: {
      description: 'A selector on the state takes a run exactly where its state is the one named, or, for !=, exactly where it is not',
      condition: ({ input: [selector, run], output }) =>
        !('state' in selector) || output === ((run.state === selector.state) === selector.equal),
    },
    byOutcome: {
      description: 'A selector on the outcome takes a run exactly where it ended as named, or, for !=, exactly where it did not',
      condition: ({ input: [selector, run], output }) =>
        !('outcome' in selector) || output === ((run.outcome === selector.outcome) === selector.equal),
    },
    outcomeTakesFinished: {
      description: 'A selector asking for an outcome (= or ==) takes no run that is not finished',
      condition: ({ input: [selector, run], output }) => !('outcome' in selector && selector.equal && output) || run.state === 'finished',
    },
    notOutcomeTakesUnfinished: {
      description: 'A selector refusing an outcome (!=) takes every run that is not finished',
      condition: ({ input: [selector, run], output }) => !('outcome' in selector && !selector.equal && run.state !== 'finished') || output,
    },
  },
});

/** `selectorTakes`'s type, which `src/run-list/run-list.ts` takes: whether a list asked by `selector` takes `run`. */
export type SelectorTakes = Implementation<typeof selectorTakesSpec>;
