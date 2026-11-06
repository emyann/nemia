/**
 * A RunList's `?fieldSelector=` (agent-orchestrator, src/run-list/run-list.ts, `runStateSelector`; no code yet), as Kubernetes spells a
 * field selector: one field, `status.state`, the run's state in the list (`waiting`, it waits on a person; `inFlight`; `finished`), with
 * one of Kubernetes' three operators — `=` and `==`, which mean the same, and `!=`. Kubernetes chains terms with a comma and takes
 * `metadata.name` and `metadata.namespace` on every kind; this list takes the one term on `status.state` alone, since the namespace is
 * its path and a name is read by its own route. Anything else is no selector of it (null), which the door refuses `Invalid`, naming the
 * three forms it takes.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A run's state in the list: one of `RUN_STATES` of `objects`. Declared here until src holds it. */
export type RunState = 'waiting' | 'inFlight' | 'finished';

/** What a selector asks: the runs in `state` (`equal`), or every run but those (`!equal`). Declared here until src holds it. */
export type RunStateSelector = { readonly state: RunState; readonly equal: boolean };

/** The field a run's list is selected by. */
const FIELD = 'status.state';

/** Whether `word` is a run's state. */
const isState = (word: string): boolean => word === 'waiting' || word === 'inFlight' || word === 'finished';

/** Whether `text` is the field, `operator`, then a run's state. */
const spelled = (text: string, operator: string): boolean =>
  text.startsWith(FIELD + operator) && isState(text.slice(FIELD.length + operator.length));

const runStateSelectorSpec = spec<(text: string) => RunStateSelector | null>({
  ensures: {
    eachSpellingTaken: {
      description: 'status.state, then =, == or !=, then a run state, is a selector of the list',
      condition: ({ input: [text], output }) => !(spelled(text, '=') || spelled(text, '==') || spelled(text, '!=')) || output !== null,
    },
    readAsSpelled: {
      description: 'A selector taken says the state its text names, and takes the runs in it exactly where its operator is = or ==',
      condition: ({ input: [text], output }) =>
        output === null ||
        (output.equal
          ? text === `${FIELD}=${output.state}` || text === `${FIELD}==${output.state}`
          : text === `${FIELD}!=${output.state}`),
    },
  },
});

/** `runStateSelector`'s type, which `src/run-list/run-list.ts` takes: the selector `text` spells, or null where it spells none. */
export type RunStateSelectorOf = Implementation<typeof runStateSelectorSpec>;
