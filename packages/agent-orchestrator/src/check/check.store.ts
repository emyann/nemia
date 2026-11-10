/**
 * The closeout of the step a check judges, on disk where the check reads it (`WF_CLOSEOUT`): a store, written only by the pass that files
 * the check (`fileCheck`).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Closeout } from '../closeout/index.ts';

/**
 * Where a check finds the closeout of the step it judges (`writeCheckCloseout`): beside the run records, outside every workspace, since a
 * file inside one would be committed by the next hand-off and ride the branch.
 */
export const checkCloseout = (home: string, taskId: string): string => path.join(home, 'checks', `${taskId}.closeout.json`);

/**
 * Write the closeout of the step a check judges where the check reads it (`WF_CLOSEOUT`): flat, as the harness returned it, the fields its
 * `output:` declares at the top level beside the four, so a check reads the names the agent's schema uses. Returns the path.
 */
export const writeCheckCloseout = (home: string, taskId: string, closeout: Closeout): string => {
  const { output, ...four } = closeout;
  const file = checkCloseout(home, taskId);
  fs.writeFileSync(file, `${JSON.stringify({ ...four, ...output }, null, 2)}\n`);
  return file;
};
