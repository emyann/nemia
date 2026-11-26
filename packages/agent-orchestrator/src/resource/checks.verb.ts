/** A step's session output and its check's, as a run's page is given them: the end of each, and what a refused check said. */
import { Effect } from 'effect';
import { attemptVerdict, checkVerdictOf, verdictWord, type CheckVerdict } from '../check/index.ts';
import { phaseOfView } from '../views/views-words.ts';
import type { Views } from '../summary/reads.verb.ts';
import { checkTasksOf, type Run, type StepRecord } from '../record/record.ts';
import { checkLine, hasChecks, stepChecks, type StepSpec } from '../step/step.ts';
import { asked, type Engine } from '../runtime-client.ts';

/**
 * One verb of the engine, `read`, run to a Promise: what it succeeds with; its refusal as an `Error` whose `exitCode` is 2 and whose
 * message is led by `verb` (`output: …`), as `asked` words it; and any other failure as it failed.
 */
const engineRead = <A, F>(verb: string, read: Effect.Effect<A, F>) => Effect.runPromise(asked(verb, read)) satisfies Promise<A>;

/**
 * The command a step is judged by, and what it said once it refused.
 *
 * `command` is from the workflow the run froze at `nemia start`: the one the run executes. `refused` is set
 * once the check settled failed or stopped: `exit` in `nemia ls`'s words (`exit 1`, `unfinished`), then the
 * end of each of its streams, as `nemia decide` shows them.
 */
export type StepCheck = {
  /** The check's name: `check` for a step's `check: <line>`, else its name in the step's `checks:`. */
  name: string;
  command: string;
  /** When its latest attempt started and ended, null while it has not. */
  started: string | null;
  ended: string | null;
  /** The check's task, once the run has filed it. */
  taskId: string | null;
  /**
   * What the check said of the work, as codes (`CheckVerdict`): `passed` (exit 0), `failed` with its exit code, `unfinished` for one that
   * did not finish, `running` while it runs, and `unknown` for a task the engine has no record of. Null until the run files it.
   */
  verdict: CheckVerdict | null;
  /** The condition a check waits on, as it stands for the try the step is on: present on that check alone. */
  condition?: {
    name: string;
    try: number;
    status: 'True' | 'False' | 'Unknown' | null;
    message: string | null;
    writtenAt: string | null;
    lastTransitionTime: string | null;
    writer: { factory: string; program: string; phase: 'Pending' | 'Running' | 'Restarting' | 'Down'; message: string } | null;
  };
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

/**
 * The last `max` lines of a session's output, and whether there were more. Output that ends in a newline has not begun another line.
 * @param output The session's output.
 * @param max The most lines kept.
 */
export function tailOf(output: string, max: number) {
  const lines = output.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return (lines.length > max ? { lines: lines.slice(-max), truncated: true } : { lines, truncated: false }) satisfies StepLog;
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
 * @param e The engine the streams are read through.
 * @param run The run whose checks are read.
 * @param views The engine's views of the run's tasks, by task id.
 */
export async function refusedStderr(e: Engine, run: Run, views: Views) {
  const ids = Object.values(run.steps)
    .flatMap((r) => [r.check?.taskId, ...(r.tries ?? []).map((t) => t.check?.taskId)])
    .filter(refusedIn(views));
  const read = await Promise.all(
    [...new Set(ids)].map(async (id) => {
      try {
        const tail: [string, StepLog | string] = [
          id,
          tailOf((await engineRead('output', e.output(id, 'stderr', TAIL_BYTES))) ?? '', CHECK_LINES),
        ];
        return tail;
      } catch (err) {
        const unread: [string, StepLog | string] = [id, unreadableOutput(run, id, err)];
        return unread;
      }
    }),
  );
  return new Map(read) satisfies CheckStderr;
}

/** Why the output of a run's check could not be read, and where a person reads it instead. */
const unreadableOutput = (run: Run, taskId: string, err: unknown) =>
  `Could not read the output of its check (task ${taskId}): ${err instanceof Error ? err.message : String(err)}. \`nemia decide ${run.id}\` reads it the same way from the command line.`;

/**
 * A check of one try, off the engine's view of its task: the command, its verdict, and once it refused, what it exited with and
 * the end of its stderr, read before for every refused check (`refusedStderr`) — its stdout left unread (`StepCheck`). The verdict is
 * codes (`checkVerdictOf`), off the phase of its task and the package's `attemptVerdict` on the last attempt of the try's own check,
 * whichever try: its exit code, or `unfinished` for one that recorded none or that its deadline or an operator ended, as the tick,
 * `nemia ls` and `nemia decide` read it. `refused.exit` is that verdict in a person's words (`verdictWord`).
 * @param command The check's command.
 * @param taskId The task of the check, or undefined where it never started.
 * @param views The engine's views of the run's tasks, by task id.
 * @param stderr What each refused check printed on stderr, by its task (`refusedStderr`).
 * @param name The check's name: `check` for a step's `check: <line>`; a named check whose task the engine does not hold is not filed yet.
 */
function checkIn(command: string, taskId: string | undefined, views: Views, stderr: CheckStderr, name = 'check') {
  const view = taskId === undefined ? undefined : views.get(taskId);
  if (!taskId || (name !== 'check' && view === undefined))
    return { name, command, started: null, ended: null, taskId: null, verdict: null, refused: null } satisfies StepCheck as StepCheck;
  const attempt = view?.state.attempts.at(-1);
  const phase = phaseOfView(view);
  const verdict = attemptVerdict(view?.state.attempts.at(-1));
  const exit = verdictWord(verdict);
  const refused = refusedIn(views)(taskId);
  const said = stderr.get(taskId) ?? NO_LINES;
  return {
    name,
    command,
    started: attempt?.startedAt ?? null,
    ended: attempt?.endedAt ?? null,
    taskId,
    verdict: checkVerdictOf(phase, verdict),
    refused: refused
      ? {
          exit,
          stdout: null,
          stderr: typeof said === 'string' ? NO_LINES : said,
          unreadable: typeof said === 'string' ? said : null,
        }
      : null,
  } satisfies StepCheck as StepCheck;
}

/**
 * Each judged step's check: its command, and for a check that refused, what it said, as `nemia decide` shows it. The current try's stdout
 * is read through the engine's `output`, which observes no harness. A check that kept no stdout — filed before the runtime kept its
 * streams, or stopped before its process wrote one — is read off its log, as `nemia decide` reads it: a `logs` call that observes its
 * harness again, on one run's page and never on the list.
 * @param e The engine the streams are read through.
 * @param run The run whose checks are read.
 * @param steps The run's steps, each one with a check judged.
 * @param views The engine's views of the run's tasks, by task id.
 * @param stderr What each refused check printed on stderr, by its task (`refusedStderr`).
 */
export async function checksOf(e: Engine, run: Run, steps: readonly StepSpec[], views: Views, stderr: CheckStderr) {
  const checks = new Map<string, readonly StepCheck[]>();
  for (const step of steps) {
    if (!hasChecks(step)) continue;
    const list = checksIn(step, run.steps[step.name]?.check, views, stderr, run.steps[step.name]);
    checks.set(step.name, list);
    for (const check of list) {
      const id = check.taskId;
      if (!check.refused || id === null) continue;
      try {
        check.refused.stdout = tailOf(
          (await engineRead('output', e.output(id, 'stdout', TAIL_BYTES))) ?? (await engineRead('logs', e.logs(id))),
          CHECK_LINES,
        );
      } catch (err) {
        check.refused.stdout = NO_LINES;
        check.refused.unreadable ??= unreadableOutput(run, id, err);
      }
    }
  }
  return checks;
}

/**
 * Each check of a step on one try (`checkIn`), in the step's order: its `check: <line>` as one named `check`, or each of its `checks:`
 * by the task its record names; one not filed has no task. None for a step with no check.
 * @param step The step, whose checks are listed (`stepChecks`).
 * @param check The check on the try's record, or undefined where none was filed.
 * @param views The engine's views of the run's tasks, by task id.
 * @param stderr What each refused check printed on stderr, by its task (`refusedStderr`).
 * @param current The step's record while the try is the one it is on, whose written conditions a check that waits on one carries
 * (`StepCheck.condition`); left out for an earlier try, whose conditions the record no longer holds.
 */
export const checksIn = (step: StepSpec, check: StepRecord['check'], views: Views, stderr: CheckStderr, current?: StepRecord) =>
  stepChecks(step).map((c) => {
    const taskId = check ? Object.fromEntries(checkTasksOf(check))[c.name] : undefined;
    const filed = checkIn(checkLine(c), taskId, views, stderr, c.name);
    if (c.condition === undefined || current === undefined) return filed;
    const written = current.conditions?.[c.condition];
    return {
      ...filed,
      condition: {
        name: c.condition,
        try: (current.tries?.length ?? 0) + 1,
        status: written?.status ?? null,
        message: written?.message ?? null,
        writtenAt: written?.at ?? null,
        lastTransitionTime: written?.transitionedAt ?? null,
        writer: null,
      },
    } satisfies StepCheck;
  });

/**
 * A try's checks as an object serves them: each, where its step has several; nothing for one, whose check is `check`, or none.
 * @param checks The try's checks, in the step's order.
 */
export const severalChecks = (checks: readonly StepCheck[]) => (checks.length > 1 ? { checks } : {});

/**
 * The check a try is judged by, of its checks (`checksIn`): the first that refused, else the first that did not pass, else the first.
 * Null for a try with none.
 * @param checks The try's checks, in the step's order.
 */
export const decidingCheck = (checks: readonly StepCheck[]) =>
  checks.find((c) => c.refused) ?? checks.find((c) => c.verdict?.result !== 'passed') ?? checks[0] ?? null;

/**
 * Where the last read of a blocked session's conversation stopped, and what it had said last by then: by task and attempt. One for an app,
 * of its engine's sessions (the api's `ReadMemo`).
 */
export type LastSaid = Map<string, { cursor: string; line: string | null }>;

/**
 * What the session of the task `taskId` among `views` said last — its last `text` or `system` event, trimmed — through the engine's
 * `transcript`, or null when the views hold no such task, it has said none or its conversation cannot be read. What it said, not what it
 * was told: a brief, a `nemia say` and every tool result come back as `user` events (`TranscriptEvent`), and reading a person's own words
 * back to them says nothing about why the harness stopped.
 *
 * Each read costs an observation of the task's harness: the attempt of a session the harness blocked has not ended, so its session's id
 * is on no record, and the engine asks the harness for it. Read on a run's detail, as a refused check's output is, and never on the
 * list.
 *
 * Read from where the last read of the same attempt stopped, so a page polled every five seconds reads what the session wrote since,
 * not its whole conversation again (`said`); a cursor the engine refuses, of a transcript replaced since, is read again from the start. A
 * read's cache, and nothing is decided by it: a fresh app reads from the start.
 * @param e The engine the conversation is read through.
 * @param views The engine's views of the run's tasks, by task id.
 * @param taskId The session's task, or null where there is none.
 * @param said Where the last read of each attempt stopped, updated by this read.
 */
export async function lastLineOf(e: Engine, views: Views, taskId: string | null, said: LastSaid) {
  const view = taskId === null ? undefined : views.get(taskId);
  if (view === undefined) return null;
  const key = `${view.id}#${view.state.attempts.length}`;
  const read = (after?: string) => engineRead('transcript', e.transcript(view.id, after)).catch(() => undefined);
  let from = said.get(key);
  let got = from ? await read(from.cursor) : undefined;
  if (!got) {
    from = undefined;
    got = await read();
  }
  if (!got) return null;
  const last = got.events
    .filter((event) => event.role !== 'user' && (event.kind === 'text' || event.kind === 'system') && event.text?.trim())
    .at(-1);
  const line = last?.text?.trim() ?? from?.line ?? null;
  said.set(key, { cursor: got.cursor, line });
  return line;
}
