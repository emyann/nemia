/** A step's session output and its check's, as the board is given them: the end of each, and what a refused check said. */
import { attemptVerdict, phaseOfView, verdictWord, type CheckVerdict, type Views } from 'agent-orchestrator';
import type { Run } from 'agent-orchestrator/run';
import type { Workflow } from 'agent-orchestrator/workflow';
import { engineRead, type Engine } from '../store.ts';

/**
 * The command a step is judged by, and what it said once it refused.
 *
 * `command` is from the workflow the run froze at `nemia start`: the one the run executes. `refused` is set
 * once the check settled failed or stopped: `exit` in `nemia ls`'s words (`exit 1`, `unfinished`), then the
 * end of each of its streams, as `nemia decide` shows them.
 */
export type StepCheck = {
  command: string;
  /** The check's task, once the run has filed it. */
  taskId: string | null;
  /**
   * What the check said of the work, as codes (`CheckVerdict`): `passed` (exit 0), `failed` with its exit code, `unfinished` for one that
   * did not finish, `running` while it runs, and `unknown` for a task the engine has no record of. Null until the run files it.
   */
  verdict: CheckVerdict | null;
  refused: {
    exit: string;
    /** Null on an earlier try's check: the page reads the current try's stdout alone, and every try's stderr. */
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

/** The last `max` lines of a session's output, and whether there were more. Output that ends in a newline has not begun another line. */
export function tailOf(output: string, max: number): StepLog {
  const lines = output.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines.length > max ? { lines: lines.slice(-max), truncated: true } : { lines, truncated: false };
}

/** How many lines of each stream a refused check shows: as many as `nemia decide` does (`CHECK_TAIL_LINES`). */
const CHECK_LINES = 20;
/** How much of the end of a stream is asked of the engine, ample for `CHECK_LINES` lines. */
const TAIL_BYTES = 64_000;
const NO_LINES: StepLog = { lines: [], truncated: false };

/**
 * What each refused check of a run printed on stderr, by its task: the end of it, or the sentence saying why the engine could not give
 * it.
 */
export type CheckStderr = ReadonlyMap<string, StepLog | string>;

const refusedIn =
  (views: Views) =>
  (taskId: string | undefined): taskId is string => {
    const phase = taskId ? phaseOfView(views.get(taskId)) : undefined;
    return phase === 'failed' || phase === 'stopped';
  };

/**
 * The stderr of every refused check of the run, every try's — the current one's and each one its record keeps behind it — read through
 * the engine's `output`, which observes no harness. A check that kept no stderr, or never started, has none; one the engine could not
 * give its stream of is said why, with the command that reads it from the command line.
 */
export async function refusedStderr(e: Engine['Service'], run: Run, views: Views): Promise<CheckStderr> {
  const ids = Object.values(run.steps)
    .flatMap((r) => [r.check?.taskId, ...(r.tries ?? []).map((t) => t.check?.taskId)])
    .filter(refusedIn(views));
  const read = await Promise.all(
    [...new Set(ids)].map(async (id): Promise<[string, StepLog | string]> => {
      try {
        return [id, tailOf((await engineRead('output', e.output(id, 'stderr', TAIL_BYTES))) ?? '', CHECK_LINES)];
      } catch (err) {
        return [id, unreadableOutput(run, id, err)];
      }
    }),
  );
  return new Map(read);
}

/** Why the output of a run's check could not be read, and where a person reads it instead. */
const unreadableOutput = (run: Run, taskId: string, err: unknown): string =>
  `Could not read the output of its check (task ${taskId}): ${err instanceof Error ? err.message : String(err)}. \`nemia decide ${run.id}\` reads it the same way from the command line.`;

/**
 * A check of one try, off the engine's view of its task: the command, its verdict, and once it refused, what it exited with and
 * the end of its stderr, read before for every refused check (`refusedStderr`) — its stdout left unread (`StepCheck`). The verdict is
 * the package's `attemptVerdict` on the last attempt of the try's own check, whichever try: its exit code, or `unfinished` for one that
 * recorded none or that its deadline or an operator ended, as the tick, `nemia ls` and `nemia decide` read it.
 */
export function checkIn(command: string, taskId: string | undefined, views: Views, stderr: CheckStderr): StepCheck {
  if (!taskId) return { command, taskId: null, verdict: null, refused: null };
  const view = views.get(taskId);
  const phase = phaseOfView(view);
  const exit = verdictWord(attemptVerdict(view?.state.attempts.at(-1)));
  const refused = refusedIn(views)(taskId);
  const said = stderr.get(taskId) ?? NO_LINES;
  return {
    command,
    taskId,
    verdict: phase === 'unknown' ? 'unknown' : phase === 'succeeded' ? 'passed' : refused ? exit : 'checking',
    refused: refused
      ? {
          exit,
          stdout: null,
          stderr: typeof said === 'string' ? NO_LINES : said,
          unreadable: typeof said === 'string' ? said : null,
        }
      : null,
  };
}

/**
 * Each judged step's check: its command, and for a check that refused, what it said, as `nemia decide` shows it. The current try's stdout
 * is read through the engine's `output`, which observes no harness. A check that kept no stdout — filed before the runtime kept its
 * streams, or stopped before its process wrote one — is read off its log, as `nemia decide` reads it: a `logs` call that observes its
 * harness again, on one run's page and never on the list.
 */
export async function checksOf(
  e: Engine['Service'],
  run: Run,
  steps: readonly Workflow[],
  views: Views,
  stderr: CheckStderr,
): Promise<Map<string, StepCheck>> {
  const checks = new Map<string, StepCheck>();
  for (const step of steps) {
    if (!step.check) continue;
    const check = checkIn(step.check, run.steps[step.name]?.check?.taskId, views, stderr);
    checks.set(step.name, check);
    if (!check.refused) continue;
    try {
      const id = check.taskId!;
      check.refused.stdout = tailOf(
        (await engineRead('output', e.output(id, 'stdout', TAIL_BYTES))) ?? (await engineRead('logs', e.logs(id))),
        CHECK_LINES,
      );
    } catch (err) {
      check.refused.stdout = NO_LINES;
      check.refused.unreadable ??= unreadableOutput(run, check.taskId!, err);
    }
  }
  return checks;
}
