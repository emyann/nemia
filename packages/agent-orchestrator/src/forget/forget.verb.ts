/**
 * Forgetting a run that is over (`forgetRun`, `nemia rm`): it reads a run as `cancelRun` does, adopting what a pass filed and never wrote
 * down (`tick/advance.verb.ts`), refuses by name before anything is touched, and removes through the run's place (`runPlaceVerb`). A
 * controller, reaching the runtime through the client (`runtime-client.ts`): an Effect program that requires the engine as a service
 * (`EngineService`), run with `runWith`. It never stops anything. `nemia rm` closes a task held open that waits for a word, which runs
 * nothing and is settled as it signed: no pass reads the run again to close it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Effect, Exit } from 'effect';
import { EngineService, over, tried, type Engine } from '../runtime-client.ts';
import type { Workflow } from '../step/step.ts';
import { isRepositoryRun, namesInOrder, runTasks, type RepositoryRun, type Run } from '../record/record.ts';
import { approvedFirst, landsOnCheck } from '../status/status.ts';
import {
  branchFates,
  checkLogsOf,
  forgetRefusal,
  heldWorktree,
  idRefusal,
  inventoryUnread,
  runWorktrees,
  type AskName,
  type BranchFate,
  type ForgetHow,
  type Forgot,
} from './forget.ts';
import { HOME, lstatOf, stepsOf } from '../record/record.store.ts';
import { UnloadedFolder } from '../record/steps.store.ts';
import { runStore } from '../record/files.store.ts';
import { readPlaceJson, readRunPlace, runPlaceVerb, RunPlace, type RunPlaceRead } from '../place/place.store.ts';
import { sayFilled, unansweredWords, type Held } from '../place/place.ts';
import { standingsOf, type BranchReader } from '../branches/branches.store.ts';
import { headsOver, NOTHING_READ, standingLive, standingReader } from '../standing/standing.verb.ts';
import { statusMemo } from '../place/landing.store.ts';
import { merging, resolved } from '../prune/prune.verb.ts';
import { closeoutAsked, closeoutReader, exitVerdicts, spendReader, taskPhasesRead } from '../views/views.verb.ts';
import { adoptChecks, adoptRounds, adoptTries, unrecordedSteps } from '../tick/advance.verb.ts';
import { closeWaitingTasks } from '../tick/held.verb.ts';
import { Invalid } from '../refusal/refusal.ts';
import { engineForgetting, forgetTasks } from '../forgetting/forgetting.verb.ts';
import { forgettingOf, uncountedWords, type EngineForgetting } from '../forgetting/forgetting.ts';

/** A run's answer when nothing of its worktrees or branches was touched, afresh on each call. */
const nothing = (): Omit<Forgot, 'id' | 'kind'> => ({ removed: [], handedOff: [], gone: [], left: [], branches: [], files: [] });

/** What `nemia rm` is left with once a run's record is read and what a pass filed and never wrote down is adopted onto it. */
type Forgetting = Effect.Success<ReturnType<typeof readForgetting>>;

/** What was done to a repository run's worktrees (`removeWorktrees`). */
type Worktrees = Pick<Forgot, 'removed' | 'handedOff' | 'gone' | 'left'>;

/**
 * Forget a run that is over — `nemia rm` — or say why not and touch nothing (`forgetRefusal`). It never stops anything: calling a run off
 * is `cancel`, a decision of its own.
 *
 * Read as `cancel` reads a run: a check, a try, a round or a step a pass filed and never wrote down is adopted in memory, so it is in
 * flight too — on a cancelled run as well, which a pass that read it before the cancel may be filing now. A record with no frozen workflow
 * reads its folder, which may be gone: the run is then judged without its steps (`forgetRefusal`). Where the result stands against the
 * base branch is read only for an ending that has not run: one whose result git already has holds nothing.
 *
 * Once nothing refuses, a task held open that waits for a word is closed, as no pass reads the run again to close it; one the engine
 * refuses to close, answered, settled or stopped since it was read, waits for nothing. A folder run's folders are under its own directory,
 * and go with its record: no worktree, no branch, and no git asked. A repository run goes in an order `nemia rm` can finish when it is
 * interrupted and run again:
 *
 * 0. **What it left, read by its place** (`inventory`, from the place `RunPlace` names), before anything is written: its worktrees inside
 *    `worktrees/<id>` and its branches under `wf/<id>/`. An inventory refused or not heard is no answer, never an empty one: the run is
 *    refused in those words (`inventoryUnread`), and nothing is touched.
 * 1. **Its worktrees, through its place**: each the inventory lists (`runWorktrees`), by its real path, so the run's directory and the
 *    record's are read the same way (`resolved`). One whose directory is gone, or is no worktree git can read, and is not locked, is
 *    pruned. What one holds uncommitted is committed first under its step's name by the place's `handoff` — a failed or stopped step's
 *    work lives only there — and what git ignores is not work. Then one `remove` of them all, never forced, which prunes git's list. A
 *    worktree git will not remove — locked, still dirty, on no branch with something a removal would leave on none (`heldWorktree`), or
 *    whose hand-off git refuses — is left as it is, and said why with the place's command for it (its `say`); so is one whose verb did
 *    not answer, and a directory in `worktrees/<id>` git does not know. Then the run is `held`, and nothing else is removed, so its record
 *    is there for `nemia rm` to find it by once a person has dealt with them.
 * 2. **Its branches**, as asked (`branchFates`): kept by default; deleted merged into the run's base branch, as the inventory read it —
 *    never one a hand-off just committed onto — or forced; through the place's `remove`.
 * 3. **Its record, then every file under `WF_ROOT` keyed by its id** (`removeKeyed`): the record first, so the run is never read without
 *    the cancellation it had. A pass halfway through the run writes nothing back (`rewriteRun`).
 * 4. **Its tasks, through the engine** (`forgetTasks`): every task its record names (`runTasks`, the adopted ones among them) was written
 *    down once nothing refused (`runStore.forgetting`), before anything was removed, and the engine's `forget` removes each settled one's
 *    journal, feed lines and session files. A task just closed has not settled: it waits, with the marker, for the tick to forget it
 *    (`finishForgetting`), or for `nemia rm` again. A run `held` lifts its marker and forgets nothing: it is still listed.
 *
 * A run whose record is gone is normal: what is left under its id, its files, is removed and named — never a worktree, since nothing says
 * whose they are — and its tasks a marker names are forgotten; a run whose worktrees or branches are already gone says so. Refused before
 * anything is read, with exit code 2: an id that is not a name (`idRefusal`). Fails with a refusal a read threw; dies of anything else
 * (`tried`, `awaited`).
 */
export const forgetRun = Effect.fn('forget')(function* (id: string, how: ForgetHow = {}) {
  const e = yield* EngineService;
  const refusedId = idRefusal(id);
  if (refusedId) return yield* Effect.fail(new Invalid({ message: refusedId }));
  const dir = path.join(HOME, 'worktrees', id);
  if (!(yield* tried(() => runStore.runs.exists(id)))) return yield* forgetMissing(id, dir);
  const f = yield* readForgetting(e, id);
  const { run, steps, unfrozen } = f;
  const said = { id, repo: run.repo, base: run.branch, isolate: run.isolate, ...(unfrozen ? { unfrozen } : {}) };
  const git = asksStanding(f.run, f.steps) ? yield* standingLive([f.run]) : standingReader(NOTHING_READ);
  const refusal = yield* tried(() => refusalOf(id, f, git));
  if (refusal) return { ...said, kind: 'refused', refusal, ...nothing() } satisfies Forgot;
  const dirOf = yield* RunPlace;
  const read = isRepositoryRun(run) ? yield* tried(() => readRunPlace(run, dirOf(run), dir)) : undefined;
  if (isRepositoryRun(run) && read && !('inventory' in read))
    return { ...said, kind: 'refused', refusal: inventoryUnread('rm', id, run.repo, read), ...nothing() } satisfies Forgot;
  const place = read && 'inventory' in read ? read : undefined;
  const taskIds = forgottenIds(run);
  yield* tried(() => runStore.forgetting.write(id, taskIds));
  yield* closeWaitingTasks(e, run, f.views);
  if (!isRepositoryRun(run) || !place) {
    const files = yield* tried(() => removeKeyed(id, Object.keys(run.steps)));
    return { ...said, folder: true, kind: 'forgotten', ...nothing(), files, engine: yield* forgetTasks(id, taskIds) } satisfies Forgot;
  }
  const worktrees = yield* tried(() => removeWorktrees(run, steps, dir, place));
  if (worktrees.left.length) {
    yield* tried(() => runStore.forgetting.lift(id));
    return { ...said, kind: 'held', ...worktrees, branches: [], files: [] } satisfies Forgot;
  }
  const branches = yield* tried(() => deleteBranches(run, how, place, worktrees.handedOff));
  const files = yield* tried(() => removeKeyed(id, Object.keys(run.steps)));
  return { ...said, kind: 'forgotten', ...worktrees, branches, files, engine: yield* forgetTasks(id, taskIds) } satisfies Forgot;
});

/**
 * A run whose record is gone: what is left under its id removed and named, `worktrees/<id>` named as orphaned, never removed, with what
 * to do in the words of the place `RunPlace` names for a record that names none (`orphans`), and the
 * engine's tasks a `nemia rm` cut short or left waiting wrote down (`runStore.forgetting`) forgotten now (`forgetTasks`).
 */
const forgetMissing = Effect.fn('forgetMissing')(function* (id: string, dir: string) {
  const files = yield* tried(() => removeKeyed(id, undefined));
  const dirOf = yield* RunPlace;
  const orphans = () => readPlaceJson(dirOf({ id })).say.orphans;
  const left: Forgot['left'] = lstatOf(dir) ? [{ path: dir, orphaned: true, fix: yield* tried(orphans) }] : [];
  const taskIds = yield* tried(() => runStore.forgetting.read(id));
  const engine = taskIds ? { engine: yield* forgetTasks(id, taskIds) } : {};
  const forgot: Forgot = { id, kind: 'missing', ...nothing(), files, left, ...engine };
  return forgot;
});

/**
 * A run's frozen steps, or, for a record with no frozen workflow whose folder does not read, why (`unfrozen`): whatever reading it throws,
 * a plain `ENOENT` included, so the run is judged without its steps.
 */
function frozenSteps(run: Run): { steps?: Workflow[]; unfrozen?: string } {
  try {
    return { steps: stepsOf(run) };
  } catch (err) {
    return { unfrozen: err instanceof UnloadedFolder ? err.why : (err as Error).message };
  }
}

/**
 * Read the run `id` as `cancel` does: its record, its frozen steps (`frozenSteps`), the engine's view of its tasks, and its asks; then
 * every check, try, round and step a pass filed and never wrote down, adopted onto the record in memory.
 */
const readForgetting = Effect.fn('readForgetting')(function* (e: Engine, id: string) {
  const run = yield* tried(() => runStore.runs.read(id));
  const { steps, unfrozen } = frozenSteps(run);
  const { views, phaseOf } = yield* taskPhasesRead(run).pipe(over(e));
  const { asks, rounds } = yield* tried(() => runStore.asks.read(id));
  const reader = closeoutReader(views, run);
  const asked = closeoutAsked(views);
  const verdictOf = exitVerdicts(views, run);
  const spendOf = spendReader(views);
  if (steps) {
    yield* adoptRounds(e, run, steps, views, phaseOf, reader, asked, rounds, spendOf);
    yield* adoptTries(e, run, steps, views, phaseOf, reader, asked, verdictOf, asks, spendOf);
    yield* adoptChecks(e, run, steps, views, phaseOf, reader, asked, spendOf);
    const unrecorded = yield* unrecordedSteps(e, run, steps, views, phaseOf, reader, asked, verdictOf, asks, rounds, spendOf);
    for (const { name, taskId } of unrecorded) run.steps[name] = { ...run.steps[name], taskId };
  }
  return { run, steps, unfrozen, views, phaseOf, asks, rounds, reader, asked, verdictOf, spendOf };
});

/** The ids of the engine's tasks `nemia rm` forgets of `run` as `readForgetting` adopts it: each task it names (`runTasks`), once. */
const forgottenIds = (run: Run): string[] => [...new Set(runTasks(run))];

/**
 * What `nemia rm` would forget of the engine's tasks of each of the runs `runIds`: each read as rm reads it (`readForgetting`), its ids
 * the ones rm writes down (`forgottenIds`), counted by one dry call over all of them together (`engineForgetting`), which reads the
 * engine's feed once, and shared out by run (`forgettingOf`) in `counted`. A run that does not read is left out of the call, and said in
 * `uncounted`, with why. Removes nothing.
 */
export const runsForgetting = Effect.fn('runsForgetting')(function* (runIds: readonly string[]) {
  const e = yield* EngineService;
  const tasks = new Map<string, string[]>();
  const uncounted: Array<{ id: string; text: string }> = [];
  for (const id of runIds) {
    const read = yield* Effect.exit(readForgetting(e, id));
    if (Exit.isSuccess(read)) tasks.set(id, forgottenIds(read.value.run));
    else uncounted.push({ id, text: uncountedWords(id, (Cause.squash(read.cause) as Error).message) });
  }
  const all = [...new Set([...tasks.values()].flat())];
  if (!all.length) return { counted: new Map<string, EngineForgetting>(), uncounted };
  const answer = yield* engineForgetting(all, { yes: false });
  return { counted: new Map([...tasks].map(([id, ids]) => [id, forgettingOf(answer, ids)] as const)), uncounted };
});

/**
 * Whether `nemia rm` reads where `run`'s result stands: for an ending gated before it runs that has not run, or one that lands on its
 * check, whose staged merge is read off its result tips.
 */
const asksStanding = (run: Run, steps: readonly Workflow[] | undefined): boolean =>
  isRepositoryRun(run) && (steps ?? []).some((s) => (approvedFirst(s, run) && !run.steps[s.name]?.taskId) || landsOnCheck(s, run));

/**
 * Why `nemia rm` will not forget the run `id`, read (`forgetRefusal`), or null: judged against the store's other runs, where its result
 * stands for an ending that has not run, and a merge the ending staged, as `git` reads them.
 */
function refusalOf(id: string, f: Forgetting, git: BranchReader): string | null {
  const { run, steps } = f;
  const askAt = (a: AskName) => runStore.asks.where(id, a);
  const others = runStore.runs.list().filter((o) => o.id !== id);
  const standings = steps?.some((s) => approvedFirst(s, run) && !run.steps[s.name]?.taskId) ? standingsOf(run, git) : [];
  const { phaseOf, reader, asked, verdictOf, asks, rounds, spendOf } = f;
  return forgetRefusal(
    steps,
    run,
    phaseOf,
    others,
    reader,
    asked,
    verdictOf,
    asks,
    rounds,
    spendOf,
    askAt,
    standings,
    'rm',
    merging(run, steps, statusMemo(headsOver(git))),
  );
}

/**
 * Remove a repository run's worktrees through its place (`runWorktrees`, `handWorktree`), in one `remove`, which prunes git's list, and
 * answer what was removed, handed off, already gone and left — a directory in `dir` git does not know among what is left (`strays`).
 */
function removeWorktrees(run: RepositoryRun, steps: readonly Workflow[] | undefined, dir: string, place: RunPlaceRead): Worktrees {
  const within = resolved(dir);
  const recorded = {
    ...run,
    steps: Object.fromEntries(
      Object.entries(run.steps).map(([name, st]) => [name, st.workspace ? { ...st, workspace: resolved(st.workspace) } : st]),
    ),
  };
  const { worktrees, unlisted } = runWorktrees(recorded, namesInOrder(run, steps ?? []), within, place.inventory.workspaces);
  const done: Worktrees = { removed: [], handedOff: [], gone: unlisted.filter((p) => !lstatOf(p)), left: [] };
  const removing = worktrees.filter((w) => handWorktree(run, place, w, done));
  if (worktrees.length) removeListed(run, place, removing, done);
  for (const at of strays(within)) if (!done.left.some((l) => l.path === at)) done.left.push({ path: at, unknown: true });
  return done;
}

/**
 * Whether one of a repository run's worktrees is to be removed, adding to `done` what is not: one git can prune and nobody locked is gone,
 * or pruned by the `remove`; one held (`heldWorktree`) is left with the place's command for it; one not clean is handed off first, and left
 * when its hand-off is refused, uncommitted, or does not answer.
 */
function handWorktree(run: RepositoryRun, place: RunPlaceRead, w: Held & { step: string }, done: Worktrees): boolean {
  if (w.prunable && w.locked === undefined) {
    if (!lstatOf(w.path)) done.gone.push(w.path);
    return false;
  }
  const hold = heldWorktree(w);
  if (hold) {
    const fix =
      'locked' in hold ? sayFilled(place.say.unlock, { repo: run.repo, path: w.path }) : sayFilled(place.say.attach, { path: w.path });
    done.left.push({ path: w.path, ...hold, fix });
    return false;
  }
  if (w.clean === true) return true;
  const handed = runPlaceVerb(place.dir, 'handoff', { workspace: w.path, step: w.step, why: ', before its run was forgotten' });
  if ('refused' in handed)
    done.left.push({ path: w.path, step: w.step, uncommitted: handed.refused, fix: sayFilled(place.say.commit, { path: w.path }) });
  else if ('unread' in handed) done.left.push({ path: w.path, step: w.step, unread: { verb: 'handoff', said: handed.unread.said } });
  else if (handed.answer.commit)
    done.handedOff.push({ step: w.step, ...(w.branch ? { branch: w.branch } : {}), commit: handed.answer.commit });
  return 'answer' in handed;
}

/** Remove `removing` through the place's `remove`, never forced, adding to `done` what went and what git would not remove, in its words. */
function removeListed(run: RepositoryRun, place: RunPlaceRead, removing: readonly Held[], done: Worktrees): void {
  const outcome = runPlaceVerb(place.dir, 'remove', { repo: run.repo, workspaces: removing.map((w) => w.path), branches: [] });
  if (!('answer' in outcome)) {
    for (const w of removing) done.left.push({ path: w.path, unread: { verb: 'remove', said: unansweredWords(outcome) } });
    return;
  }
  done.removed.push(...outcome.answer.removed);
  for (const l of outcome.answer.left) done.left.push({ path: l.path, git: l.said, fix: sayFilled(place.say.inspect, { path: l.path }) });
}

/** What is still in `within`, the run's worktrees' directory, by path: none when it is gone. */
function strays(within: string): string[] {
  try {
    return fs.readdirSync(within).map((name) => path.join(within, name));
  } catch {
    return [];
  }
}

/**
 * Delete the repository run's branches, as asked (`branchFates`): those its place's inventory read under `wf/<id>/`, merged into the run's
 * base branch as it read them — never one `handedOff` just committed onto, which the base has not — or forced, through the place's
 * `remove`. One git refuses to delete is kept, in git's words; all of them, when the `remove` does not answer.
 */
function deleteBranches(run: RepositoryRun, how: ForgetHow, place: RunPlaceRead, handedOff: Forgot['handedOff']): BranchFate[] {
  const read = place.inventory.branches;
  const handedOnto = new Set(handedOff.map((h) => h.branch));
  const merged = (branch: string): boolean => !handedOnto.has(branch) && read.some((b) => b.branch === branch && b.merged);
  const fates = branchFates(
    run,
    read.map((b) => b.branch),
    merged,
    how,
  );
  const doomed = fates.filter((b) => b.deleted).map((b) => b.branch);
  if (!doomed.length) return fates;
  const outcome = runPlaceVerb(place.dir, 'remove', { repo: run.repo, workspaces: [], branches: doomed });
  const kept = new Map<string, BranchFate['why']>(
    'answer' in outcome
      ? outcome.answer.kept.map((k) => [k.branch, { git: k.said }])
      : doomed.map((branch) => [branch, { unread: unansweredWords(outcome) }]),
  );
  return fates.map((b): BranchFate => {
    const why = kept.get(b.branch);
    return b.deleted && why ? { branch: b.branch, deleted: false, why } : b;
  });
}

/**
 * Remove what is under `WF_ROOT` keyed by a run's id, and answer with each path removed, from `WF_ROOT`: what the run store keeps under it
 * first (`runStore.runs.forget`: its record, cancellation, pruning, hold, asks and own directory of inputs and artifacts), its check
 * logs (`checkLogsOf`, by the steps `names`, or without them any under its id that is no other stored run's), and `worktrees/<id>` once
 * it is empty. Nothing else, and never the engine's, which `forgetTasks` asks the engine to forget.
 */
function removeKeyed(id: string, names: readonly string[] | undefined): string[] {
  const removed = runStore.runs.forget(id);
  const remove = (at: string) => {
    const st = lstatOf(at);
    if (!st) return;
    fs.rmSync(at, { recursive: true, force: true });
    removed.push(`${path.relative(HOME, at)}${st.isDirectory() ? '/' : ''}`);
  };
  const checks = path.join(HOME, 'checks');
  let logs: string[] = [];
  try {
    logs = fs.readdirSync(checks);
  } catch {}
  const otherIds = names ? [] : runStore.runs.ids();
  for (const file of checkLogsOf(id, names, logs, otherIds)) remove(path.join(checks, file));
  try {
    fs.rmdirSync(path.join(HOME, 'worktrees', id));
    removed.push(`worktrees/${id}/`);
  } catch {}
  return removed;
}
