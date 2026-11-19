/**
 * The colour of the one chip a runs-page row draws for what its run does now (`chipTone`, src/lib/nowChip.ts): the chip names the step
 * the run is on, and its colour says the state. Yellow is only what waits on a person; violet a step at work; red a step that failed and
 * waits on nobody; a wait on a run, a run slot or a hold is outlined; and grey is only what is at rest. A held run's step is drawn as a
 * step not started, outlined, never grey (the person's rule of 1 Nov).
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * Where the step a row is on now stands, as the chip reads it (implement maps the board's `StepState`, the step's `on` and the run's hold
 * onto it in src/lib/nowChip.ts): at work (a session or its check), failed, waiting on another run or the checkout, waiting for a run
 * slot, held by a person, still to come, or at rest (the store's pause, called off, skipped, unknown).
 */
export type NowStands = 'atWork' | 'failed' | 'waitsOnARun' | 'waitsForASlot' | 'held' | 'toCome' | 'atRest';

/** The row's step now, by where it stands, and whether the row waits on a person (its step's state, or the run's own wait). */
export type NowCase = { readonly stands: NowStands; readonly yours: boolean };

/**
 * The chip's colour by its meaning: `alive` the filled secondary container, `yours` the filled primary, `failure` the error container,
 * `waits` the outline-variant hairline in on-surface-variant ink, `rest` the inverse surface.
 */
export type ChipTone = 'alive' | 'yours' | 'failure' | 'waits' | 'rest';

/** Whether a step waits on something that is not a person: a run, a run slot, a hold, or its turn. */
const waits = (stands: NowStands) => stands === 'waitsOnARun' || stands === 'waitsForASlot' || stands === 'held' || stands === 'toCome';

const chipToneSpec = spec<(now: NowCase) => ChipTone>({
  ensures: {
    yellowIsWhatWaitsOnAPerson: {
      description: 'The chip is yellow exactly when the row waits on a person, whatever its step stands as',
      condition: ({ input: [now], output }) => (output === 'yours') === now.yours,
    },
    aFailureIsRed: {
      description: 'A step that failed and waits on nobody is drawn in the error container',
      condition: ({ input: [now], output }) => now.yours || now.stands !== 'failed' || output === 'failure',
    },
    onlyAFailureIsRed: {
      description: 'Nothing but a failed step is red',
      condition: ({ input: [now], output }) => output !== 'failure' || now.stands === 'failed',
    },
    atWorkIsViolet: {
      description: 'A step at work that waits on nobody is drawn in the secondary container',
      condition: ({ input: [now], output }) => now.yours || now.stands !== 'atWork' || output === 'alive',
    },
    onlyWorkIsViolet: {
      description: 'Nothing but a step at work is violet',
      condition: ({ input: [now], output }) => output !== 'alive' || now.stands === 'atWork',
    },
    aWaitIsOutlined: {
      description: 'A step waiting on a run, a run slot, a hold or its turn, and on no person, is outlined',
      condition: ({ input: [now], output }) => now.yours || !waits(now.stands) || output === 'waits',
    },
    heldIsNeverGrey: {
      description: 'A held run is drawn as not started, never grey',
      condition: ({ input: [now], output }) => now.stands !== 'held' || output !== 'rest',
    },
    greyOnlyAtRest: {
      description: 'The chip is grey only where its step is at rest',
      condition: ({ input: [now], output }) => output !== 'rest' || now.stands === 'atRest',
    },
    atRestIsGrey: {
      description: 'A step at rest that waits on nobody is grey',
      condition: ({ input: [now], output }) => now.yours || now.stands !== 'atRest' || output === 'rest',
    },
  },
});

/** `chipTone`'s type, which src/lib/nowChip.ts takes. */
export type ChipToneOf = Implementation<typeof chipToneSpec>;
