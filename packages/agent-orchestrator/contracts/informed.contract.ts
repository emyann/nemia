/**
 * Whether the informer serves a run's judgement from memory or judges it again (agent-orchestrator, src/rest/rest.ts, `informedOf`):
 * the judgement a pass or a request made of a run (its `Judgement`), kept in memory while every input it was judged on holds — the
 * run's files in the store (its stamp), its tasks' journals (the engine's feed), its result branches and base (their tips) — and, for a
 * run still moving, only within the pass that judged it, since a moving run's judgement rests on sightings of its harnesses that no
 * stamp or feed line announces. A cache of a pure function: nothing it answers is a source of truth.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What an entry of the informer is checked against before it is served. */
export type InformedInputs = {
  /** The run's files in the store stamp as they did when it was judged. */
  readonly stampHeld: boolean;
  /** No line of its tasks is on the engine's feed since it was judged, and the feed was read. */
  readonly quiet: boolean;
  /** Its result branches and its base branch stand where they stood when it was judged. */
  readonly tipsHeld: boolean;
  /** It was at rest when judged: nothing of it moves, waits or is held, and its workflow is frozen. */
  readonly atRest: boolean;
  /** It was judged within the pass now running. */
  readonly samePass: boolean;
};

/** What the informer does with an entry: serve it, or judge the run again. */
export type InformedVerdict = 'serve' | 'judge';

/** Every input of a judgement as it was: a run at rest across passes, a moving one within its pass. */
const held = (i: InformedInputs): boolean => i.stampHeld && i.quiet && i.tipsHeld && (i.atRest || i.samePass);

const informedSpec = spec<(inputs: InformedInputs) => InformedVerdict>({
  ensures: {
    movedFilesJudged: {
      description: 'A run whose files in the store changed since it was judged is judged again',
      condition: ({ input: [i], output }) => i.stampHeld || output === 'judge',
    },
    journalJudged: {
      description: "A run any of whose tasks' journals moved since it was judged is judged again",
      condition: ({ input: [i], output }) => i.quiet || output === 'judge',
    },
    tipsJudged: {
      description: 'A run whose result branches or base moved since it was judged is judged again',
      condition: ({ input: [i], output }) => i.tipsHeld || output === 'judge',
    },
    movingRunOnePass: {
      description: 'A run not at rest is served only within the pass that judged it',
      condition: ({ input: [i], output }) => i.atRest || i.samePass || output === 'judge',
    },
    servedWhenHeld: {
      description: 'A judgement whose every input holds is served: a run at rest across passes, a moving run within its pass',
      condition: ({ input: [i], output }) => !held(i) || output === 'serve',
    },
  },
});

export type Informed = Implementation<typeof informedSpec>;
