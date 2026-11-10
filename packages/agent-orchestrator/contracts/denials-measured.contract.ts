/**
 * Every call a task's sessions were denied, as the stats count them (agent-orchestrator, src/stats/discipline.ts, `deniedCallsOf`): off
 * what the runtime recorded on each attempt that ended, where `denials` present is a measure — `[]` for none denied — and absent is "its
 * harness could not say" (an older journal's background session, a Codex sandbox, a remote agent, an end with no sighting behind it).
 *
 * So the stats need no list of harnesses and no date (`deniesRecorded`, `ranAsJob`, `JOBS_SINCE` go): a task is measured exactly when
 * it has a view, at least one attempt ended, and every ended attempt says its denials, as `skillsLoadedOf` reads skills. An unmeasured
 * task is null and never counted as one that kept every rule (`rulesOfTry`).
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A denied call as the runtime records it (agent-runtime's `Denial`). */
export type DeniedCall = { readonly tool: string; readonly what?: string };

/** What `deniedCallsOf` reads of a task's view: its attempts, whether each ended, and what each was denied where it says. */
export type DeniedClock = {
  readonly state: { readonly attempts: ReadonlyArray<{ readonly ended: unknown; readonly denials?: readonly DeniedCall[] }> };
};

type Attempt = DeniedClock['state']['attempts'][number];

/** An attempt that ended: its `ended` is an outcome, not null nor absent. */
const endedOf = (a: Attempt): boolean => a.ended !== null && a.ended !== undefined;

const deniedCallsSpec = spec<(view: DeniedClock | undefined) => DeniedCall[] | null>({
  ensures: {
    noViewIsUnmeasured: {
      description: 'A task the engine has no view of was measured by nobody: null, never an empty list',
      condition: ({ input: [view], output }) => view !== undefined || output === null,
    },
    noEndIsUnmeasured: {
      description: 'A task none of whose attempts has ended has no measure yet: null',
      condition: ({ input: [view], output }) => view === undefined || view.state.attempts.some(endedOf) || output === null,
    },
    anEndThatCannotSayIsUnmeasured: {
      description: 'A task with an ended attempt whose harness could not say its denials is unmeasured as a whole: null',
      condition: ({ input: [view], output }) =>
        view === undefined || !view.state.attempts.some((a) => endedOf(a) && a.denials === undefined) || output === null,
    },
    everyEndSaysIsMeasured: {
      description: 'A task with an ended attempt, every ended attempt saying its denials, is measured: a list, `[]` for none denied',
      condition: ({ input: [view], output }) =>
        view === undefined ||
        !view.state.attempts.some(endedOf) ||
        !view.state.attempts.every((a) => !endedOf(a) || a.denials !== undefined) ||
        output !== null,
    },
    noneDeniedIsEmpty: {
      description: 'A measured task none of whose ended attempts was denied anything says so: an empty list',
      condition: ({ input: [view], output }) =>
        view === undefined ||
        !view.state.attempts.some(endedOf) ||
        !view.state.attempts.every((a) => !endedOf(a) || (a.denials !== undefined && a.denials.length === 0)) ||
        (output !== null && output.length === 0),
    },
    aDenialOfAnEndIsCounted: {
      description: 'A measured task one of whose ended attempts was denied a call counts at least that call',
      condition: ({ input: [view], output }) =>
        output === null || view === undefined || !view.state.attempts.some((a) => endedOf(a) && (a.denials?.length ?? 0) > 0) || output.length > 0,
    },
    aRunningAttemptIsNotCounted: {
      description: 'Only ended attempts are counted: a task whose ended attempts were denied nothing counts nothing a running one was',
      condition: ({ input: [view], output }) =>
        output === null ||
        view === undefined ||
        view.state.attempts.some((a) => endedOf(a) && (a.denials?.length ?? 0) > 0) ||
        output.length === 0,
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type DeniedCallsOf = Implementation<typeof deniedCallsSpec>;
