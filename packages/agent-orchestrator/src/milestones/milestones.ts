/**
 * Where a store stands on the way to its first landed change (`milestonesOf`, whose laws are contracts/milestones.contract.ts'): four
 * milestones in order, each done by what the store holds now, the first not done `next` and any other `later`; and what each says
 * (`MILESTONE_WORDS`). A state worked out on every read and never written. Pure: the store's facts are read and handed in
 * (`milestonesNow`, `milestones.verb.ts`).
 */
import type { Milestone, MilestoneState } from 'objects';
import type { MilestoneFacts, MilestonesOf, MilestoneStates } from '../../contracts/milestones.contract.ts';

export type { MilestoneFacts, MilestoneStates } from '../../contracts/milestones.contract.ts';

/**
 * Each milestone's state: done where the store holds it, next for the first not done, later for any other.
 * @param f What the store holds now, one fact a milestone.
 */
export const milestonesOf: MilestonesOf = (f: MilestoneFacts): MilestoneStates => {
  const factoryNext = f.harness;
  const volumeNext = f.harness && f.factory;
  const landedNext = f.harness && f.factory && f.volume;
  return {
    harness: f.harness ? 'done' : 'next',
    factory: f.factory ? 'done' : factoryNext ? 'next' : 'later',
    volume: f.volume ? 'done' : volumeNext ? 'next' : 'later',
    landed: f.landed ? 'done' : landedNext ? 'next' : 'later',
  };
};

/** What each milestone says, by its state. */
export const MILESTONE_WORDS: Readonly<Record<Milestone, Readonly<Record<MilestoneState, string>>>> = {
  harness: {
    done: 'a harness is installed and signed in',
    next: 'activate a harness: it runs every session in your factories',
    later: 'activate a harness',
  },
  factory: {
    done: 'a factory is filed',
    next: 'make a first factory: with Nemia, from a template, or from scratch; it may start with no volume',
    later: 'file a factory',
  },
  volume: {
    done: 'a volume is mounted and trusted',
    next: 'give a factory a volume its runs mount',
    later: 'give a factory a volume',
  },
  landed: {
    done: "a run's change is merged into its base branch",
    next: 'start a first card, and merge its change into the base branch',
    later: 'merge a first change into its base branch',
  },
};
