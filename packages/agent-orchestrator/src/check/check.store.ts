/**
 * The closeout of the step a check judges, on disk where the check reads it (`WF_CLOSEOUT`): a store, written only by the pass that files
 * the check (`fileCheck`). And a check's whole output, as files in the folder of the step handed it (`writeCheckOutputs`), written only by
 * the pass that files that step.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Closeout } from '../closeout/index.ts';
import { REFUSAL_FILE_BYTES, type KeptFile, type RefusalKept } from './check.ts';

/**
 * Where a check finds the closeout of the step it judges (`writeCheckCloseout`): beside the run records, outside every workspace, since a
 * file inside one would be committed by the next hand-off and ride the branch.
 * @param home The store's root folder.
 * @param taskId The id of the check's task.
 */
export const checkCloseout = (home: string, taskId: string) => path.join(home, 'checks', `${taskId}.closeout.json`);

/**
 * Write the closeout of the step a check judges where the check reads it (`WF_CLOSEOUT`): flat, as the harness returned it, the fields its
 * `output:` declares at the top level beside the four, so a check reads the names the agent's schema uses. Returns the path.
 * @param home The store's root folder.
 * @param taskId The id of the check's task.
 * @param closeout The closeout of the step the check judges, as the harness returned it.
 */
export const writeCheckCloseout = (home: string, taskId: string, closeout: Closeout) => {
  const { output, ...four } = closeout;
  const file = checkCloseout(home, taskId);
  fs.writeFileSync(file, `${JSON.stringify({ ...four, ...output }, null, 2)}\n`);
  return file;
};

/** A stream of a check's task. */
type Stream = 'stdout' | 'stderr';

/**
 * Where a step is handed a stream of a check's whole output: `checks/<task>.<stream>.log` in the step's own files folder, which its session
 * reads.
 * @param dir The step's files folder (`artifactsDir`).
 * @param taskId The id of the check's task.
 * @param stream The stream.
 */
export const checkOutputFile = (dir: string, taskId: string, stream: Stream) => path.join(dir, 'checks', `${taskId}.${stream}.log`);

/**
 * Write a stream of a check's output where the step handed it reads it (`checkOutputFile`), its folder made first. Returns the path.
 * @param dir The step's files folder.
 * @param taskId The id of the check's task.
 * @param stream The stream.
 * @param text What the stream holds, as kept (`keptOutput`).
 */
const writeCheckOutput = (dir: string, taskId: string, stream: Stream, text: string) => {
  const file = checkOutputFile(dir, taskId, stream);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
};

/**
 * Write both streams of a check as kept (`keptOutput`) into a step's files folder, and answer what the step is handed of them
 * (`RefusalKept`): each file, its lines and its cut; or, where a write throws, why, naming the check's task, so the step is filed all the
 * same with the tail alone.
 * @param dir The step's files folder.
 * @param taskId The id of the check's task.
 * @param whole Each stream as kept, with its lines and whether it was cut.
 */
export const writeCheckOutputs = (dir: string, taskId: string, whole: Record<Stream, { text: string; lines: number; cut: boolean }>) => {
  try {
    const file = (stream: Stream) =>
      ({
        path: writeCheckOutput(dir, taskId, stream, whole[stream].text),
        lines: whole[stream].lines,
        cut: whole[stream].cut,
      }) satisfies KeptFile;
    return { stdout: file('stdout'), stderr: file('stderr'), capBytes: REFUSAL_FILE_BYTES } satisfies RefusalKept as RefusalKept;
  } catch (err) {
    return {
      unwritten: `${err instanceof Error ? err.message : String(err)}; the check is task ${taskId}`,
    } satisfies RefusalKept as RefusalKept;
  }
};
