/**
 * What a run waits on before its steps are filed: the runs it follows (`waitsOf`, `runReady`) and the holds a person put on it
 * (`holdsOf`), with their words, their advice and the refusals they give (`holdRefusal`, `afterRefusal`). Pure.
 */
import path from 'node:path';
import { prunedWords, type Hold, type Run } from '../record/record.ts';

/**
 * Whether any step of the run has been filed, on any try — a step a round moved behind still has its tries. A run that has
 * started never waits on a run again.
 */
export const hasStarted = (run: Run): boolean => Object.values(run.steps).some((s) => Boolean(s.taskId) || Boolean(s.tries?.length));

/**
 * Whether the gate applies to this run, and a parent is read at all: it waits on runs, nobody has called it off, and nothing of it has
 * been filed. None for a run with no `after`; none for a cancelled run, which files nothing anyway; and none for a
 * run that has started — whose parents are never read again, so a parent's branch deleted after the merge (`nemia decide`'s "drop it", a
 * `git branch -d` after shipping) cannot un-ready it.
 */
export const gated = (run: Run): boolean => Boolean(run.after?.length) && !run.cancelledAt && !hasStarted(run);

/**
 * The runs in `after` that have not shipped, in the order they were given. Pure; none, and `shipped` never called, for a run not `gated`.
 */
export function waitingOn(run: Run, shipped: (runId: string) => boolean): string[] {
  if (!gated(run)) return [];
  return run.after!.filter((id) => !shipped(id));
}

/**
 * Whether the tick may file this run's roots: true when every run in its `after` has shipped, as `nemia decide` says it of that run —
 * not running, not cancelled, and every result branch on the base branch — never when its steps say they are done, because the run
 * boundary is the human gate. Pure. True for a run that is not `gated`, without asking.
 */
export const runReady = (run: Run, shipped: (runId: string) => boolean): boolean => waitingOn(run, shipped).length === 0;

/**
 * A run another waits on, as the tick reads it on the pass that asks (`parentOf` in views.verb.ts): its record, when the store has one;
 * whether it shipped, as its own `nemia decide` would say; and the result branches it recorded that git no longer has, when there are any.
 */
export type ParentRun = { record?: Run; shipped: boolean; gone?: string[] };

/**
 * A run this one waits on, as `nemia ls` and `nemia decide` name it: its id and, when it may never ship without a person, why — the store
 * has no such run, it was cancelled, or a result branch it recorded is gone, and git cannot find it on the base. `shipped` only on a hold
 * whose every run has shipped, in the moment before the tick lifts it (`holdsOf`).
 */
export type Wait = { run: string; missing?: true; cancelledAt?: string; gone?: string[]; shipped?: true };

/** Each run this one waits on that has not shipped (`waitingOn`), and why it may never. Pure. */
export function waitsOf(run: Run, parentOf: (runId: string) => ParentRun): Wait[] {
  return waitingOn(run, (id) => parentOf(id).shipped).map((id) => {
    const { record, gone } = parentOf(id);
    if (!record) return { run: id, missing: true };
    if (record.cancelledAt) return { run: id, cancelledAt: record.cancelledAt };
    return gone?.length ? { run: id, gone } : { run: id };
  });
}

/** Whether a person has to act for this run to ship: nothing the tick can read will change on its own. */
const neverShips = (w: Wait): boolean => Boolean(w.missing || w.cancelledAt || w.gone?.length);

/** A run's roots, waiting, as `nemia ls` says it in the status column: `waiting on a-1x2y (cancelled), b-3z4w`. */
export const waitWord = (waits: readonly Wait[]): string =>
  `waiting on ${waits.map((w) => `${w.run}${w.missing ? ' (no such run)' : w.cancelledAt ? ' (cancelled)' : w.gone?.length ? ` (${w.gone.join(', ')} gone)` : ''}`).join(', ')}`;

/**
 * What a run waiting on runs leaves a person to do, in one line, for `nemia decide` and for `nemia ls`'s `→ waiting on you`. Pure. Nothing,
 * while each parent may still ship: the tick files the roots when it does. For a parent that never will without a person — no such run, a
 * cancelled one, a result branch gone — why, and the two ways out: cancel this run, or start the work again without that edge.
 */
export function waitAdvice(run: Run, waits: readonly Wait[]): string {
  const never = waits.filter(neverShips);
  if (!never.length) {
    return `nothing of ${run.id} is filed until nemia decide says ${waits.map((w) => w.run).join(' and ')} ${waits.length > 1 ? 'have' : 'has'} shipped onto ${run.branch}; nothing to decide yet`;
  }
  const why = never.map((w) =>
    w.missing
      ? `the store has no run ${w.run}`
      : w.cancelledAt
        ? `${w.run} was cancelled at ${w.cancelledAt}, and a cancelled run never ships`
        : `${w.gone!.join(', ')} ${w.gone!.length > 1 ? 'are gone, and git cannot find them' : 'is gone, and git cannot find it'} on ${run.branch}`,
  );
  return `${why.join('; ')} — yours to resolve: nemia cancel ${run.id}, or start the work again without ${never.map((w) => `--after ${w.run}`).join(' ')}`;
}

/**
 * The runs a held run waits on to ship (`Run.hold`), as `nemia ls` and `nemia decide` name them: each that has not shipped, and why it may
 * never (`waitsOf`'s words). Pure. None for a run nobody holds. While every one has shipped and the tick has not yet lifted the hold, each
 * is named all the same, marked `shipped`: the run is still held, and says why for the moment it is.
 */
export function holdsOf(run: Run, parentOf: (runId: string) => ParentRun): Wait[] {
  if (!run.hold) return [];
  const waits: Wait[] = run.hold.until
    .filter((id) => !parentOf(id).shipped)
    .map((id) => {
      const { record, gone } = parentOf(id);
      if (!record) return { run: id, missing: true };
      if (record.cancelledAt) return { run: id, cancelledAt: record.cancelledAt };
      return gone?.length ? { run: id, gone } : { run: id };
    });
  return waits.length ? waits : run.hold.until.map((id) => ({ run: id, shipped: true as const }));
}

/** Words as a shell reads them back whole: in single quotes, each `'` in them closed, escaped and opened again. */
const shellQuoted = (words: string): string => `'${words.replaceAll("'", `'\\''`)}'`;

/** The command that holds `id` on `until`, with the words `why` a hold had: `nemia hold r-1 --until a-1 --why 'merge conflicts'`. */
const holdAgain = (id: string, until: readonly string[], why?: string): string =>
  `nemia hold ${id} ${until.map((u) => `--until ${u}`).join(' ')}${why ? ` --why ${shellQuoted(why)}` : ''}`;

/** `a` and `b`, or `a, b and c`, of runs. */
const runList = (ids: readonly string[]): string => (ids.length > 1 ? `${ids.slice(0, -1).join(', ')} and ${ids.at(-1)}` : (ids[0] ?? ''));

/** What the person who put a hold said of it, as it follows `held until …`: ` (why: …; by …)`, ` (why: …)`, ` (by …)`, or nothing. */
const saidWord = ({ why, by }: Pick<Hold, 'why' | 'by'>): string => {
  const parts = [...(why ? [`why: ${why}`] : []), ...(by ? [`by ${by}`] : [])];
  return parts.length ? ` (${parts.join('; ')})` : '';
};

/**
 * A held run, as `nemia ls` and `nemia decide` say it: `held until a-1x2y ships`, each run it waits on with why it may never, as `waitWord`
 * names them, then what the person who put the hold said of it when `said` is given: `held until a-1x2y ships (why: merge conflicts; by
 * operator)`. Pure. Never `waiting on you`: a hold is a person's word already given, and nothing is asked of anyone while it stands.
 *
 * @param said The hold's `why` and `by`, each shown when it is there; a hold file older code wrote has neither, and shows the plain line.
 */
export function holdWord(waits: readonly Wait[], said: Pick<Hold, 'why' | 'by'> = {}): string {
  const words = saidWord(said);
  if (!waits.length) return `held, on a hold that names no run${words}`;
  const named = runList(
    waits.map(
      (w) =>
        `${w.run}${w.missing ? ' (no such run)' : w.cancelledAt ? ' (cancelled)' : w.gone?.length ? ` (${w.gone.join(', ')} gone)` : ''}`,
    ),
  );
  const one = waits.length === 1;
  const held = `held until ${named} ${one ? 'ships' : 'ship'}${words}`;
  if (waits.every((w) => w.shipped)) return `${held} — ${one ? 'it has' : 'they have'} shipped, and the next tick lifts the hold`;
  return held;
}

/**
 * What a held run leaves a person to do, in one line, for `nemia decide` and `nemia ls`. Pure. Nothing, while each run it waits on may
 * still ship: the tick lifts the hold when they have, and what the run's steps ask is asked then. For a run that never will without a
 * person — no such run, a cancelled one, a result branch gone — or a hold that names no run, why, and the ways out: lift the hold, or
 * cancel the run.
 */
export function holdAdvice(run: Run, waits: readonly Wait[]): string {
  const off = `nemia hold ${run.id} --off`;
  if (!waits.length) return `the hold on ${run.id} names no run, so no run's shipping lifts it — yours to lift: ${off}`;
  if (waits.every((w) => w.shipped)) return `the next tick lifts the hold, and ${run.id} goes on; nothing to decide yet`;
  const never = waits.filter(neverShips);
  if (!never.length) {
    const ids = waits.map((w) => w.run);
    return `nothing of ${run.id} is filed, and nothing is asked of you, until nemia decide says ${runList(ids)} ${ids.length > 1 ? 'have' : 'has'} shipped; to go on before then: ${off}`;
  }
  const why = never.map((w) =>
    w.missing
      ? `the store has no run ${w.run}`
      : w.cancelledAt
        ? `${w.run} was cancelled at ${w.cancelledAt}, and a cancelled run never ships`
        : `${w.gone!.join(', ')} ${w.gone!.length > 1 ? 'are gone, and git cannot find them' : 'is gone, and git cannot find it'} on ${run.branch}`,
  );
  return `${why.join('; ')} — yours to resolve: ${off}, or nemia cancel ${run.id}`;
}

/**
 * Why `nemia hold <run> --until <run>…` will not hold this run, in words that name the fix — or null. Pure: handed the run, each run named
 * as `parentOf` reads it — its record, whether it has shipped as `nemia decide` says it, and a result branch gone — every run in the store,
 * for the circle, and `finished`: that the run has shipped, or succeeded and waits on nothing but a person's merge.
 *
 * Refused, of the run: nothing named; a run cancelled, pruned or finished, of which nothing is left to file, so nothing to hold; a run
 * already held, since a hold is put once, whole — it is lifted and put again; and a folder run, which ships onto no branch. Of each run
 * named, what `afterRefusal` refuses of `--after`, for the same reason, a wait for ever: given twice, the run itself, one the store does
 * not have, a folder run, another repository or another base branch, one that worked on its base (`--no-worktree`), a cancelled run and
 * one whose result branch is gone. And one already shipped, which there is nothing to wait for. And a circle: a run named that already
 * waits on this one — through `--after` while it has not started (`gated`), or a hold — however far round, since each would wait on the
 * other for ever.
 */
export function holdRefusal(
  run: Run,
  until: readonly string[],
  parentOf: (runId: string) => Pick<ParentRun, 'record' | 'gone' | 'shipped'>,
  others: readonly Run[],
  finished?: 'shipped' | 'succeeded',
): string | null {
  const id = run.id;
  if (!until.length)
    return `nemia hold ${id} needs the runs it waits on to ship: nemia hold ${id} --until <run>, once for each. To lift a hold: nemia hold ${id} --off.`;
  if (run.cancelledAt) return `${id} was cancelled at ${run.cancelledAt}: nothing of it is filed again, so there is nothing to hold.`;
  if (run.pruned) return `${id} was ${prunedWords(run.pruned)}: nothing of it is filed again, so there is nothing to hold.`;
  if (finished === 'shipped') return `${id} has shipped: nothing of it is left to file, so there is nothing to hold.`;
  if (finished === 'succeeded') {
    return `${id} has succeeded: nothing of it is left to file, so there is nothing to hold, and what is left is yours — merge its branch once ${runList([...until])} ${until.length > 1 ? 'have' : 'has'} shipped (nemia decide ${id} names it).`;
  }
  if (run.hold) {
    const all = [...new Set([...run.hold.until, ...until])];
    return `${id} is already ${holdWord(run.hold.until.map((u) => ({ run: u })))} (nemia hold, at ${run.hold.at || 'a time its file no longer says'}). A hold is put once, whole: lift it, and hold the run again on every run it waits on — nemia hold ${id} --off, then ${holdAgain(id, all, run.hold.why)}.`;
  }
  if (run.repo === undefined) {
    return `${id}'s team works in folders (place: folder), and a hold waits for runs to ship onto its git branch, which a folder run has none of. Cancel it (nemia cancel ${id}) and start it again once the work it waits on is done.`;
  }
  const seen = new Set<string>();
  for (const u of until) {
    const drop = `hold it without --until ${u}`;
    const Drop = `Hold it without --until ${u}`;
    if (seen.has(u)) return `--until ${u} is given twice, and a run waits on another once. Give each run one --until.`;
    seen.add(u);
    if (u === id)
      return `--until ${u}: that is ${id} itself, and a run that waits on itself to ship never does. Name the runs it waits on.`;
    const { record, gone, shipped } = parentOf(u);
    if (!record) return `--until ${u}: the store has no run ${u}. --until takes a run ${id} waits on, by its id — nemia ls lists them.`;
    if (record.repo === undefined)
      return `--until ${u}: ${u} is a folder run (place: folder), which never ships onto a branch, so ${id} would wait for ever. When ${u}'s work is done, there is nothing to hold for: ${drop}.`;
    if (path.resolve(record.repo) !== path.resolve(run.repo)) {
      return `--until ${u}: ${u} works on ${record.repo}, and ${id} on ${run.repo}. A run waits for another to ship onto its own base branch, which a run on another repository never does: ${drop}.`;
    }
    if (!record.isolate)
      return `--until ${u}: ${u} worked on ${record.branch} itself (--no-worktree), so it has no result branch to ship, and ${id} would wait for ever. When ${u}'s work is done, ${drop}.`;
    if (record.branch !== run.branch)
      return `--until ${u}: ${u} ships onto ${record.branch}, and ${id} onto ${run.branch}, so ${id} would wait on a branch it never meets. ${Drop}.`;
    if (record.cancelledAt)
      return `--until ${u}: ${u} was cancelled at ${record.cancelledAt}, and a cancelled run never ships, so ${id} would wait for ever. ${Drop}.`;
    if (gone?.length) {
      return `--until ${u}: ${gone.join(', ')} ${gone.length > 1 ? 'are gone, and git cannot find them' : 'is gone, and git cannot find it'} on ${record.branch}, so ${id} would wait for ever. If ${u}'s work is on ${record.branch}, there is nothing to wait for: ${drop}.`;
    }
    if (shipped) return `--until ${u}: ${u} has already shipped onto ${record.branch}, so there is nothing to wait for: ${drop}.`;
  }
  const byId = new Map(others.map((r) => [r.id, r]));
  const waitsOn = (r: Run): Array<[string, string]> => [
    ...(gated(r) ? r.after!.map((a) => [a, `${r.id} --after ${a}`] as [string, string]) : []),
    ...(r.hold?.until ?? []).map((h) => [h, `${r.id} held until ${h}`] as [string, string]),
  ];
  for (const u of until) {
    const how = new Map<string, string[]>([[u, []]]);
    const queue = [u];
    while (queue.length) {
      const at = queue.shift()!;
      const r = at === id ? undefined : byId.get(at);
      for (const [next, edge] of r ? waitsOn(r) : []) {
        if (how.has(next)) continue;
        const route = [...how.get(at)!, edge];
        if (next === id)
          return `--until ${u}: ${u} already waits on ${id} to ship (${route.join(', ')}), so each would wait on the other for ever. Hold it without --until ${u}.`;
        how.set(next, route);
        queue.push(next);
      }
    }
  }
  return null;
}

/**
 * Why `nemia start --after` will not start this run, in words that name the fix — or null. Pure: handed each parent as `parentOf` reads it,
 * and asked before anything is written.
 *
 * Refused: an id given twice; a run the store does not have; a run on another repository, or shipping onto another base branch — it would
 * never ship onto this run's, or this run would never start from a base with its work; a run that worked on its base branch itself
 * (`--no-worktree`), which has no result branch to ship; a cancelled run, which `nemia decide` never calls shipped, whatever git says of
 * its branch; and one whose result branch is gone, and whose commit git cannot find on the base — this run would wait for ever on either. A
 * folder run is refused on either side, since it ships onto no branch: as the parent, and as this run, whatever the id names. Handed only
 * what the record and git say (`parentRecord` in branches.store.ts): nothing here needs the engine. The run itself cannot be named: it has
 * no id yet.
 */
export function afterRefusal(
  after: readonly string[],
  child: Pick<Run, 'repo' | 'branch' | 'place'>,
  parentOf: (runId: string) => Pick<ParentRun, 'record' | 'gone'>,
): string | null {
  const seen = new Set<string>();
  for (const id of after) {
    const without = `start it without --after ${id}`;
    if (seen.has(id)) return `--after ${id} is given twice, and a run waits on another once. Give each run one --after.`;
    seen.add(id);
    if (child.repo === undefined) {
      return `--after ${id}: this run's team works in folders (place: folder), and --after waits for a run to ship onto a git branch, which a folder run has none of. Start it without --after, once ${id} is done.`;
    }
    const { record, gone } = parentOf(id);
    if (!record)
      return `--after ${id}: the store has no run ${id}. --after takes a run this one waits on, by its id — nemia ls lists them.`;
    if (record.repo === undefined) {
      return `--after ${id}: ${id} is a folder run (place: folder), which never ships onto a branch, so this run would wait for ever. When ${id}'s work is done, ${without}.`;
    }
    if (path.resolve(record.repo) !== path.resolve(child.repo)) {
      return `--after ${id}: ${id} works on ${record.repo}, and this run on ${child.repo}. A run waits for another to ship onto its own base branch, which a run on another repository never does: start it with --repo ${record.repo}, or ${without}.`;
    }
    if (!record.isolate) {
      return `--after ${id}: ${id} worked on ${record.branch} itself (--no-worktree), so it has no result branch to ship, and this run would wait for ever. When ${id}'s work is done, ${without}.`;
    }
    if (record.branch !== child.branch) {
      return `--after ${id}: ${id} ships onto ${record.branch}, and this run would start from ${child.branch}, a base without ${id}'s work. Check out ${record.branch} in ${child.repo} and start it again, or ${without}.`;
    }
    if (record.cancelledAt)
      return `--after ${id}: ${id} was cancelled at ${record.cancelledAt}, and a cancelled run never ships, so this run would wait for ever. Start it without --after ${id}.`;
    if (gone?.length) {
      return `--after ${id}: ${gone.join(', ')} ${gone.length > 1 ? 'are gone, and git cannot find them' : 'is gone, and git cannot find it'} on ${record.branch}, so this run would wait for ever. If ${id}'s work is on ${record.branch}, there is nothing to wait for: ${without}.`;
    }
  }
  return null;
}
