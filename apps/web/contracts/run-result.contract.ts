/**
 * What the run page's result box draws beside the ask (`resultOf`, src/lib/runResult.ts). A run's result is what the graph's final
 * steps gave — those nothing comes after — read from the graph and never from a step's name. Until every final step the run will run has
 * given, the box says where the run stands instead, linked to the step that says it: one waiting on a person first, since it asks
 * something of them; then one that failed, and why; then one at work; and else the first step still to come.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * Where a step stands, as the box reads it (implement maps the board's `StepState` onto it in src/lib/runResult.ts): done, waiting on a
 * person, failed, at work, still to come, or never to run on this run (a branch a route did not take).
 */
export type Stands = 'done' | 'yours' | 'failed' | 'working' | 'toCome' | 'skipped';

/**
 * A step of the run, in the run's order: its name, whether it is final (no step comes after it on the graph), where it stands, and
 * whether its shown try gave anything: a declared field, a file or a value.
 */
export type ResultStep = { readonly name: string; readonly final: boolean; readonly stands: Stands; readonly gave: boolean };

/** What the box draws: the final steps that gave, in the run's order, or where the run stands and the step that says it. */
export type RunResult =
  | { readonly kind: 'gave'; readonly steps: readonly string[] }
  | { readonly kind: 'stands'; readonly why: Exclude<Stands, 'done' | 'skipped'>; readonly step: string | null };

/** The final steps the run will run: a final step on a branch not taken is no part of its result. */
const owed = (steps: readonly ResultStep[]): readonly ResultStep[] => steps.filter((s) => s.final && s.stands !== 'skipped');

/** Whether every final step the run will run is done and gave, and there is at least one. */
const given = (steps: readonly ResultStep[]): boolean => owed(steps).length > 0 && owed(steps).every((s) => s.stands === 'done' && s.gave);

/** Whether some step stands as `why`. */
const some = (steps: readonly ResultStep[], why: Stands): boolean => steps.some((s) => s.stands === why);

/**
 * One law is held outside this spec: what the box draws as given is exactly the final steps the run will run, in the run order. It
 * runs out of the solver's work through the filter `owed` is (tsverify 0.9.0 leaves it `bounded`, as it does a filter's result keeping
 * every element, its card `src-a-filter-s-result-is-pro-p25m`), so `apps/web/test/runResult.test.ts` holds it whole until that card
 * restores it here.
 */
const resultOfSpec = spec<(steps: readonly ResultStep[]) => RunResult>({
  ensures: {
    theFinalStepsGave: {
      description: 'Once every final step the run will run is done and gave, the box draws what they gave',
      condition: ({ input: [steps], output }) => !given(steps) || output.kind === 'gave',
    },
    nothingGivenBeforeItIs: {
      description: 'Until every final step the run will run has given, the box draws where the run stands, never a part of a result',
      condition: ({ input: [steps], output }) => given(steps) || output.kind === 'stands',
    },
    yoursFirst: {
      description: 'Where a step waits on a person, the box says so first',
      condition: ({ input: [steps], output }) => output.kind !== 'stands' || !some(steps, 'yours') || output.why === 'yours',
    },
    thenWhatFailed: {
      description: 'Where none waits on a person and one failed, the box says it failed',
      condition: ({ input: [steps], output }) =>
        output.kind !== 'stands' || some(steps, 'yours') || !some(steps, 'failed') || output.why === 'failed',
    },
    thenWhatIsAtWork: {
      description: 'Where none waits and none failed, and one is at work, the box says what is at work',
      condition: ({ input: [steps], output }) =>
        output.kind !== 'stands' || some(steps, 'yours') || some(steps, 'failed') || !some(steps, 'working') || output.why === 'working',
    },
    elseWhatIsToCome: {
      description: 'Where none waits, none failed and none is at work, the box says what is still to come',
      condition: ({ input: [steps], output }) =>
        output.kind !== 'stands' || some(steps, 'yours') || some(steps, 'failed') || some(steps, 'working') || output.why === 'toCome',
    },
    linkedToTheFirstThatSaysIt: {
      description: 'The box links to the first step, in the run order, that stands as it says; to none where no step does',
      condition: ({ input: [steps], output }) =>
        output.kind !== 'stands' ||
        (some(steps, output.why) ? output.step === steps.find((s) => s.stands === output.why)?.name : output.step === null),
    },
  },
});

/** `resultOf`'s type, which src/lib/runResult.ts takes. */
export type ResultOf = Implementation<typeof resultOfSpec>;
