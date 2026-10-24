/**
 * Where a run's time went: the timeline of its tries, their checks, the queue waits and the wall time, off the engine's views of
 * their tasks and the filing times on its feed.
 *
 * Pure, as `tick/assess.ts` is: data in, a timeline and its lines out. `views.verb.ts` reads the views and the feed (`filingsRead`) and
 * hands them here, `cli/main.ts` prints the lines `nemia decide` shows, and nothing here reads a disk or calls the engine.
 */
import type { Run } from '../record/record.ts';
import { roundIn, dollars, durationWord, rebuiltCache, sumUsage, usedLines, type Consumed } from '../status/status.ts';
import { hasStarted } from '../wait/wait.ts';
import type { Workflow } from '../step/step.ts';
import { loopSpan } from '../workflow/index.ts';
import { turnOf, turnSpanOf, type TurnSpan, type TurnTry } from './turns.ts';

/** How an attempt ended, or a task settled, as the runtime records it: its `Outcome`, written out because this file imports no runtime. */
export type EngineOutcome = 'succeeded' | 'failed' | 'stopped';

/**
 * An attempt's clock, and what it consumed, as the engine's `Attempt` keeps them: named here because this file does not import the
 * engine. decide.verb.ts hands `timeline` the engine's views, which have this shape.
 */
export type AttemptClock = {
  startedAt: string;
  spawnedAt: string | null;
  endedAt: string | null;
  reason: string | null;
  usage: Consumed | null;
  resumeFrom?: string;
  /**
   * How it ended — `succeeded` once it ended with its statement made — the turn of a task held open it ran, and the closeout it signed,
   * as the engine's `Attempt` keeps them.
   */
  ended?: EngineOutcome | null;
  turn?: number;
  closeout?: unknown;
  /** A limit its harness said it ended the session at — `budget`, the step's cap — carried by the runtime and judged here (`taskSpend`). */
  limit?: string;
};

/**
 * A task as the timeline reads it off the engine's view: its brief, its attempts, whether it settled, and what the attempt in flight has
 * consumed so far; and, for a task held open, the engine's word for it and whether a person closed it (`signedAndHeld`).
 */
export type TaskClock = {
  phase?: string;
  state: { brief: string; attempts: readonly AttemptClock[]; settled: EngineOutcome | null; closed?: boolean };
  usage?: Consumed;
};

/**
 * A task held open whose turn signed, with nothing more to come of it but by a person's word: waiting for that word (the engine's
 * `input-required`), or closed, which the engine settles as it signed on its next pass. Nothing runs, as nothing runs of a settled task:
 * `phaseOfView` reads it as the session it signed, and the timeline as a session that ended. Pure, and here because this file is.
 */
export const signedAndHeld = (v: TaskClock): boolean =>
  !v.state.settled && (v.phase === 'input-required' || (v.state.closed === true && v.state.attempts.at(-1)?.ended === 'succeeded'));

/**
 * What one task's session consumed, summed over its attempts (`sumUsage`): a settled attempt's usage off the engine's record, the one in
 * flight off the view, and an attempt that never started left out. Undefined where nobody measured it. An attempt that continued a session
 * and rebuilt its cache is counted in `rebuiltCaches` (`rebuiltCache`): only the attempt knows it was resumed.
 */
export const taskUsage = (view: TaskClock | undefined): Consumed | undefined =>
  view
    ? sumUsage(
        view.state.attempts
          .filter((a) => a.reason !== 'unstartable')
          .map((a) => {
            const u = a.endedAt ? a.usage : view.usage;
            return u && rebuiltCache(u, a.resumeFrom !== undefined) ? { ...u, rebuiltCaches: 1 } : u;
          }),
      )
    : undefined;

/**
 * One task on the clock: a try's session, or its check.
 *
 * `filedAt` is when the task was filed, off the engine's feed — its view carries no such time — and null where the feed has no filing of
 * it. `spawnedAt` is its first attempt's spawn, `endedAt` its last attempt's end once the task settled. A task waits for a slot between
 * being filed and its first attempt, so `queuedMs` — filed → spawned — is the slot wait and the spawn; `ranMs` is spawned → ended,
 * gaps between attempts included — but for a task held open, turn by turn: each turn's first spawn to its last end, summed, since between
 * the turn that signed and the next a person was deciding, and nothing ran. Each is null where it cannot be measured, never 0.
 *
 * `at` is where the task stands: `unknown` to the engine; `queued`, filed and no attempt yet; `starting`, a slot taken and not spawned;
 * `running`, spawned and not settled; `ended`, settled after it spawned, or held open and signed, waiting on a person's word or closed on
 * it (`signedAndHeld`); `unspawned`, settled before it ever spawned — stopped in the queue, or never startable. `queued` and `ran` are the
 * two times in words: a duration, or why there is none.
 */
export type TaskSpan = {
  taskId: string;
  at: 'unknown' | 'queued' | 'starting' | 'running' | 'ended' | 'unspawned';
  filedAt: string | null;
  spawnedAt: string | null;
  endedAt: string | null;
  attempts: number;
  queuedMs: number | null;
  ranMs: number | null;
  queued: string;
  ran: string;
};

/**
 * One try of a step on the clock. `round` is the round of its loop it was filed in (`roundIn`). `session` is its session's task; null on
 * a try a recheck reached, which ran no session of its own — `sessionOf` names the try whose session it is. `check` is its check's task,
 * null for a try whose check was never filed. `used` is what its session consumed (`taskUsage`), absent on a recheck's try. `turn` is
 * the turn of that earlier try's session a try ran, where it answered it (`turnOf`): absent on a try that owns its session and on a
 * recheck's.
 */
export type TimelineTry = {
  try: number;
  round: number;
  session: TaskSpan | null;
  sessionOf: number | null;
  check: TaskSpan | null;
  used?: Consumed;
  turn?: TurnSpan;
};

/**
 * The time of several tasks together: a round of a loop (`loop` and `round`), counting the steps that round files again (`loopSpan`) — a
 * step before the loop or after it is in no round — or the whole run's, every step's (both null). `tasks` counts the sessions and checks in
 * it — a recheck's try adds its check, and not its session again — and `inFlight` those that have not ended. `queuedMs` sums the queue
 * times that are known, and `ranMs` the run times of the tasks that ended: sums, so a fan-out's run time is more than its wall. `wallMs` is
 * first filed → last ended, null while a task is in flight or a filing is not known. `queued`, `ran` and `wall` are the three in words,
 * each saying what it leaves out.
 */
export type TimelineTotal = {
  /** The looping step whose loop this is a round of; null for the run's total. */
  loop: string | null;
  round: number | null;
  tasks: number;
  inFlight: number;
  queuedMs: number;
  ranMs: number;
  wallMs: number | null;
  queued: string;
  ran: string;
  wall: string;
};

/**
 * A run's wait for a run slot (`WF_MAX_RUNS`), on a run the cap held (`slotHeldAt`): from `createdAt` — or, on a run that waited on runs
 * (`--after`), from the pass the cap first held it, since the wait before was for those runs — to its first task's filing. `filedAt` is
 * that filing, null while nothing is filed or when the feed has no filing of it; `ms` the wait, null where it cannot be measured; `queued`
 * the wait in words: a duration, `still waiting` while nothing is filed, and `not known` where the feed does not say when the first task
 * was filed.
 */
export type SlotWait = { from: string; filedAt: string | null; ms: number | null; queued: string };

/**
 * Where a run's time went: every step's tries, in the record's order; a total per round of each loop, by loop — and the run's, which counts
 * its wait for a run slot as queued time — and that wait, on a run the cap held (`slot`; null on any other).
 */
export type Timeline = { steps: Record<string, TimelineTry[]>; rounds: TimelineTotal[]; run: TimelineTotal; slot: SlotWait | null };

/**
 * Where a run's time went, per try and per check of every step, off the engine's views of their tasks and the run's `tries`. Pure.
 *
 * `views` must hold every task of every try — the tries behind the current one too, and each try's check; a task it does not hold reads as
 * one the engine has no record of. `filed` is each task's filing time, off the engine's feed (`filingsRead` in views.verb.ts) or each
 * view's `State.filedAt` (`decide`); a task without one has its queue time `not known`. A step not filed has no try on the clock.
 *
 * `steps` are the workflow the run is judged by — the one it froze, by default — whose loops its rounds are of. Without them no round is
 * totalled. A round counts the steps its loop files again (`loopSpan`), and a step before the loop or after it is in no round. The rounds
 * go by loop, in the workflow's order, then by round: the rounds of two loops are not the same rounds. A session a recheck's try shares is
 * counted once, on the try that ran it.
 */
export function timeline(
  run: Run,
  views: ReadonlyMap<string, TaskClock>,
  filed: ReadonlyMap<string, string> = new Map(),
  steps: readonly Workflow[] = run.workflow ?? [],
): Timeline {
  const loops = steps.filter((s) => s.loop);
  const loopOf = new Map(loops.flatMap((looping) => loopSpan(steps, looping).map((name) => [name, looping.name] as const)));
  const byStep: Record<string, TimelineTry[]> = {};
  const counted: Array<{ loop: string | null; round: number; span: TaskSpan }> = [];
  for (const [name, record] of Object.entries(run.steps)) {
    const earlier = record.tries ?? [];
    const tries = [
      ...earlier.map((t, i) => ({
        taskId: t.taskId,
        check: t.check?.taskId,
        round: roundIn({ taskId: null, tries: earlier.slice(0, i) }),
        then: t.then,
      })),
      ...(record.taskId ? [{ taskId: record.taskId, check: record.check?.taskId, round: roundIn(record) }] : []),
    ];
    byStep[name] = tries.map((t, i): TimelineTry => {
      const first = tries.findIndex((u) => u.taskId === t.taskId);
      const session = first === i ? spanOf(t.taskId, views.get(t.taskId), filed.get(t.taskId)) : null;
      const check = t.check ? spanOf(t.check, views.get(t.check), filed.get(t.check)) : null;
      for (const span of [session, check]) if (span) counted.push({ loop: loopOf.get(name) ?? null, round: t.round, span });
      const used = session ? taskUsage(views.get(t.taskId)) : undefined;
      const turn = turnIn(tries, i, views.get(t.taskId));
      const shared = { ...(used ? { used } : {}), ...(turn ? { turn } : {}) };
      return { try: i + 1, round: t.round, session, sessionOf: first === i ? null : first + 1, check, ...shared };
    });
  }
  const rounds = loops.flatMap((looping) => {
    const of = counted.filter((c) => c.loop === looping.name);
    return [...new Set(of.map((c) => c.round))]
      .sort((a, b) => a - b)
      .map((round) =>
        totalOf(
          looping.name,
          round,
          of.filter((c) => c.round === round).map((c) => c.span),
        ),
      );
  });
  const slot = slotWaitOf(run, filed);
  return {
    steps: byStep,
    rounds,
    run: totalOf(
      null,
      null,
      counted.map((c) => c.span),
      slot,
    ),
    slot,
  };
}

/** The turn of an earlier try's session that try `i` of `tries` ran (`TurnSpan`), off the view of its task; undefined where it ran none. */
function turnIn(tries: readonly TurnTry[], i: number, view: TaskClock | undefined): TurnSpan | undefined {
  const turn = turnOf(tries, i);
  if (turn === null) return undefined;
  const over = view !== undefined && (view.state.settled !== null || signedAndHeld(view));
  return turnSpanOf(view?.state.attempts ?? [], turn, over);
}

/** A run's wait for a run slot (`SlotWait`), off its record and the filing times; null on a run the cap never held. */
function slotWaitOf(run: Run, filed: ReadonlyMap<string, string>): SlotWait | null {
  if (!run.slotHeldAt) return null;
  const from = run.after?.length ? run.slotHeldAt : run.createdAt;
  if (!hasStarted(run)) return { from, filedAt: null, ms: null, queued: 'still waiting' };
  const filedAt = firstFiledAt(run, filed);
  const ms = between(from, filedAt);
  return { from, filedAt, ms, queued: ms === null ? 'not known' : durationWord(ms) };
}

/**
 * When the run could first be at work: the earliest filing of any task of any try of any step — a session's or a check's — off the
 * filing times it is handed (`filed`). Null while nothing of the run is filed, and for a run none of whose tasks has one. Pure.
 *
 * Not the record's `createdAt`: a run started `--after` runs, or held for a run slot, is created long before anything of it is filed. And
 * not when its parents shipped, which nothing writes down: the tick files the roots on the pass that reads them shipped.
 */
export function firstFiledAt(run: Run, filed: ReadonlyMap<string, string>): string | null {
  const tasks = Object.values(run.steps).flatMap((record) => [
    ...(record.tries ?? []).flatMap((t) => [t.taskId, t.check?.taskId]),
    record.taskId,
    record.check?.taskId,
  ]);
  return tasks.flatMap((id) => (id && filed.has(id) ? [filed.get(id)!] : [])).sort()[0] ?? null;
}

/**
 * When a run started, as a person is told it: its first filing (`firstFiledAt`); for a run that has started and whose filings the feed does
 * not have, its `createdAt`, the best there is; null while nothing of it is filed. Pure.
 */
export const runStartedAt = (run: Run, filed: ReadonlyMap<string, string>): string | null =>
  firstFiledAt(run, filed) ?? (hasStarted(run) ? run.createdAt : null);

const between = (from: string | null, to: string | null): number | null =>
  from && to ? Math.max(0, Date.parse(to) - Date.parse(from)) : null;

/**
 * How long a task that ended ran: each turn's first spawn to its last end, summed — one turn, for a task not held open. Null where a turn
 * that spawned has no end on the record, or where nothing spawned.
 */
function ranOf(attempts: readonly AttemptClock[]): number | null {
  const turns = new Map<number, AttemptClock[]>();
  for (const a of attempts) turns.set(a.turn ?? 0, [...(turns.get(a.turn ?? 0) ?? []), a]);
  let ms = 0;
  let spawned = false;
  for (const turn of turns.values()) {
    const from = turn.find((a) => a.spawnedAt)?.spawnedAt ?? null;
    if (!from) continue;
    const ran = between(from, turn.at(-1)!.endedAt);
    if (ran === null) return null;
    ms += ran;
    spawned = true;
  }
  return spawned ? ms : null;
}

/** One task on the clock (`TaskSpan`), off the engine's view of it and its filing time. */
function spanOf(taskId: string, view: TaskClock | undefined, filedAt: string | undefined): TaskSpan {
  const attempts = view?.state.attempts ?? [];
  const settled = view?.state.settled ?? null;
  const spawnedAt = attempts.find((a) => a.spawnedAt)?.spawnedAt ?? null;
  const at: TaskSpan['at'] =
    !view || (!attempts.length && !view.state.brief)
      ? 'unknown'
      : settled
        ? spawnedAt
          ? 'ended'
          : 'unspawned'
        : !attempts.length
          ? 'queued'
          : signedAndHeld(view)
            ? 'ended'
            : spawnedAt
              ? 'running'
              : 'starting';
  const endedAt = at === 'ended' ? (attempts.at(-1)?.endedAt ?? null) : null;
  const queuedMs = between(filedAt ?? null, spawnedAt);
  const ranMs = at === 'ended' ? ranOf(attempts) : null;
  const queued =
    at === 'unknown'
      ? 'not on the record'
      : at === 'queued'
        ? 'waiting for a slot'
        : at === 'starting'
          ? 'not spawned yet'
          : at === 'unspawned'
            ? 'never spawned'
            : queuedMs === null
              ? 'not known'
              : durationWord(queuedMs);
  const ran =
    at === 'unknown'
      ? 'not on the record'
      : at === 'running'
        ? 'still running, no end yet'
        : !spawnedAt
          ? '—'
          : ranMs === null
            ? 'not known'
            : durationWord(ranMs);
  return { taskId, at, filedAt: filedAt ?? null, spawnedAt, endedAt, attempts: attempts.length, queuedMs, ranMs, queued, ran };
}

/**
 * Several tasks' time together (`TimelineTotal`) — the run's with its wait for a run slot, when the cap held it, counted as queued. Each
 * time in words is the sum of the times known, then what it leaves out, and `—` rather than a sum of none, which would read as nothing
 * spent.
 */
function totalOf(loop: string | null, round: number | null, spans: readonly TaskSpan[], slot: SlotWait | null = null): TimelineTotal {
  const inFlight = spans.filter((s) => s.at === 'queued' || s.at === 'starting' || s.at === 'running');
  const queuedMs = spans.reduce((n, s) => n + (s.queuedMs ?? 0), slot?.ms ?? 0);
  const ranMs = spans.reduce((n, s) => n + (s.ranMs ?? 0), 0);
  const waiting = spans.filter((s) => s.at === 'queued' || s.at === 'starting').length + (slot?.queued === 'still waiting' ? 1 : 0);
  const queueUnknown = spans.filter((s) => s.queued === 'not known' || s.at === 'unknown').length + (slot?.queued === 'not known' ? 1 : 0);
  const running = spans.filter((s) => s.at === 'running').length;
  const ranUnknown = spans.filter((s) => s.ran === 'not known' || s.at === 'unknown').length;
  const firsts = spans.map((s) => s.filedAt);
  const lasts = spans.map((s) => s.endedAt).filter((at): at is string => at !== null);
  const wallMs =
    inFlight.length ||
    !spans.length ||
    firsts.some((at) => at === null) ||
    spans.some((s) => s.at === 'unknown' || (s.at === 'ended' && !s.endedAt)) ||
    !lasts.length
      ? null
      : between([...(firsts as string[])].sort()[0], lasts.sort().at(-1)!);
  const said = (known: number, ms: number, pending: [number, string], unknown: number): string =>
    [
      known ? durationWord(ms) : '',
      pending[0] ? `${pending[0]} ${pending[1]}` : '',
      unknown ? (known || pending[0] ? `${unknown} not known` : 'not known') : '',
    ]
      .filter(Boolean)
      .join(', ') || '—';
  return {
    loop,
    round,
    tasks: spans.length,
    inFlight: inFlight.length,
    queuedMs,
    ranMs,
    wallMs,
    queued: said(
      spans.filter((s) => s.queuedMs !== null).length + (slot?.ms != null ? 1 : 0),
      queuedMs,
      [waiting, 'waiting'],
      queueUnknown,
    ),
    ran: said(spans.filter((s) => s.ranMs !== null).length, ranMs, [running, 'still running'], ranUnknown),
    wall: wallMs !== null ? durationWord(wallMs) : inFlight.length ? 'still going' : 'not known',
  };
}

/**
 * A step's timeline as `nemia decide` prints it, under its `used`: a row per try's session and per try's check, in the order they ran. Each
 * says when it was filed, spawned and ended — UTC, with the day where it is not the first row's — then its queue and run time, and beside a
 * session what it used and, where the engine measured it, what it cost. Empty for a step not filed.
 */
export function timelineLines(tries: readonly TimelineTry[]): string[] {
  const instants = tries
    .flatMap((t) => [t.session, t.check])
    .flatMap((s) => (s ? [s.filedAt, s.spawnedAt, s.endedAt] : []))
    .filter((at): at is string => at !== null);
  const day = instants.sort()[0]?.slice(0, 10);
  const clock = (at: string | null) =>
    at === null ? 'not known' : `${at.slice(0, 10) === day ? '' : `${at.slice(5, 10)} `}${at.slice(11, 19)}Z`;
  const words = (s: TaskSpan): string => {
    if (s.at === 'unknown') return `the engine has no record of ${s.taskId}`;
    const filedAt = `filed ${clock(s.filedAt)}`;
    if (s.at === 'queued') return `${filedAt}  waiting for a slot`;
    if (s.at === 'starting') return `${filedAt}  a slot taken, not spawned yet`;
    if (s.at === 'unspawned') return `${filedAt}  settled before it spawned`;
    const times = `${filedAt}  spawned ${clock(s.spawnedAt)}`;
    const attempts = s.attempts > 1 ? `  ${s.attempts} attempts` : '';
    if (s.at === 'running') return `${times}  no end yet, still running  queued ${s.queued}${attempts}`;
    return `${times}  ended ${clock(s.endedAt)}  queued ${s.queued}  ran ${s.ran}${attempts}`;
  };
  const rows = tries.flatMap((t): Array<[string, string]> => {
    const label = `try ${t.try}${t.round > 1 ? ` · round ${t.round}` : ''}`;
    const used = usedLines(t.used)[0].replace(/^used\s+/, '');
    const cost = t.used?.costUsd !== undefined ? `  cost ${dollars(t.used.costUsd)}` : '';
    return [
      [label, t.session ? `${words(t.session)}  used ${used}${cost}` : `its session is try ${t.sessionOf}'s, checked again`],
      ...(t.check ? [[`try ${t.try} check`, words(t.check)] satisfies [string, string]] : []),
    ];
  });
  return rowsUnder('timeline', rows);
}

/**
 * A run's totals as `nemia decide` prints them, after its steps: each round of each loop that went round — named by its looping step where
 * more than one did — then, on a run the cap on runs in flight held, its wait for a run slot, then the run's, every step's, that wait among
 * its queue.
 */
export function timelineTotalLines(t: Timeline): string[] {
  if (!t.run.tasks) return [];
  const said = (total: TimelineTotal) => `queued ${total.queued}  ran ${total.ran}  wall ${total.wall}`;
  const went = [...new Set(t.rounds.map((r) => r.loop))].filter((loop) => t.rounds.filter((r) => r.loop === loop).length > 1);
  const shown = t.rounds
    .filter((r) => went.includes(r.loop))
    .map((r): [string, string] => [`${went.length > 1 ? `${r.loop} ` : ''}round ${r.round}`, said(r)]);
  const slot: Array<[string, string]> = t.slot ? [['run slot', `queued ${t.slot.queued}`]] : [];
  return rowsUnder('timeline', [...shown, ...slot, ['run', said(t.run)]]);
}

/** Rows under a label, the label on the first and the rest aligned under it, each row's name padded to the longest. */
function rowsUnder(label: string, rows: ReadonlyArray<readonly [string, string]>): string[] {
  const width = Math.max(0, ...rows.map(([name]) => name.length));
  return rows.map(([name, text], i) => `${i ? ' '.repeat(label.length) : label}  ${name.padEnd(width)}  ${text}`);
}
