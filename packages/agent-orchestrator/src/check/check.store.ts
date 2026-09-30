/**
 * The closeout of the step a check judges, on disk where the check reads it (`WF_CLOSEOUT`): a store, written only by the pass that files
 * the check (`fileCheck`); and where the check keeps its whole stdout (`WF_STDOUT`), written by the check's own script.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Closeout } from '../closeout/closeout.ts';
import { HOME } from '../record/record.store.ts';

/** Where a check finds the closeout of the step it judges, beside its stderr and for the same reason (`writeCheckCloseout`). */
export const checkCloseout = (taskId: string): string => path.join(HOME, 'checks', `${taskId}.closeout.json`);

/**
 * Where a check keeps its whole stdout (`WF_STDOUT`), beside its stderr: the lines it marks for the step after it are read here
 * (`reportedLines`), since the engine's log of the task keeps only its end.
 */
export const checkStdout = (taskId: string): string => path.join(HOME, 'checks', `${taskId}.stdout`);

/**
 * Write the closeout of the step a check judges where the check reads it (`WF_CLOSEOUT`): flat, as the harness returned it, the fields its
 * `output:` declares at the top level beside the four, so a check reads the names the agent's schema uses. Returns the path.
 */
export const writeCheckCloseout = (taskId: string, closeout: Closeout): string => {
  const { output, ...four } = closeout;
  const file = checkCloseout(taskId);
  fs.writeFileSync(file, `${JSON.stringify({ ...four, ...output }, null, 2)}\n`);
  return file;
};
