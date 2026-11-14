/** Why a stop is refused, read by the stop (`filing.ts`, `requestStop`) and its contract (`contracts/stop.contract.ts`). */
import { Schema } from 'effect';
import { verbTakes, type State } from '../domain.ts';
import { unknownTask } from '../text.ts';

/** A stop the runtime would not journal, and why, in words that say what to do instead. Nothing was written. */
export class StopRefused extends Schema.TaggedError<StopRefused>()('StopRefused', {
  message: Schema.String,
}) {}

/**
 * Why `requestStop` would not journal a stop, or `undefined`: a task it has no record of, and one its guard (`stoppable`, by
 * `verbTakes`) refuses — one that has settled, and one asked to stop already, whose next pass stops what runs and settles it.
 * Off the record alone, so it costs no registry call.
 */
export const stopRefusalOf = (taskId: string, state: State | undefined): string | undefined => {
  if (!state) return unknownTask(taskId);
  if (verbTakes('requestStop', state)) return undefined;
  if (state.settled)
    return `\`${taskId}\` has settled (${state.settled}): there is nothing left to stop. File a task that continues its session (\`resumeFrom\`) to go on.`;
  return `\`${taskId}\` has been asked to stop already: the next pass stops what runs and settles it. \`ae ls\` says when it has.`;
};
