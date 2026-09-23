/** A step's session output and its check's, as the board is given them: the end of each, and what a refused check said. */
import fs from 'node:fs';
import { checkStderr, phaseOfView, verdictWord } from 'agent-orchestrator';
import type { Run } from 'agent-orchestrator/run';
import type { Workflow } from 'agent-orchestrator/workflow';
import { e, type Views } from './store.ts';

/**
 * The command a step is judged by, and what it said once it refused.
 *
 * `command` is from the workflow the run froze at `wf start`: the one the run executes. `refused` is set
 * once the check settled failed or stopped: `exit` in `wf ls`'s words (`exit 1`, `unfinished`), then the
 * end of each of its streams, as `wf decide` shows them.
 */
export type StepCheck = {
  command: string;
  /** The check's task, once the run has filed it. */
  taskId: string | null;
  /**
   * What the check said of the work: `passed`, `exit 1`, `unfinished` for one that did not finish, `checking` while it runs,
   * and `unknown` for a task the engine has no record of. Null until the run files it.
   */
  verdict: string | null;
  refused: {
    exit: string;
    /**
     * Null on an earlier try's check: a session's output is read with a `logs` call, which observes every harness again, so
     * the page reads it for the current try's check alone. Its stderr is a file, and is read for every try.
     */
    stdout: StepLog | null;
    stderr: StepLog;
    /** Why its output could not be read, when it could not. */
    unreadable: string | null;
  } | null;
};

/** The tail of a step's session output, oldest line first. */
export type StepLog = {
  lines: string[];
  /**
   * Whether the api cut lines off the top. A harness can hand over less than all of its output
   * already — the detached runner keeps only its last few thousand characters — and that cut is
   * not visible here, so its first line may start mid-line.
   */
  truncated: boolean;
};

/** The last `max` lines of a session's output, and whether there were more. */
export function tailOf(output: string, max: number): StepLog {
  const lines = output.split(/\r?\n/);
  // Output that ends in a newline has not begun another line.
  if (lines.at(-1) === '') lines.pop();
  return lines.length > max ? { lines: lines.slice(-max), truncated: true } : { lines, truncated: false };
}

/** How many lines of each stream a refused check shows: as many as `wf decide` does (`CHECK_TAIL_LINES`). */
const CHECK_LINES = 20;

/**
 * A check of one try, off the engine's view of its task: the command, its verdict, and once it refused, what it exited with and
 * the end of its stderr — its output left unread (`StepCheck`). A check is filed for the step, so a settled one's record has a
 * verdict: an exit code, or `unfinished` — `exitVerdicts`' reading, for a try that need not be the current one.
 */
export function checkIn(command: string, taskId: string | undefined, views: Views): StepCheck {
  if (!taskId) return { command, taskId: null, verdict: null, refused: null };
  const view = views.get(taskId);
  const phase = phaseOfView(view);
  const exitCode = view?.state.attempts.at(-1)?.exitCode;
  const exit = verdictWord(typeof exitCode === 'number' ? exitCode : 'unfinished');
  const refused = phase === 'failed' || phase === 'stopped';
  return {
    command,
    taskId,
    verdict: phase === 'unknown' ? 'unknown' : phase === 'succeeded' ? 'passed' : refused ? exit : 'checking',
    refused: refused ? { exit, stdout: null, stderr: tailOf(endOf(checkStderr(taskId)), CHECK_LINES), unreadable: null } : null,
  };
}

/**
 * Each judged step's check: its command, and for a check that refused, what it said — what `checkReports`
 * in runner.ts reads for `wf ls` and `wf decide`, which the package does not export. A `logs` call per
 * refused check, which observes every harness again: on one run's page, and never on the list.
 */
export async function checksOf(run: Run, steps: readonly Workflow[], views: Views): Promise<Map<string, StepCheck>> {
  const checks = new Map<string, StepCheck>();
  for (const step of steps) {
    if (!step.check) continue;
    const check = checkIn(step.check, run.steps[step.name]?.check?.taskId, views);
    checks.set(step.name, check);
    if (!check.refused) continue;
    try {
      check.refused.stdout = tailOf(await e.logs(check.taskId!), CHECK_LINES);
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      check.refused.stdout = { lines: [], truncated: false };
      check.refused.unreadable = `Could not read the output of its check (task ${check.taskId}): ${why}. \`wf decide ${run.id}\` reads it the same way from the command line.`;
    }
  }
  return checks;
}

/** The end of a file that may be large, or absent: a check stopped before it started wrote no stderr. */
function endOf(file: string, bytes = 64_000): string {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const buf = Buffer.alloc(Math.min(size, bytes));
      fs.readSync(fd, buf, 0, buf.length, size - buf.length);
      return buf.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}
