/**
 * Whether a run has ended, and for good: one table over a run's status (`RUN_ENDING`), which every reader asking "is this run over"
 * takes in place of a list of statuses of its own (contracts/run-ending.contract.ts). A run's status is `assess`'s, worked out afresh on
 * every pass and never written, so this draws no move: it says what each status means to what comes after. Typed over objects'
 * `RunStatusWord`, so a status added there with no line here fails the typecheck. Pure.
 */
import type { RunStatusWord } from 'objects';
import type { RunEnding, RunEndingOf } from '../../contracts/run-ending.contract.ts';

/** How each status of a run stands to its end. */
const RUN_ENDING: Readonly<Record<RunStatusWord, RunEnding>> = {
  running: 'going',
  'awaiting approval': 'going',
  waiting: 'going',
  failed: 'broken',
  succeeded: 'over',
  cancelled: 'over',
};

/**
 * How a run stands to its end, by its status (`RUN_ENDING`).
 * @param status The run in one word, as a pass worked it out from its steps.
 * @public
 */
export const runEndingOf: RunEndingOf = (status) => RUN_ENDING[status];

/**
 * Whether a run has ended: it is broken or over, and files nothing until a person tries a step of it again.
 * @param status The run in one word, as a pass worked it out from its steps.
 */
export const runEnded = (status: RunStatusWord) => runEndingOf(status) !== 'going';

/**
 * Whether a run is over for good: it succeeded or was called off, and nothing of it is tried again.
 * @param status The run in one word, as a pass worked it out from its steps.
 */
export const runOver = (status: RunStatusWord) => runEndingOf(status) === 'over';
