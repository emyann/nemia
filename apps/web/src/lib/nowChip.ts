/**
 * The one chip a runs-page row draws for what its run does now: where its step stands (`nowStandsOf`), the chip's colour by that and by
 * whether the row waits on a person (`chipTone`, proved by `contracts/now-chip.contract.ts`), the kit's tag each colour is drawn as
 * (`CHIP_TAG`), and how many runs of the page wait on a run or its checkout (`waitersOf`). Pure.
 */
import type { WaitOn } from 'objects';
import type { ChipTone, ChipToneOf, NowCase, NowStands } from '../../contracts/now-chip.contract.ts';
import type { RunView } from './api/judged.ts';
import { type StepState, waitsOnPerson } from './status.ts';

export type { ChipTone } from '../../contracts/now-chip.contract.ts';

/**
 * The chip's colour: yellow where the row waits on a person, whatever its step stands as; else violet at work, red where it failed,
 * outlined where it waits on a run, a run slot, a hold, its assignee or its turn, and grey at rest alone.
 * @param now Where the row's step stands, and whether the row waits on a person.
 */
export const chipTone: ChipToneOf = (now: NowCase) => {
  if (now.yours) return 'yours';
  if (now.stands === 'atWork') return 'alive';
  if (now.stands === 'failed') return 'failure';
  if (now.stands === 'atRest') return 'rest';
  return 'waits';
};

/** The states at work: a session, or its check. */
const AT_WORK: ReadonlySet<StepState> = new Set(['working', 'checking']);

/** The states of a step that failed. */
const FAILED: ReadonlySet<StepState> = new Set(['failed', 'failed-check', 'unreadable']);

/** The states at rest: parked by the pause, called off, passed by, unknown, sent on, or done. */
const AT_REST: ReadonlySet<StepState> = new Set(['paused', 'cancelled', 'skipped', 'unknown', 'sent', 'verified', 'unverified']);

/** What a step not started stands as, by the thing it waits on: another run, a run slot, the pause, a hold. */
const ON: Record<WaitOn, NowStands> = { run: 'waitsOnARun', limit: 'waitsForASlot', pause: 'atRest', hold: 'held' };

/**
 * Where a row's step stands, as its chip reads it: at work, failed, at rest; held where a person holds the run and the step has not
 * started, or the hold stops it; a step that waits on a person's word in a run someone has in hand, assigned; a step not started by what
 * it waits on; and a step that waits on a person's word, still to come, whose chip `chipTone` draws yellow by the row's own wait.
 * @param state The step's state (`stepState`).
 * @param on What thing the step waits on, or null where it waits on none.
 * @param held Whether a person holds the run.
 * @param assigned Whether someone has the run in hand (its `assignee`).
 */
export function nowStandsOf(state: StepState, on: WaitOn | null, held: boolean, assigned = false) {
  if (AT_WORK.has(state)) return 'atWork';
  if (FAILED.has(state)) return 'failed';
  if (state === 'held') return 'held';
  const notStarted = state === 'waiting' || state === 'waiting-for-slot';
  if (notStarted && held) return 'held';
  if (assigned && !held && waitsOnPerson(state, false)) return 'assigned';
  if (state === 'waiting-for-slot') return 'waitsForASlot';
  if (state === 'waiting' && on !== null) return ON[on];
  return AT_REST.has(state) ? 'atRest' : 'toCome';
}

/**
 * How each colour of the chip is drawn: the kit's tag in the variant and colour of its role, or, for a session at work, which the
 * theme has no role for, the look's tag in the meaning (`color: 'alive'`, `MeaningTag`).
 */
export const CHIP_TAG: Record<ChipTone, { variant: 'tonal' | 'filled' | 'outlined'; color: 'neutral' | 'primary' | 'alive' | 'error' }> = {
  alive: { variant: 'tonal', color: 'alive' },
  yours: { variant: 'filled', color: 'primary' },
  failure: { variant: 'tonal', color: 'error' },
  waits: { variant: 'outlined', color: 'neutral' },
  rest: { variant: 'filled', color: 'neutral' },
};

/** A row as the fan counts it: its waits and its hold. */
type FanRow = Pick<RunView, 'id' | 'waiting' | 'holding'>;

/**
 * Which of `rows` wait on the run `id`, by id, or are held until it succeeds: a run that names it among the runs it waits on and the
 * store has, or one that names it among the runs its hold waits for that have not succeeded; each run once, never `id` itself.
 * @param rows The runs of the page, each with what it waits on and its hold.
 * @param id The run waited on.
 */
export const waitersOf = (rows: ReadonlyArray<FanRow>, id: string) =>
  rows
    .filter(
      (row) =>
        row.id !== id &&
        ((row.waiting?.runs.some((run) => run.run === id && !run.missing) ?? false) ||
          (row.holding?.runs.some((run) => run.run === id && !run.released) ?? false)),
    )
    .map((row) => row.id);
