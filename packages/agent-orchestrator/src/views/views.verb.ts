/**
 * What the runtime's views of a run's tasks say, read into the words the pure functions take: a step's closeout and whether it was asked
 * for one, what its sessions cost, what its check exited with and said, and what the checks of the steps it follows said, what was said
 * to it, what the runs it waits on concluded (`parentOf`), what each step consumed, and when each task was filed. A task's phase and the
 * engine's word for it are `views-words.ts`'s. A controller: it reads the runtime through the client (`runtime-client.ts`), and the
 * store's files beneath it, and files nothing — the tick (`tick.verb.ts`), the verbs and the screens read through it. Each read of the
 * engine is an Effect program that requires the engine as a service (`EngineService`) — `taskPhasesRead`, `checkReportsRead`,
 * `refusalRead`, `checksHandedRead`, `landingSaidRead`, `parentRead`, `parentsRead`, `filingsRead` — and fails with a refusal and dies
 * of anything else.
 * What reads only views already read is plain.
 */
import { Cause, Deferred, Effect, Exit } from 'effect';
import { EngineService, asked, denialText, tried, type Engine, type TaskView } from '../runtime-client.ts';
import {
  attemptVerdict,
  failingLines,
  lastLines,
  reportedLines,
  type CheckHanded,
  type CheckRefusal,
  type LandingSaid,
  type Verdict,
} from '../check/check.ts';
import type { Workflow } from '../step/step.ts';
import { resultSteps } from '../branches/index.ts';
import { isRepositoryRun, stepTasks, type CloseoutAsked, type Run, type StepRecord, type TaskPhase } from '../record/record.ts';
import type { Said } from '../say/say.ts';
import { taskSpend, type SpendOf, type Consumed } from '../status/status.ts';
import { waitedOn, type ParentRun } from '../wait/wait.ts';
import { decision } from '../decide/decide.ts';
import { parseCloseout, type Closeout } from '../closeout/index.ts';
import { taskUsage } from '../timeline/index.ts';
import { runStore } from '../record/files.store.ts';
import { stepsOf } from '../record/record.store.ts';
import { parentRecord, landedOf, type BranchReader } from '../branches/branches.store.ts';
import { continuesFrom } from '../retry/index.ts';
import { phaseOfView, unsignedEnd, wordOfView, type EnginePhase } from './views-words.ts';

/**
 * The attempts of a task's current turn: every attempt of a task not held open, and of one held open those since the last answer a
 * person gave it (`answer`). What says how the step's session stands now — its closeout, whether it signed, what it was denied — since an
 * answered task keeps the attempts of the turns before it, and the turn it answered signed `blocked`.
 */
const currentTurn = (state: TaskView['state']): TaskView['state']['attempts'] =>
  state.attempts.filter((a) => (a.turn ?? 0) === (state.inputs?.length ?? 0));

/**
 * How many answers a task held open has been given (`answer`): the turns after its first. Zero for any other task, and for one nobody read.
 * What tells a turn a pass started and died before writing down (`adoptTries`) from one the record already holds.
 */
export const answersIn = (view: TaskView | undefined): number => (view?.state.holdOpen ? (view.state.inputs?.length ?? 0) : 0);

/**
 * The engine a pass's `advance` reads, whose `view` of a task the runtime's pass reported is that report's (`TickReport.views`): a view
 * built off the pass's one observation, where `e.view` would observe the task's harness again, on every pass, for every step in
 * flight.
 *
 * A task the report does not carry is read with `e.view`, and that asks no harness in the common case. The report carries every task the
 * runtime's pass left unsettled, so what it lacks is a task settled — read off its record, and found by name where its record lacks its
 * session's id, never observed — or one never filed, which is read as `unknown`. Either is read once for the value's life, which is the
 * pass's, and kept: every later `view` of it, and `list` of it among others, answers what was read. `list` asks the engine for the tasks
 * it neither was reported nor has read, in one `list`, and answers every task it was handed in their first order, a task whose journal
 * does not read left out and named as the engine named it; a list of every task (no ids), or of anything else, is the engine's. A read
 * that failed is not kept.
 *
 * And a task a verb of this pass has changed since is read again: `file`, `admit`, `answer`, `stop`, `close` and `say` each drop the view
 * of the tasks they name, when the verb runs, so what `advance` reads after its own act is the engine's, never a report or a read from
 * before it. A verb this does not know drops every view, for the same reason, and so does any verb while a read is in flight: what that
 * read answers is not kept.
 */
export function reportedEngine(e: Engine, views: readonly TaskView[]): Engine {
  const kept = new Map<unknown, TaskView>(views.map((v) => [v.id, v]));
  let writes = 0;
  const keep = (read: readonly TaskView[], at: number) => {
    if (writes === at) for (const v of read) kept.set(v.id, v);
  };
  const view = (taskId: string) =>
    Effect.suspend(() => {
      const was = kept.get(taskId);
      if (was) return Effect.succeed(was);
      const at = writes;
      return e.view(taskId).pipe(Effect.tap((read) => Effect.sync(() => keep([read], at))));
    });
  const list = (ids: readonly string[]) =>
    Effect.suspend(() => {
      const wanted = [...new Set(ids)];
      const missing = wanted.filter((id) => !kept.has(id));
      const at = writes;
      const read: Effect.Effect<TaskList, Effect.Error<ReturnType<Engine['list']>>> = missing.length
        ? e.list(missing)
        : Effect.succeed({ views: [], unreadable: [] });
      return read.pipe(
        Effect.map((got) => {
          const fresh = new Map<unknown, TaskView>(got.views.map((v) => [v.id, v]));
          keep(got.views, at);
          const answered = wanted.flatMap((id) => fresh.get(id) ?? (missing.includes(id) ? [] : [kept.get(id)!]));
          return { views: answered, unreadable: got.unreadable } satisfies TaskList;
        }),
      );
    });
  return droppingOnWrite(
    e,
    (taskId) => {
      writes++;
      kept.delete(taskId);
    },
    () => {
      writes++;
      kept.clear();
    },
    {
      view,
      list: ((...args: unknown[]) =>
        args.length === 1 && Array.isArray(args[0])
          ? list(args[0] as string[])
          : (e.list as (...a: unknown[]) => unknown)(...args)) as Engine['list'],
    },
    (key) => ENGINE_READS.has(key),
  );
}

/** What the engine's `list` answers: the views of the tasks it read, and each whose journal did not read. */
type TaskList = Effect.Success<ReturnType<Engine['list']>>;

/**
 * The engine a command reads — `nemia ls`, `nemia decide` — whose `view` of a task is read once for the whole command: `nemia ls` views a
 * run's tasks, and again each run another waits on, and `nemia decide` its current tries and then every try. A view is the engine's word at
 * the moment it was read, and a command is one moment; nothing is kept past the command. A verb that changes a task drops what was read of
 * it, as `reportedEngine` does, and a pass — a `tick`, an `up` or a `start` — drops all of it, so a command that acts reads the engine's
 * word after its act. A view that failed is not kept: the next read asks the engine again. Two reads of one task at once share the one
 * read.
 */
export function viewedOnce(e: Engine): Engine {
  type Read = Deferred.Deferred<TaskView, Effect.Error<ReturnType<Engine['view']>>>;
  const read = new Map<unknown, Read>();
  return droppingOnWrite(
    e,
    (taskId) => read.delete(taskId),
    () => read.clear(),
    {
      view: (taskId) =>
        Effect.suspend(() => {
          const held = read.get(taskId);
          if (held) return Deferred.await(held);
          const pending: Read = Deferred.makeUnsafe();
          read.set(taskId, pending);
          return e.view(taskId).pipe(
            Effect.onExit((exit) => {
              if (Exit.isFailure(exit) && read.get(taskId) === pending) read.delete(taskId);
              return Deferred.done(pending, exit);
            }),
          );
        }),
    },
    (key) => ENGINE_READS.has(key) && key !== 'tick' && key !== 'up' && key !== 'start',
  );
}

/**
 * `e` with `own` in place of its verbs of the same name, and every other verb that changes a task dropping what a wrapper kept of it,
 * when the Effect runs: the tasks `ENGINE_WRITES` names for it (`dropped`), else everything (`dropAll`). A verb `passes` is `e`'s own.
 */
function droppingOnWrite(
  e: Engine,
  dropped: (taskId: unknown) => void,
  dropAll: () => void,
  own: Partial<Engine>,
  passes: (verb: string) => boolean,
): Engine {
  const wrapped: Record<string, unknown> = { ...e, ...own };
  for (const [verb, value] of Object.entries(e)) {
    if (verb in own || typeof value !== 'function' || passes(verb)) continue;
    wrapped[verb] = (...args: unknown[]) =>
      Effect.suspend(() => {
        const named = ENGINE_WRITES[verb];
        if (named) for (const taskId of named(args)) dropped(taskId);
        else dropAll();
        return (value as (...a: unknown[]) => Effect.Effect<unknown, unknown>).apply(e, args);
      });
  }
  return wrapped as Engine;
}

/** The engine's verbs that change no task. */
const ENGINE_READS = new Set([
  'tick',
  'list',
  'logs',
  'output',
  'transcript',
  'path',
  'feed',
  'watch',
  'io',
  'tallied',
  'up',
  'start',
  'sweep',
  'kept',
  'removeBody',
  'mcpState',
  'mcpSignIn',
  'mcpSignInState',
  'mcpSignOut',
]);

/** The engine's verbs that change a task, each with the tasks it names: a filing names the task it files, which a read may have kept. */
const ENGINE_WRITES: Readonly<Record<string, (args: unknown[]) => readonly unknown[]>> = {
  file: ([spec]) => [(spec as { id?: unknown } | undefined)?.id],
  admit: ([ids]) => (Array.isArray(ids) ? ids : []),
  answer: ([id]) => [id],
  stop: ([id]) => [id],
  close: ([id]) => [id],
  say: ([id]) => [id],
  forget: ([ids]) => (Array.isArray(ids) ? ids : []),
};

/**
 * The engine's word on every task this run has filed, read once.
 *
 * One read per task per pass, shared by everything that then wants an answer: `advance` needs the
 * views themselves (for the session id a `resume:` step continues), and the pure functions need
 * only the phase.
 *
 * `earlierTries` reads each try a step has left behind as well. They are read for one thing — what the step's tries have cost together,
 * which the cap in force on it is held to (`stepSpend`, `overBudget`, `budgetUsdFor`) — and every reader of that is gated on there being a
 * cap (`budgetOf`), so with none in force they are read and never asked. A screen reads them all the same (`decide` prints what a run cost
 * and its timeline over every try), and so does anything that must answer for a try that is over. The tick does not: `advance` asks for
 * them only while a cap is in force, because each is a read off the task's journal — no harness asked, but a read per try per pass — and
 * a step answered without limit — the supervisor, which is answered for as long as a person keeps answering — would otherwise add one
 * journal read per answer to every pass, for ever, buying nothing.
 *
 * Reads the tasks one at a time, in the order of the run's steps. Never fails: a view's refusal it dies of in the runtime's words
 * (`asked`), and of anything else as it was thrown.
 */
export const taskPhasesRead = Effect.fn('taskPhases')(function* (run: Run, { earlierTries = true }: { earlierTries?: boolean } = {}) {
  const e = yield* EngineService;
  const views = new Map<string, TaskView>();
  for (const { taskId, check, tries } of Object.values(run.steps)) {
    if (taskId) views.set(taskId, yield* asked('view', e.view(taskId)));
    if (check) views.set(check.taskId, yield* asked('view', e.view(check.taskId)));
    if (earlierTries) for (const t of tries ?? []) if (!views.has(t.taskId)) views.set(t.taskId, yield* asked('view', e.view(t.taskId)));
  }
  return {
    views,
    phaseOf: (taskId: string): TaskPhase => phaseOfView(views.get(taskId)),
  };
});

/** `views`, with the engine's view of every earlier try's task and check they do not hold (`e`, the call's `viewedOnce`). */
export const everyTryOf = Effect.fn('everyTryOf')(function* (e: Engine, run: Run, views: ReadonlyMap<string, TaskView>) {
  const everyTry = new Map(views);
  for (const record of Object.values(run.steps)) {
    for (const t of record.tries ?? []) {
      for (const taskId of [t.taskId, t.check?.taskId]) {
        if (taskId && !everyTry.has(taskId)) everyTry.set(taskId, yield* asked('view', e.view(taskId)));
      }
    }
  }
  return everyTry;
});

/**
 * Whether a task was asked for a closeout: the schema the engine keeps on its record of the filing — and `unsigned` when its last
 * attempt ended without it (`unsignedEnd`), which the runtime reports and the orchestrator judges. What tells a step that ended
 * without one — `unsigned` — from a task that was never asked, and from one that failed. Exported, log-free, for a consumer that
 * words a step as `nemia ls` does.
 */
export const closeoutAsked =
  (views: ReadonlyMap<string, TaskView>) =>
  (taskId: string): CloseoutAsked => {
    const state = views.get(taskId)?.state;
    if (!state?.closeoutSchema) return false;
    return unsignedEnd(state, currentTurn(state).at(-1)) ? 'unsigned' : true;
  };

/**
 * Whether the harness marked a task's session blocked while its attempt runs — the engine's `needs-human` — off views already read. What
 * tells a step waiting on a person with nothing signed, as on a login refresh the harness lost, from one still working (`retryable`).
 * Exported, log-free, for a consumer that asks `retry` for such a step as `nemia retry` does.
 */
export const harnessBlocked =
  (views: ReadonlyMap<string, TaskView>) =>
  (taskId: string): boolean =>
    views.get(taskId)?.phase === 'needs-human';

/**
 * What the harness says a task's blocked session waits for, in its own words (`TaskView.waitingFor`), off views already read — as a remote
 * A2A agent's Task says it. `undefined` for a task nobody is waiting on, and for a harness that says nothing: the
 * detached ones never do. Costs no observation of its own: the engine read it on the same pass it read the phase.
 *
 * Exported, log-free, for a consumer that words a step as `nemia ls` does. The words themselves are `waitingWords` and `harnessWaitLine` in
 * list/list.ts, which is the only place this repository turns the harness's word into a sentence.
 */
export const waitingOf =
  (views: ReadonlyMap<string, TaskView>) =>
  (taskId: string): string | undefined =>
    views.get(taskId)?.waitingFor;

/**
 * Why the runtime could not read a task's session alone, in its own words (`TaskView.unreadWhy`), off its view already read: what one
 * line of its output said that did not decode. Null for no view, and for a task whose session was read, settled or never started, and
 * on the first look that reads it: the runtime says it afresh on every look, and nothing here keeps it.
 */
export const unreadOf = (view: TaskView | undefined): string | null => view?.unreadWhy ?? null;

/**
 * A session's web link, as a person opens it from a browser or a phone: `url` where it is up, else null and `why` says what keeps it
 * down; `why` is null where `url` is set.
 */
export type Bridge = { url: string | null; why: string | null };

/**
 * Whether a task's session is reachable on the web, off views already read (`TaskView.bridge`): its link where the bridge is up, why not
 * where it was asked and is not, and null where the task was not filed bridged, or is not viewed. Costs no observation of its own.
 *
 * Exported, log-free, for a consumer that shows a person where to reach a session, as `nemia level` and a run's step detail do.
 */
export const bridgeOf =
  (views: ReadonlyMap<string, TaskView>) =>
  (taskId: string): Bridge | null => {
    const bridge = views.get(taskId)?.bridge;
    if (bridge === undefined) return null;
    return bridge.url === null ? { url: null, why: bridge.why } : { url: bridge.url, why: null };
  };

/**
 * What a task's sessions were denied, off views already read: every call the harness refused on an attempt, a running one's so far, as
 * a permission rule names it (`denialText`: `Skill(look)`, `Bash(pytest)`), each text once, in the order first denied. Empty for a task
 * nobody read, one whose attempts denied nothing, and one whose harness cannot say — a codex session records none (the runtime's
 * `Attempt.denials`) — so an empty list is not a claim that nothing was denied. Costs no observation of its own: the denials
 * are on the engine's journal.
 *
 * Every attempt of the task, not only its last: an attempt the engine started again within one filing is the same try, and what the first
 * was denied is still what the step could not do. A try is a task of its own (`checkTaskId`, `sessionTasks`), so the current try's task
 * says the current try's denials, and a try filed after them starts with none. A try that answers a task held open is a turn of that task
 * (`currentTurn`), and says the denials of its own attempts: what the turn it answered was denied was that try's.
 *
 * Exported, log-free, for a consumer that words a step as `nemia ls` does. The words themselves are `deniedWords` in list/list.ts.
 */
export const deniedOf =
  (views: ReadonlyMap<string, TaskView>) =>
  (taskId: string): string[] => {
    const state = views.get(taskId)?.state;
    return [...new Set((state ? currentTurn(state) : []).flatMap((a) => (a.denials ?? []).map(denialText)))];
  };

/**
 * What each task's sessions cost, off views already read (`taskSpend`): what holds a step to its `budget:`, and what `nemia ls` and
 * `nemia decide` print beside it — and what they were denied (`deniedOf`), which stops a step that says `denials: fail`. Exported,
 * log-free, for a consumer that words a step as `nemia ls` does. A task with no view read has no spend known.
 */
export const spendReader =
  (views: ReadonlyMap<string, TaskView>): SpendOf =>
  (taskId) => {
    const spent = taskSpend(views.get(taskId));
    return spent && { ...spent, denied: deniedOf(views)(taskId) };
  };

/**
 * What each step's current check exited with, off the engine's record (`attemptVerdict`): the code its process gave, or `unfinished` when
 * it gave none — killed by a signal, stopped, or never started — or when the operator or its deadline cut it short, whatever code its
 * process died with; and `undefined` for a step with no check filed. What the tick tells a refusal from a check that did not finish by
 * (`refusedCheck`), and what `nemia ls` words, without reading a stream: a run waiting on a person costs no more each pass.
 *
 * Exported for a consumer that words a check as `nemia ls` does.
 */
export const exitVerdicts =
  (views: ReadonlyMap<string, TaskView>, run: Run) =>
  (step: string): Verdict | undefined => {
    const taskId = run.steps[step]?.check?.taskId;
    return taskId ? attemptVerdict(views.get(taskId)?.state.attempts.at(-1)) : undefined;
  };

/**
 * The harness's own id for the session a try after the task continues — what `--resume` takes: its last session's, or, where the harness
 * never named that one, the session it was started to continue (`continuesFrom`).
 */
export const sessionIn = (views: ReadonlyMap<string, TaskView>, taskId: string): string | undefined =>
  continuesFrom(views.get(taskId)?.state.attempts);

/** The word of a step on a run left unjudged, a task of which does not read (`unjudgedWord`). */
export const UNREADABLE = 'unreadable';

/** A step's word on a run left unjudged (`unjudgedWord`): `unreadable`, or the engine's word for its task. */
export type UnjudgedWord = typeof UNREADABLE | EnginePhase | 'unknown';

/**
 * A step's word on a run left unjudged because a task it reads does not (`unjudgedWords`): `unreadable` when any task the step has filed —
 * its own, its check's, an earlier try's or its check's (`stepTasks`) — is among `unreadable`; else `pending` with no task of its own
 * filed, and the engine's word for that task (`wordOfView`). What `nemia ls` prints beside such a step, and the board's chip.
 */
export const unjudgedWord =
  (views: ReadonlyMap<string, TaskView>, unreadable: ReadonlyMap<string, string>) =>
  (step: StepRecord | undefined): UnjudgedWord =>
    step && stepTasks(step).some((id) => unreadable.has(id)) ? UNREADABLE : !step?.taskId ? 'pending' : wordOfView(views.get(step.taskId));

/**
 * How many times a person said something to each step's current try while it ran (`nemia say`): the engine's `said` on the try's task, off
 * views already read. Exported, log-free, for a consumer that words a step as `nemia ls` does.
 */
export const saidCount =
  (views: ReadonlyMap<string, TaskView>, run: Run) =>
  (stepName: string): number => {
    const taskId = run.steps[stepName]?.taskId;
    return (taskId ? views.get(taskId)?.state.said?.length : undefined) ?? 0;
  };

/**
 * What was said to a task's sessions while they ran (`nemia say`), off its view: none for a task with no view, or a view with no `said`.
 */
export const saidIn = (view: TaskView | undefined): readonly Said[] => view?.state.said ?? [];

/**
 * What a settled check said, for a person to read.
 *
 * `passed` is whether its task settled `succeeded`. `verdict` is what its latest attempt exited with, or `unfinished` (`attemptVerdict`):
 * the word the tick tells a refusal from a check that did not finish by (`exitVerdicts`, `refusedCheck`), and the one `nemia ls` and the
 * api say. Then the last lines of each stream, kept apart so that a loud stderr does not push stdout's last lines off the screen.
 */
export type CheckReport = { command: string; passed: boolean; verdict: Verdict; stdout: string; stderr: string };

/**
 * What each step's settled check said, by step name, for each step whose check's phase `want` takes (`refusalRead`), read one at a time
 * in the order of `steps`. Fails with a refusal a read rejected with; dies of anything else.
 */
export const checkReportsRead = Effect.fn('checkReports')(function* (
  run: Run,
  steps: readonly Workflow[],
  phaseOf: (taskId: string) => TaskPhase,
  want: (phase: TaskPhase) => boolean,
) {
  const reports = new Map<string, CheckReport>();
  for (const step of steps) {
    const taskId = run.steps[step.name]?.check?.taskId;
    if (!taskId || !step.check || !want(phaseOf(taskId))) continue;
    reports.set(step.name, { passed: phaseOf(taskId) === 'succeeded', ...(yield* refusalRead(step.check, taskId)) });
  }
  return reports;
});

/**
 * What a check said, off the engine: the verdict of its latest attempt (`attemptVerdict`), and the last lines of each stream the runtime
 * kept (`checkStreams`). Fails with a refusal a read rejected with; dies of anything else.
 */
export const refusalRead = Effect.fn('refusalOf')(function* (command: string, taskId: string) {
  const e = yield* EngineService;
  const { verdict, stdout, stderr } = yield* checkStreams(e, taskId, TAIL_BYTES);
  return { command, verdict, stdout: lastLines(stdout), stderr: lastLines(stderr) } satisfies CheckRefusal;
});

/**
 * What a checked step's check said, for the step filed after it (`checkHandedSection`): the verdict, the tails of its streams, and the
 * lines it marked (`reportedLines`) from its whole stdout (`checkStreams`). Where `output` gave no stdout — no attempt yet, or none kept
 * under its name — the marked lines come from the log, which keeps only the end, and are `partial`. A read that rejects, with anything, is
 * `unreadable`, with the rejection's message: the step is filed all the same, and told why. Dies of nothing a read throws.
 */
export const checkHandedRead = Effect.fn('checkHanded')(function* (step: string, command: string, taskId: string) {
  const e = yield* EngineService;
  const read = yield* Effect.exit(checkStreams(e, taskId));
  if (Exit.isFailure(read)) return { step, command, unreadable: unreadWords(taskId, read.cause) } satisfies CheckHanded;
  const { verdict, stdout, stderr, kept } = read.value;
  const { lines, cut } = reportedLines(stdout);
  const said = { verdict, stdout: lastLines(stdout), stderr: lastLines(stderr), reported: lines, cut, partial: !kept };
  return { step, command, ...said } satisfies CheckHanded;
});

/**
 * What the check of a run's ending said when it refused the merged tree, for the loop's target filed to merge that base (`LandingSaid`):
 * the verdict, the tails of its streams, and the lines naming a failing test (`failingLines`) from its whole stdout and the end of its
 * stderr (`checkStreams`) — `partial` where no whole stdout was kept. A read that rejects is `unreadable`, and the target is filed all the
 * same. Dies of nothing a read throws.
 *
 * @param step The ending step, whose frozen `check:` is `command`.
 * @param check The task of that check.
 */
export const landingSaidRead = Effect.fn('landingSaid')(function* (step: string, command: string, check: string) {
  const e = yield* EngineService;
  const read = yield* Effect.exit(checkStreams(e, check));
  if (Exit.isFailure(read)) return { step, check, command, unreadable: unreadWords(check, read.cause) } satisfies LandingSaid;
  const { verdict, stdout, stderr, kept } = read.value;
  const { lines, cut } = failingLines(`${stdout}\n${stderr}`);
  const said = { verdict, stdout: lastLines(stdout), stderr: lastLines(stderr), failing: lines, cut, partial: !kept };
  return { step, check, command, ...said } satisfies LandingSaid;
});

/** Why what a check's task printed cannot be given: the engine's words for the read that failed. */
const unreadWords = (taskId: string, cause: Cause.Cause<unknown>): string => {
  const failed = Cause.squash(cause);
  return `the engine could not give what its task ${taskId} printed: ${failed instanceof Error ? failed.message : String(failed)}`;
};

/**
 * What a step is told its checked steps' checks said (`checkHandedRead`): for each step it waits on (`after:`) that has a `check:` whose
 * task is on the record, the check of its current try or round, read on the pass that files the step and never carried from another.
 */
export const checksHandedRead = Effect.fn('checksHanded')(function* (run: Run, steps: readonly Workflow[], step: Workflow) {
  const out: CheckHanded[] = [];
  for (const name of step.after) {
    const command = steps.find((s) => s.name === name)?.check;
    const taskId = run.steps[name]?.check?.taskId;
    if (command && taskId) out.push(yield* checkHandedRead(name, command, taskId));
  }
  return out;
});

/** How much of the end of a stream a check's tail is read from. */
const TAIL_BYTES = 64_000;

/**
 * A check's verdict and streams, off the engine: the verdict of its latest attempt (`attemptVerdict`), its stderr's last `TAIL_BYTES`,
 * and its stdout — whole, or its last `stdoutBytes` — through `output`, which the runtime keeps whole for a check. Where `output` gives no
 * stdout (`kept` false: no attempt yet, or none kept under its name), stderr is what `output` gave or empty, and stdout is the end of the
 * log. Dies of what a read failed with, in the runtime's words (`asked`).
 */
const checkStreams = Effect.fnUntraced(function* (e: Engine, taskId: string, stdoutBytes?: number) {
  const view = yield* asked('view', e.view(taskId));
  const [stdout, stderr] = yield* Effect.all(
    [asked('output', e.output(taskId, 'stdout', stdoutBytes)), asked('output', e.output(taskId, 'stderr', TAIL_BYTES))],
    { concurrency: 'unbounded' },
  );
  const verdict = attemptVerdict(view.state.attempts.at(-1));
  if (stdout === undefined) return { verdict, stdout: yield* asked('logs', e.logs(taskId)), stderr: stderr ?? '', kept: false };
  return { verdict, stdout, stderr: stderr ?? '', kept: true };
});

/**
 * How a step signed off: its closing statement, as the engine recorded it on the attempt.
 *
 * The engine carries the payload and never reads it; this reads it. No git and no path — the step
 * made the statement to its harness, and it lives on the engine's record of the attempt that made
 * it, which is also what keeps a resumed step from being credited with its parent's. It is the current turn's (`currentTurn`): a task
 * held open and answered has none until its next turn signs.
 */
export function closeoutOf(views: ReadonlyMap<string, TaskView>, run: Run, stepName: string): Closeout | { error: string } | undefined {
  const taskId = run.steps[stepName]?.taskId;
  return taskId ? closeoutSaid(views, taskId) : undefined;
}

/** The closing statement a task's current turn made (`currentTurn`), parsed; undefined where it made none. */
function closeoutSaid(views: ReadonlyMap<string, TaskView>, taskId: string): Closeout | { error: string } | undefined {
  return closeoutGiven(views, taskId)?.read;
}

/**
 * The closing statement a task's current turn made, as it came back (`said`) and as the run read it (`read`, `parseCloseout`): what the
 * feed's `closed out` line is logged with, an unreadable one's error beside what came back. Undefined where the turn made none.
 */
function closeoutGiven(
  views: ReadonlyMap<string, TaskView>,
  taskId: string,
): { said: unknown; read: Closeout | { error: string } } | undefined {
  const state = views.get(taskId)?.state;
  const said = state ? currentTurn(state).at(-1)?.closeout : undefined;
  return said === undefined ? undefined : { said, read: parseCloseout(said) };
}

/**
 * The closing statement the current turn of a step's task made, as it came back and as the run read it (`closeoutGiven`); undefined for a
 * step with no task, and for a turn that made none. What a pass words a step's `closed out` one-shot from (`closeoutsOf`).
 */
export function closeoutTold(
  views: ReadonlyMap<string, TaskView>,
  run: Run,
  stepName: string,
): { said: unknown; read: Closeout | { error: string } } | undefined {
  const taskId = run.steps[stepName]?.taskId;
  return taskId ? closeoutGiven(views, taskId) : undefined;
}

/** A task's closing statement (`closeoutSaid`), well-formed only: what `nemia stats` reads a try's tallies off. */
export function taskCloseout(views: ReadonlyMap<string, TaskView>, taskId: string): Closeout | undefined {
  const c = closeoutSaid(views, taskId);
  return c && !('error' in c) ? c : undefined;
}

/** Only the well-formed ones, for the pure functions that just want the outcome. */
export const closeoutReader =
  (views: ReadonlyMap<string, TaskView>, run: Run) =>
  (stepName: string): Closeout | undefined => {
    const taskId = run.steps[stepName]?.taskId;
    return taskId ? taskCloseout(views, taskId) : undefined;
  };

/**
 * A run another waits on (`--after`), read by the pass that asks and carried nowhere — what `runReady` and `waitsOf` are handed.
 *
 * Landed is the run's own `nemia decide`'s word, and nothing stricter or looser: `decision` says `landed` — the run is not running, it
 * was not cancelled, and every result branch is on its base branch (`BranchReader.landed`), with work past its base or with every step
 * succeeded. A child starts when its parent's `nemia decide` says landed, and a child waits exactly while it does not. A result branch is
 * cut at its run's base, which is on the base branch, so a branch nobody has committed to is on it from the moment it is cut: a parent
 * still running has not landed for that, nor one that ended failed, blocked or unsigned with nothing committed; one whose steps all signed
 * off with nothing to commit has, as its `nemia decide` says. A run that worked on its base branch itself (`--no-worktree`) never has.
 *
 * Git first, which costs no harness observe: a result branch not on the base branch has not landed, whatever the run's steps say. The
 * engine's view of the parent's tasks is read only once every one is.
 *
 * A result branch git no longer has is read by the tip the parent's own tick recorded once it had finished (`tipsSeen`), so the diamond's
 * first parent merged and cleaned up while the second is still in review still counts. One whose tip git cannot find on the base — dropped
 * unmerged, or deleted before any tick saw its run finish — is `gone`, and not landed. A run that started before the branch was deleted
 * never asks (`gated`). Where `git` read the parent's branches once for the pass and could not (`unread`), it has not landed, and says
 * why.
 *
 * A parent whose frozen steps cannot be read has not landed: that is its answer, neither a failure nor a defect. Fails with a refusal a
 * read of the store, git or the engine failed with; dies of anything else.
 */
export const parentRead = Effect.fn('parentOf')(function* (id: string, git: BranchReader) {
  const known = yield* tried(() => parentRecord(id, git));
  const { record } = known;
  if (!record || record.cancelledAt || known.gone) return { ...known, landed: false } satisfies ParentRun;
  const steps = yield* tried((): Workflow[] | undefined => {
    try {
      return stepsOf(record);
    } catch {
      return undefined;
    }
  });
  if (!steps) return { ...known, landed: false } satisfies ParentRun;
  const branches = resultSteps(steps)
    .map((s) => record.steps[s.name]?.branch)
    .filter((b): b is string => Boolean(b));
  const unread = isRepositoryRun(record) ? (git.unread(record) ?? branches.map((b) => git.unread(record, b)).find(Boolean)) : undefined;
  if (unread !== undefined) return { ...known, landed: false, unread } satisfies ParentRun;
  const onBase = yield* tried(() => branches.length > 0 && branches.every(landedOf(record, git)));
  if (!onBase) return { ...known, landed: false } satisfies ParentRun;
  const { views, phaseOf } = yield* taskPhasesRead(record);
  const { asks, rounds } = yield* tried(() => runStore.asks.read(id));
  const said = decision(
    steps,
    record,
    phaseOf,
    landedOf(record, git),
    closeoutReader(views, record),
    closeoutAsked(views),
    exitVerdicts(views, record),
    asks,
    rounds,
    () => false,
    spendReader(views),
  );
  return { ...known, landed: said.kind === 'landed' } satisfies ParentRun;
});

/** A run another waits on as `read` holds it, else read (`parentRead`) over `git` and kept in `read` for whoever asks next. */
export const keptParent = Effect.fn('keptParent')(function* (id: string, git: BranchReader, read: Map<string, ParentRun>) {
  const was = read.get(id);
  if (was) return was;
  const now = yield* parentRead(id, git);
  read.set(id, now);
  return now;
});

/**
 * The runs a pass reads as runs others wait on, each read once for the pass (`parentRead`) and kept by id, off what the tick's pass read of
 * where the branches stand (`standingReader`), or what a person's verb asked of it live (`standingLive`): what the pass's
 * `admit`, `liftHold`, claims on the checkout (`mainClaim`) and the cap's needs (`needOf`) all read through. Made by the pass and dropped
 * with it, so a parent the pass lands is read landed on the next.
 */
export type Parents = { git: BranchReader; read: Map<string, ParentRun> };

/** The runs a pass reads as runs others wait on (`Parents`), none read yet, through `git`. */
export const passParents = (git: BranchReader): Parents => ({ git, read: new Map() });

/**
 * The runs this run waits on, each read once (`parentRead`), one at a time — and none, without a look, for a run the gate does not apply
 * to (`gated`). And the runs a person holds it until (`Run.hold`), for as long as the hold stands. A run `read` holds is answered from it,
 * and every run read is kept there. Fails with a refusal a read failed with; dies of anything else.
 */
export const parentsRead = Effect.fn('parentsOf')(function* (run: Run, git: BranchReader, read = new Map<string, ParentRun>()) {
  const mine = new Map<string, ParentRun>();
  for (const id of new Set(waitedOn(run))) mine.set(id, yield* keptParent(id, git, read));
  return (id: string): ParentRun => mine.get(id) ?? { landed: false };
});

/**
 * What each step's current task consumed, summed over its attempts (`sumUsage`): the try whose closeout
 * and check `nemia decide` prints beside it. A settled attempt's usage is on the engine's record, the one in
 * flight on the view; an attempt that never started consumed nothing, and is left out.
 *
 * Off views already read, not a view of its own: each `e.view` is a harness observe, so `decide` reads
 * each task once and hands its views here.
 */
export function consumption(views: ReadonlyMap<string, TaskView>, run: Run): Record<string, Consumed | undefined> {
  const used: Record<string, Consumed | undefined> = {};
  for (const [name, { taskId }] of Object.entries(run.steps)) {
    const v = taskId ? views.get(taskId) : undefined;
    if (!v) continue;
    used[name] = taskUsage(v);
  }
  return used;
}

/**
 * When each task was filed, off the engine's feed from `after`, added to `into`: the one record of a filing time, since a task's view
 * carries none — and the time between filing and a first attempt is the wait for a slot (`timeline`). A filing is written once and never
 * changes, so a reader that keeps `into` and the cursor reads on from where it stopped; `forgotten` counts the lines after `after` of
 * tasks the engine has forgotten since (`nemia rm`), which are read as gone. Never fails: the feed's refusal it dies of in the
 * runtime's words (`asked`), and of anything else as it was thrown.
 */
export const filingsRead = Effect.fn('readFilings')(function* (after = 0, into = new Map<string, string>()) {
  const e = yield* EngineService;
  const { entries, cursor, forgotten } = yield* asked('feed', e.feed(after));
  for (const { taskId, event } of entries) if (event.kind === 'filed') into.set(taskId, event.at);
  return { filed: into, cursor, forgotten: forgotten ?? 0 };
});
