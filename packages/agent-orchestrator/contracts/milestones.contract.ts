/**
 * Where a store stands on the way to its first landed change (`milestonesOf`, src/milestones/milestones.ts): four milestones in order — a
 * harness activated and signed in, a factory filed, a volume a run would mount, a run landed — each `done` by what the store holds now,
 * never by a flag saved when a page was seen, so a milestone met at a terminal is done on the board too. The first not done is `next`,
 * which the board links to; any other not done is `later`. Pure: the store's reads are handed in.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** The milestones, in order. objects' `MILESTONES` holds the same words (its `Milestone`). */
export type Milestone = 'harness' | 'factory' | 'volume' | 'landed';

/** Where a milestone stands. objects' `MILESTONE_STATES` holds the same words (its `MilestoneState`). */
export type MilestoneState = 'done' | 'next' | 'later';

/**
 * What the store holds now, one fact a milestone: a harness whose install and sign-in are both met (`harness`); a factory filed besides
 * the default (`factory`); a writable volume of a factory that is there, that no start would refuse and that every harness keeping a
 * trust trusts now (`volume`: a read-only one, or one left untrusted at "Not now", is not the milestone); a run with a step that landed
 * (`landed`).
 */
export type MilestoneFacts = {
  readonly harness: boolean;
  readonly factory: boolean;
  readonly volume: boolean;
  readonly landed: boolean;
};

/** Each milestone's state, by its name. */
export type MilestoneStates = {
  readonly harness: MilestoneState;
  readonly factory: MilestoneState;
  readonly volume: MilestoneState;
  readonly landed: MilestoneState;
};

/** Whether every milestone before `m` is met in `f`, in the order harness, factory, volume, landed. */
const beforeMet = (f: MilestoneFacts, m: Milestone) =>
  m === 'harness' ? true : m === 'factory' ? f.harness : m === 'volume' ? f.harness && f.factory : f.harness && f.factory && f.volume;

/** Whether `m`'s state in `out` keeps both laws of a milestone against `f`. */
const keeps = (f: MilestoneFacts, out: MilestoneStates, m: Milestone, law: 'done' | 'next') =>
  law === 'done' ? (out[m] === 'done') === f[m] : (out[m] === 'next') === (!f[m] && beforeMet(f, m));

const milestonesOfSpec = spec<(facts: MilestoneFacts) => MilestoneStates>({
  ensures: {
    doneExactlyWhatTheStoreHolds: {
      description: 'A milestone is done exactly when the store holds it now, whatever was met before it or after it',
      condition: ({ input: [f], output }) =>
        keeps(f, output, 'harness', 'done') &&
        keeps(f, output, 'factory', 'done') &&
        keeps(f, output, 'volume', 'done') &&
        keeps(f, output, 'landed', 'done'),
    },
    nextIsTheFirstNotDone: {
      description: 'The milestone the list links to is the first one not done, and only it',
      condition: ({ input: [f], output }) =>
        keeps(f, output, 'harness', 'next') &&
        keeps(f, output, 'factory', 'next') &&
        keeps(f, output, 'volume', 'next') &&
        keeps(f, output, 'landed', 'next'),
    },
  },
});

/** `milestonesOf`'s type, which src/milestones/milestones.ts takes. */
export type MilestonesOf = Implementation<typeof milestonesOfSpec>;
