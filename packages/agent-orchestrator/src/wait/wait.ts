/**
 * What a run waits on before its steps are filed: the runs it follows (`waitsOf`, `runReady`) and the holds a person put on it
 * (`holdsOf`), with their words, their advice and the refusals they give (`holdRefusal`, `afterRefusal`). Pure.
 */
import { prunedWords, type Hold, type Run } from '../record/record.ts';
import type { HoldNeedsYou, HoldStop, HoldStopOf } from '../../contracts/hold.contract.ts';
import type { WaitStanding, WaitStandingOf } from '../../contracts/waited-run.contract.ts';
import { runMarkMove, runMarkOf } from '../run-marks/run-marks.ts';
import type { Wait } from '../../contracts/hold.contract.ts';

export type { Wait } from '../../contracts/hold.contract.ts';

/**
 * Whether any step of the run has been filed, on any try — a step a round moved behind still has its tries. A run that has
 * started never waits on a run again.
 * @param run The run asked about.
 */
export const hasStarted = (run: Run) => Object.values(run.steps).some((s) => Boolean(s.taskId) || Boolean(s.tries?.length));

/**
 * Whether the gate applies to this run, and a parent is read at all: it waits on runs, nobody has called it off, and nothing of it has
 * been filed. None for a run with no `after`; none for a cancelled run, which files nothing anyway; and none for a
 * run that has started — whose parents are never read again, so a parent's branch deleted after the merge (`nemia decide`'s "drop it", a
 * `git branch -d` after landing) cannot un-ready it.
 * @param run The run asked about.
 */
export const gated = (run: Run) => Boolean(run.after?.length) && !run.cancelledAt && !hasStarted(run);

/**
 * The runs this run's pass reads as runs it waits on: its `after` while the gate applies (`gated`), and the runs a person holds it until
 * while the hold stands (`Run.hold`), in that order, a run named twice named twice. Pure.
 * @param run The run asked about.
 */
export const waitedOn = (run: Run) => [
  ...(gated(run) && run.after ? run.after : []),
  ...(run.hold && !run.cancelledAt ? run.hold.until : []),
];

/**
 * The runs in `after` that have not released this one, in the order they were given. Pure; none, and `released` never called, for a run
 * not `gated`.
 * @param run The run whose `after` is read.
 * @param released Whether a wait on the run of an id is released: it succeeded, or a person released its waiters (`waitStanding`).
 */
export function waitingOn(run: Run, released: (runId: string) => boolean) {
  if (!gated(run) || !run.after) return [];
  return run.after.filter((id) => !released(id));
}

/**
 * Whether the tick may file this run's roots: true when every run in its `after` has released its waiters (`waitStanding`) — it
 * succeeded, as `nemia ls` says its status, or a person released them (`nemia release`) — never when its steps say they are done, because
 * the run boundary is the human gate. Pure. True for a run that is not `gated`, without asking.
 * @param run The run whose `after` is read.
 * @param released Whether a wait on the run of an id is released: it succeeded, or a person released its waiters (`waitStanding`).
 */
export const runReady = (run: Run, released: (runId: string) => boolean) => waitingOn(run, released).length === 0;

/**
 * A run another waits on, as the tick reads it on the pass that asks (`parentOf` in views.verb.ts): its record, when the store has one;
 * where a wait on it stands (`waitStanding`); and why its workflow was not read, when it was not (`unread`): its wait is then unread, and
 * is asked again on the next pass.
 */
export type ParentRun = { record?: Run; standing: WaitStanding; unread?: string };

/**
 * Where a wait on one run stands: released once it succeeded or a person released its waiters, yours where it never succeeds without a
 * person (the store has no such run, it was called off, it failed), else waiting on the run as it stands. Pure, and proved by
 * `contracts/waited-run.contract.ts`. Reads no git.
 * @param run Whether the store has the run, its status as `nemia ls` says it (null where its workflow did not load), and whether a
 * person released its waiters.
 */
export const waitStanding: WaitStandingOf = (run) => {
  if (!run.known) return { kind: 'yours', why: 'missing' };
  if (run.status === 'succeeded') return { kind: 'released', by: 'succeeded' };
  if (run.released) return { kind: 'released', by: 'hand' };
  if (run.status === 'failed' || run.status === 'cancelled') return { kind: 'yours', why: run.status };
  return { kind: 'waiting', on: run.status ?? 'unread' };
};

/**
 * Each run this one waits on that has not released it (`waitingOn`), and why it may never. Pure.
 * @param run The run whose `after` is read.
 * @param parentOf How a run another waits on reads, by its id: its record and where a wait on it stands.
 */
export function waitsOf(run: Run, parentOf: (runId: string) => ParentRun) {
  return waitingOn(run, (id) => parentOf(id).standing.kind === 'released').map((id) => waitOf(id, parentOf(id))) satisfies Wait[];
}

/** A run this one waits on, as `parent` reads it (`Wait`): why it may never succeed, else why it was not read. */
function waitOf(id: string, { record, standing, unread }: ParentRun) {
  if (standing.kind === 'released') return { run: id, released: true } satisfies Wait;
  if (standing.kind === 'yours') {
    if (standing.why === 'missing') return { run: id, missing: true } satisfies Wait;
    if (standing.why === 'cancelled')
      return { run: id, cancelledAt: record?.cancelledAt || 'a time its record no longer says' } satisfies Wait;
    return { run: id, failed: true } satisfies Wait;
  }
  return (standing.on === 'unread' ? { run: id, unread: unread ?? 'its workflow was not read' } : { run: id }) satisfies Wait;
}

/** A run waited on as the status column names it: `a-1x2y (cancelled)`, with why it may never succeed or why it was not read. */
const waitName = (w: Wait) =>
  `${w.run}${w.missing ? ' (no such run)' : w.cancelledAt ? ' (cancelled)' : w.failed ? ' (failed)' : w.unread ? ` (where it stands is unread: ${w.unread})` : ''}`;

/** Whether a person has to act for this run to succeed: nothing the tick can read will change on its own. */
const neverSucceeds = (w: Wait) => Boolean(w.missing || w.cancelledAt || w.failed);

/**
 * Whether a standing hold waits on a person (`holdsOf`'s runs): exactly when a run it names never succeeds without one — no such run, a
 * cancelled one, a failed one. Pure, and proved by `contracts/hold.contract.ts`. A hold that names no run asks nothing: it is the
 * person's word already given, lifted by their hand alone (`nemia hold <run> --off`). `holdingOf`, `nemia ls` and `nemia decide` read it
 * alike.
 * @param holds Each run the hold names that has not released it (`holdsOf`).
 */
export const holdNeedsYou: HoldNeedsYou = (holds) => holds.some(neverSucceeds);

/**
 * What of the run itself refuses a hold, in the order `holdRefusal` says it — or null. Pure, and proved by `contracts/hold.contract.ts`:
 * a run cancelled, pruned or succeeded, of which nothing is left to file; and one already held, since a hold is put once, whole. A hold
 * reads no branch, so a folder run is held as any other.
 * @param p What of the run stops a hold: whether it is cancelled, pruned, succeeded or held.
 * @public
 */
export const holdStop: HoldStopOf = (p) => {
  const move = runMarkMove(runMarkOf(p), 'hold');
  const marked = move.kind === 'refused' ? move.as : null;
  if (marked === 'cancelled' || marked === 'pruned') return marked;
  if (p.succeeded) return 'succeeded';
  if (marked === 'held') return marked;
  return null;
};

/**
 * A run's roots, waiting, as `nemia ls` says it in the status column: `waiting on a-1x2y (cancelled), b-3z4w`.
 * @param waits Each run waited on that has not released it, and why it may never succeed (`waitsOf`).
 */
export const waitWord = (waits: readonly Wait[]) => `waiting on ${waits.map(waitName).join(', ')}`;

/** Why a run this one waits on never succeeds (`neverSucceeds`), in words: the store has no such run, it was cancelled, or it failed. */
function neverWhy(w: Wait) {
  if (w.missing) return `the store has no run ${w.run}`;
  if (w.cancelledAt) return `${w.run} was cancelled at ${w.cancelledAt}, and a cancelled run never succeeds`;
  return `${w.run} failed, and a failed run does not succeed on its own`;
}

/** What a person may do for a run that never succeeds to go on: retry a failed one, or release its waiters; nothing for a missing one. */
function waysOut(w: Wait) {
  if (w.missing) return [];
  return w.failed ? [`nemia retry ${w.run}`, `nemia release ${w.run}`] : [`nemia release ${w.run}`];
}

/**
 * What a run waiting on runs leaves a person to do, in one line, for `nemia decide` and for `nemia ls`'s `→ waiting on you`. Pure. Nothing,
 * while each parent may still succeed: the tick files the roots when it does. For a parent that never will without a person — no such
 * run, a cancelled one, a failed one — why, and the ways out: retry it or release its waiters (`nemia release`), cancel this run, or
 * start the work again without that edge.
 * @param run The run whose roots wait.
 * @param waits Each run waited on that has not released it, and why it may never succeed (`waitsOf`).
 */
export function waitAdvice(run: Run, waits: readonly Wait[]) {
  const never = waits.filter(neverSucceeds);
  if (!never.length) {
    return `nothing of ${run.id} is filed until ${runList(waits.map((w) => w.run))} ${waits.length > 1 ? 'have' : 'has'} succeeded; nothing to decide yet`;
  }
  const why = never.map(neverWhy);
  const outs = [
    ...never.flatMap(waysOut),
    `nemia cancel ${run.id}`,
    `start the work again without ${never.map((w) => `--after ${w.run}`).join(' ')}`,
  ];
  return `${why.join('; ')} — yours to resolve: ${outs.join(', or ')}`;
}

/**
 * The runs a held run waits on to succeed (`Run.hold`), as `nemia ls` and `nemia decide` name them: each that has not released it, and why
 * it may never (`waitsOf`'s words). Pure. None for a run nobody holds, and for a hold that names no run, which a person alone lifts. While
 * every one has released it and the tick has not yet lifted the hold, each is named all the same, marked `released`: the run is still
 * held, and says why for the moment it is.
 * @param run The run whose hold is read.
 * @param parentOf How a run another waits on reads, by its id: its record and where a wait on it stands.
 */
export function holdsOf(run: Run, parentOf: (runId: string) => ParentRun) {
  if (!run.hold) return [];
  const waits: Wait[] = run.hold.until.filter((id) => parentOf(id).standing.kind !== 'released').map((id) => waitOf(id, parentOf(id)));
  return waits.length ? waits : run.hold.until.map((id) => ({ run: id, released: true as const }));
}

/** Words as a shell reads them back whole: in single quotes, each `'` in them closed, escaped and opened again. */
const shellQuoted = (words: string) => `'${words.replaceAll("'", `'\\''`)}'`;

/**
 * The command that holds `id` on `until`, with the words `why` a hold had: `nemia hold r-1 --until a-1 --why 'merge conflicts'`, and
 * `nemia hold r-1` for a hold that names no run.
 */
const holdAgain = (id: string, until: readonly string[], why?: string) =>
  `nemia hold ${id}${until.map((u) => ` --until ${u}`).join('')}${why ? ` --why ${shellQuoted(why)}` : ''}`;

/** `a` and `b`, or `a, b and c`, of runs. */
const runList = (ids: readonly string[]) => (ids.length > 1 ? `${ids.slice(0, -1).join(', ')} and ${ids.at(-1)}` : (ids[0] ?? ''));

/** What the person who put a hold said of it, as it follows `held until …`: ` (why: …; by …)`, ` (why: …)`, ` (by …)`, or nothing. */
const saidWord = ({ why, by }: Pick<Hold, 'why' | 'by'>) => {
  const parts = [...(why ? [`why: ${why}`] : []), ...(by ? [`by ${by}`] : [])];
  return parts.length ? ` (${parts.join('; ')})` : '';
};

/**
 * A held run, as `nemia ls` and `nemia decide` say it: `held until a-1x2y succeeds`, each run it waits on with why it may never, as
 * `waitWord` names them, or `held until a person lifts it` for a hold that names no run, then what the person who put the hold said of it
 * when `said` is given: `held until a-1x2y succeeds (why: merge conflicts; by operator)`. Pure. Never `waiting on you`: a hold is a
 * person's word already given, and nothing is asked of anyone while it stands.
 *
 * @param waits Each run the hold waits on (`holdsOf`); none for a hold that names no run.
 * @param said The hold's `why` and `by`, each shown when it is there; a hold file older code wrote has neither, and shows the plain line.
 */
export function holdWord(waits: readonly Wait[], said: Pick<Hold, 'why' | 'by'> = {}) {
  const words = saidWord(said);
  if (!waits.length) return `held until a person lifts it${words}`;
  const named = runList(waits.map(waitName));
  const one = waits.length === 1;
  const held = `held until ${named} ${one ? 'succeeds' : 'succeed'}${words}`;
  if (waits.every((w) => w.released)) return `${held} — ${one ? 'it has' : 'they have'}, and the next tick lifts the hold`;
  return held;
}

/**
 * What a held run leaves a person to do, in one line, for `nemia decide` and `nemia ls`. Pure. Nothing, while each run it waits on may
 * still succeed: the tick lifts the hold when they have, and what the run's steps ask is asked then. Nothing either for a hold that names
 * no run: it is the person's word already given, and only `--off` lifts it. For a run that never will without a person — no such run, a
 * cancelled one, a failed one — why, and the ways out: retry it or release its waiters, lift the hold, or cancel the run.
 * @param run The held run.
 * @param waits Each run the hold waits on (`holdsOf`); none for a hold that names no run.
 */
export function holdAdvice(run: Run, waits: readonly Wait[]) {
  const off = `nemia hold ${run.id} --off`;
  if (!waits.length) return `nothing of ${run.id} is filed, and nothing is asked of you, until a person lifts the hold; to go on: ${off}`;
  if (waits.every((w) => w.released)) return `the next tick lifts the hold, and ${run.id} goes on; nothing to decide yet`;
  const never = waits.filter(neverSucceeds);
  if (!never.length) {
    const ids = waits.map((w) => w.run);
    return `nothing of ${run.id} is filed, and nothing is asked of you, until ${runList(ids)} ${ids.length > 1 ? 'have' : 'has'} succeeded; to go on before then: ${off}`;
  }
  const outs = [...never.flatMap(waysOut), off, `nemia cancel ${run.id}`];
  return `${never.map(neverWhy).join('; ')} — yours to resolve: ${outs.join(', or ')}`;
}

/**
 * The runs `r` waits on, each beside the edge that says how: its `after` while the gate applies (`gated`), then the runs it is held
 * until.
 */
const waitsOn = (r: Run) => [
  ...(gated(r) && r.after ? r.after.map((a) => [a, `${r.id} --after ${a}`] as [string, string]) : []),
  ...(r.hold?.until ?? []).map((h) => [h, `${r.id} held until ${h}`] as [string, string]),
];

/**
 * The edges from run `u` to run `id` along what each run of `byId` waits on (`waitsOn`), the first found breadth first, or undefined
 * where `u` waits on `id` by no route.
 */
function routeTo(u: string, id: string, byId: ReadonlyMap<string, Run>) {
  const how = new Map<string, string[]>([[u, []]]);
  const queue = [u];
  for (let at = queue.shift(); at !== undefined; at = queue.shift()) {
    const r = at === id ? undefined : byId.get(at);
    const before = how.get(at);
    if (before === undefined) continue;
    for (const [next, edge] of r ? waitsOn(r) : []) {
      if (how.has(next)) continue;
      const route = [...before, edge];
      if (next === id) return route;
      how.set(next, route);
      queue.push(next);
    }
  }
  return undefined;
}

/** What of the run refuses its hold (`holdStop`), in words that name the fix. */
function stopWords(run: Run, stop: HoldStop, until: readonly string[]) {
  const id = run.id;
  if (stop === 'cancelled') return `${id} was cancelled at ${run.cancelledAt}: nothing of it is filed again, so there is nothing to hold.`;
  if (stop === 'pruned')
    return `${id} was ${run.pruned ? prunedWords(run.pruned) : 'pruned'}: nothing of it is filed again, so there is nothing to hold.`;
  if (stop === 'succeeded') return `${id} has succeeded: nothing of it is left to file, so there is nothing to hold.`;
  if (stop === 'held') {
    const held = run.hold ?? { at: '', until: [] };
    const all = [...new Set([...held.until, ...until])];
    return `${id} is already ${holdWord(held.until.map((u) => ({ run: u })))} (nemia hold, at ${held.at || 'a time its file no longer says'}). A hold is put once, whole: lift it, and hold the run again on every run it waits on — nemia hold ${id} --off, then ${holdAgain(id, all, held.why)}.`;
  }
  return `${id} cannot be held.`;
}

/**
 * Why `nemia hold <run> [--until <run>…]` will not hold this run, in words that name the fix — or null. Pure: handed the run, each run
 * named as `parentOf` reads it — its record and where a wait on it stands — every run in the store, for the circle, and whether the run
 * has succeeded.
 *
 * Refused, of the run, as `holdStop` decides it: a run cancelled, pruned or succeeded, of which nothing is left to file, so nothing to
 * hold; and a run already held, since a hold is put once, whole — it is lifted and put again. A hold that names no run is refused nothing
 * else: it holds the run until a person lifts it. Of each run named: given twice, the run itself, one the store does not have, a
 * cancelled run, and one that has already succeeded or been released, which there is nothing to wait for. And a circle: a run named that
 * already waits on this one — through `--after` while it has not started (`gated`), or a hold — however far round, since each would wait
 * on the other for ever.
 * @param run The run to hold.
 * @param until The runs it is asked to wait on to succeed, by id; none for a hold a person alone lifts.
 * @param parentOf How a run another waits on reads, by its id: its record and where a wait on it stands.
 * @param others Every run in the store, read for a circle of waits.
 * @param succeeded That the run has succeeded, so nothing of it is left to file.
 */
export function holdRefusal(
  run: Run,
  until: readonly string[],
  parentOf: (runId: string) => Pick<ParentRun, 'record' | 'standing'>,
  others: readonly Run[],
  succeeded = false,
) {
  const id = run.id;
  const stop = holdStop({
    cancelled: Boolean(run.cancelledAt),
    pruned: Boolean(run.pruned),
    succeeded,
    held: Boolean(run.hold),
  });
  if (stop) return stopWords(run, stop, until);
  const seen = new Set<string>();
  for (const u of until) {
    const drop = `hold it without --until ${u}`;
    const Drop = `Hold it without --until ${u}`;
    if (seen.has(u)) return `--until ${u} is given twice, and a run waits on another once. Give each run one --until.`;
    seen.add(u);
    if (u === id)
      return `--until ${u}: that is ${id} itself, and a run that waits on itself to succeed never does. Name the runs it waits on.`;
    const { record, standing } = parentOf(u);
    if (!record) return `--until ${u}: the store has no run ${u}. --until takes a run ${id} waits on, by its id — nemia ls lists them.`;
    if (record.cancelledAt)
      return `--until ${u}: ${u} was cancelled at ${record.cancelledAt}, and a cancelled run never succeeds, so ${id} would wait for ever. ${Drop}.`;
    if (standing.kind === 'released')
      return `--until ${u}: ${u} has already succeeded or been released, so there is nothing to wait for: ${drop}.`;
  }
  const byId = new Map(others.map((r) => [r.id, r]));
  for (const u of until) {
    const route = routeTo(u, id, byId);
    if (route)
      return `--until ${u}: ${u} already waits on ${id} to succeed (${route.join(', ')}), so each would wait on the other for ever. Hold it without --until ${u}.`;
  }
  return null;
}

/**
 * Why `nemia start --after` will not start this run, in words that name the fix — or null. Pure: handed each parent as `parentOf` reads it,
 * and asked before anything is written.
 *
 * Refused: an id given twice; a run the store does not have; and a cancelled run, which never succeeds, so this run would wait for ever.
 * Any other run may be waited on, whatever its repository, base branch or place: a wait reads no branch. The run itself cannot be named:
 * it has no id yet.
 * @param after The runs `--after` names, by id, in the order given.
 * @param parentOf How each parent reads, by its id: its record.
 */
export function afterRefusal(after: readonly string[], parentOf: (runId: string) => Pick<ParentRun, 'record'>) {
  const seen = new Set<string>();
  for (const id of after) {
    if (seen.has(id)) return `--after ${id} is given twice, and a run waits on another once. Give each run one --after.`;
    seen.add(id);
    const { record } = parentOf(id);
    if (!record)
      return `--after ${id}: the store has no run ${id}. --after takes a run this one waits on, by its id — nemia ls lists them.`;
    if (record.cancelledAt)
      return `--after ${id}: ${id} was cancelled at ${record.cancelledAt}, and a cancelled run never succeeds, so this run would wait for ever. Start it without --after ${id}.`;
  }
  return null;
}
