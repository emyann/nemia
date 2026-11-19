/**
 * A harness's two checks (`HarnessCheck`), carried on its install piece of the readiness read and drawn as two ticks by the board's Setup,
 * its welcome and `nemia doctor`: the version its installed program answers, read by running it, against the pin this release was tested
 * with (`version`), and one tiny real turn through it, started by the server and bounded in time and spend, whose answer is the tick
 * (`turn`). A turn is started by `POST /api/readiness/turns` (`TurnStart`) and read back by its id (`HarnessTurn`).
 */
import { Schema } from 'effect';
import { describedNumber } from './meta.ts';
import { ReadinessFix } from './readiness-fix.ts';
import { HARNESS_CHECK_STATES, HARNESS_CHECKS, TURN_FAILURES } from './words.ts';

/**
 * One check of a harness: which (`name`), where it stands (`state`), a sentence of it (`message`), its fixes, and what it read — the
 * version found and the pin of a version check, the answer, the cost, why it failed, the turn's id and when it started of a turn check.
 */
export const HarnessCheck = Schema.Struct({
  name: Schema.Literals(HARNESS_CHECKS).annotate({
    description: 'Which check: the version its program answers against the pin, or one tiny real turn through it.',
  }),
  state: Schema.Literals(HARNESS_CHECK_STATES).annotate({
    description: 'Where it stands: passed, failed, running (a turn not yet settled) or unrun (no turn was started).',
  }),
  message: Schema.String.annotate({
    description: 'A sentence of what it found, or why it failed, in the harness’s own words where it said some.',
  }),
  fixes: Schema.Array(ReadinessFix).annotate({ description: 'The ways to make it pass: the install to start again, the sign-in to type.' }),
  found: Schema.optionalKey(Schema.String.annotate({ description: 'The version the installed program answered, for the version check.' })),
  pin: Schema.optionalKey(Schema.String.annotate({ description: 'The version this release was tested with, for the version check.' })),
  answer: Schema.optionalKey(Schema.String.annotate({ description: 'What the harness answered, for a turn check that passed.' })),
  costUsd: Schema.optionalKey(describedNumber('What the turn cost in dollars, as the harness counted it; absent where it said none.')),
  capUsd: Schema.optionalKey(describedNumber('The spend cap the turn runs under, in dollars, for a turn check.')),
  failure: Schema.optionalKey(
    Schema.Literals(TURN_FAILURES).annotate({
      description:
        'Why a turn check failed: its deadline, its spend cap, it never started, a person stopped it, or the harness said nothing.',
    }),
  ),
  turn: Schema.optionalKey(Schema.String.annotate({ description: "The turn's id, for a turn check that was started." })),
  at: Schema.optionalKey(Schema.String.annotate({ description: 'When the turn was started, as an ISO 8601 time.' })),
}).annotate({
  description: 'One check of a harness: its version against the pin, or one tiny real turn through it, with where it stands and its fixes.',
});
export type HarnessCheck = typeof HarnessCheck.Type;

/** `POST /api/readiness/turns`' body: the harness to start a check turn through. */
export const TurnStart = Schema.Struct({
  harness: Schema.String.annotate({ description: 'The harness to start a check turn through, by its name (claude).' }),
});
export type TurnStart = typeof TurnStart.Type;

/** A check turn: its id, its harness, and the check it comes to (`HarnessCheck`, named `turn`). */
export const HarnessTurn = Schema.Struct({
  id: Schema.String.annotate({ description: "The turn's id." }),
  harness: Schema.String.annotate({ description: 'The harness it runs through.' }),
  check: HarnessCheck,
});
export type HarnessTurn = typeof HarnessTurn.Type;
