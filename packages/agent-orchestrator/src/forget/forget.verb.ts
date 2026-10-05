/**
 * Forgetting a run that is over (`forgetRun`, `nemia rm`): it reads a run as `cancelRun` does, adopting what a pass filed and never wrote
 * down (`tick/advance.verb.ts`), refuses by name before anything is touched, and removes through git. A controller, reaching the runtime
 * through the client (`runtime-client.ts`): an Effect program that requires the engine as a service (`EngineService`), run with `runWith`.
 * It never stops anything. `nemia rm` closes a task held open that waits for a word, which runs nothing and is settled as it signed: no
 * pass reads the run again to close it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Effect } from 'effect';
import { EngineService, over, tried, type Engine } from '../runtime-client.ts';
import type { Workflow } from '../step/step.ts';
import { isGitRun, namesInOrder, runTasks, type GitRun, type Run } from '../record/record.ts';
import { approvedFirst } from '../status/status.ts';
import {
  branchFates,
  checkLogsOf,
  forgetRefusal,
  heldWorktree,
  idRefusal,
  parseWorktrees,
  runWorktrees,
  type AskName,
  type BranchFate,
  type ForgetHow,
  type GitWorktree,
  type Forgot,
} from './forget.ts';
import { HOME, lstatOf, runsDir, stepsOf } from '../record/record.store.ts';
import { runStore } from '../record/files.store.ts';
import { gitSays, handOff } from '../workspace/worktree.store.ts';
import { standingsOf } from '../branches/branches.store.ts';
import { gitWords, merging, resolved } from '../prune/prune.verb.ts';
import { closeoutAsked, closeoutReader, exitVerdicts, spendReader, taskPhasesRead } from '../views/views.verb.ts';
import { adoptChecks, adoptRounds, adoptTries, closeWaitingTasks, unrecordedSteps } from '../tick/advance.verb.ts';
import { Invalid } from '../refusal/refusal.ts';
import { forgetTasks } from './forgetting.verb.ts';

/** A run's answer when nothing of its worktrees or branches was touched, afresh on each call. */
const nothing = (): Omit<Forgot, 'id' | 'kind'> => ({ removed: [], handedOff: [], gone: [], left: [], branches: [], files: [] });

/** What `nemia rm` is left with once a run's record is read and what a pass filed and never wrote down is adopted onto it. */
type Forgetting = Effect.Success<ReturnType<typeof readForgetting>>;

/** What was done to a git run's worktrees (`removeWorktrees`). */
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
 * and go with its record: no worktree, no branch, and no git asked. A git run goes in an order `nemia rm` can finish when it is interrupted
 * and run again:
 *
 * 1. **Its worktrees, through git**: each git lists inside `worktrees/<id>` (`runWorktrees`), by its real path, so the run's directory and
 *    the record's are read the same way (`resolved`). One whose directory is gone, or is no worktree git can read, and is not locked, is
 *    pruned. What one holds uncommitted is committed first under its step's name, as the hand-off does — a failed or stopped step's work
 *    lives only there — and what git ignores is not work. Then `git worktree remove`, never with `--force`, and `git worktree prune`. A
 *    worktree git will not remove — locked, still dirty, on no branch with something a removal would leave on none (`heldWorktree`), or
 *    whose hand-off git refuses — is left as it is, and said why; so is a directory in `worktrees/<id>` git does not know. Then the run is
 *    `held`, and nothing else is removed, so its record is there for `nemia rm` to find it by once a person has dealt with them.
 * 2. **Its branches**, as asked (`branchFates`): kept by default; deleted merged into the run's base branch, as git says it, or forced.
 * 3. **Its record, then every file under `WF_ROOT` keyed by its id** (`removeKeyed`): the record first, so the run is never read without
 *    the cancellation it had. A pass halfway through the run writes nothing back (`rewriteRun`).
 * 4. **Its tasks, through the engine** (`forgetTasks`): every task its record names (`runTasks`, the adopted ones among them) was written
 *    down once nothing refused (`runStore.forgetting`), before anything was removed, and the engine's `forget` removes each settled one's
 *    journal, feed lines and session files. A task just closed has not settled: it waits, with the marker, for the tick to forget it
 *    (`finishForgetting`), or for `nemia rm` again. A run `held` lifts its marker and forgets nothing: it is still listed.
 *
 * A run whose record is gone is normal: what is left under its id, its files, is removed and named — never a worktree, since nothing says
 * whose they are — and its tasks a marker names are forgotten; a run whose worktrees or branches are already gone says so. Refused before anything is read, with exit code 2: an id
 * that is not a name (`idRefusal`). Fails with a refusal a read threw; dies of anything else (`tried`, `awaited`).
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
  const refusal = yield* tried(() => refusalOf(id, f));
  if (refusal) return { ...said, kind: 'refused', refusal, ...nothing() } satisfies Forgot;
  const taskIds = [...new Set(runTasks(run))];
  yield* tried(() => runStore.forgetting.write(id, taskIds));
  yield* closeWaitingTasks(e, run, f.views);
  if (!isGitRun(run)) {
    const files = yield* tried(() => removeKeyed(id, Object.keys(run.steps)));
    return { ...said, folder: true, kind: 'forgotten', ...nothing(), files, engine: yield* forgetTasks(id, taskIds) } satisfies Forgot;
  }
  const worktrees = yield* tried(() => removeWorktrees(run, steps, dir));
  if (worktrees.left.length) {
    yield* tried(() => runStore.forgetting.lift(id));
    return { ...said, kind: 'held', ...worktrees, branches: [], files: [] } satisfies Forgot;
  }
  const branches = yield* tried(() => deleteBranches(id, run, how));
  const files = yield* tried(() => removeKeyed(id, Object.keys(run.steps)));
  return { ...said, kind: 'forgotten', ...worktrees, branches, files, engine: yield* forgetTasks(id, taskIds) } satisfies Forgot;
});

/**
 * A run whose record is gone: what is left under its id removed and named, `worktrees/<id>` named as orphaned, never removed, and the
 * engine's tasks a `nemia rm` cut short or left waiting wrote down (`runStore.forgetting`) forgotten now (`forgetTasks`).
 */
const forgetMissing = Effect.fn('forgetMissing')(function* (id: string, dir: string) {
  const files = yield* tried(() => removeKeyed(id, undefined));
  const left: Forgot['left'] = lstatOf(dir) ? [{ path: dir, orphaned: true }] : [];
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
    return { unfrozen: (err as Error).message };
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

/**
 * Why `nemia rm` will not forget the run `id`, read (`forgetRefusal`), or null: judged against the store's other runs, where its result
 * stands for an ending that has not run, and a merge the ending staged.
 */
function refusalOf(id: string, f: Forgetting): string | null {
  const { run, steps } = f;
  const askAt = (a: AskName) => runStore.asks.where(id, a);
  const others = runStore.runs.list().filter((o) => o.id !== id);
  const standings = steps?.some((s) => approvedFirst(s, run) && !run.steps[s.name]?.taskId) ? standingsOf(run) : [];
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
    merging(run, steps),
  );
}

/**
 * Remove a git run's worktrees through git (`runWorktrees`, `removeWorktree`), then prune git's list, and answer what was removed, handed
 * off, already gone and left — a directory in `dir` git does not know among what is left (`strays`).
 */
function removeWorktrees(run: GitRun, steps: readonly Workflow[] | undefined, dir: string): Worktrees {
  const within = resolved(dir);
  const recorded = {
    ...run,
    steps: Object.fromEntries(
      Object.entries(run.steps).map(([name, st]) => [name, st.workspace ? { ...st, workspace: resolved(st.workspace) } : st]),
    ),
  };
  const { worktrees, unlisted } = runWorktrees(
    recorded,
    namesInOrder(run, steps ?? []),
    within,
    parseWorktrees(gitSays(run.repo, 'worktree', 'list', '--porcelain') ?? ''),
  );
  const done: Worktrees = { removed: [], handedOff: [], gone: unlisted.filter((p) => !lstatOf(p)), left: [] };
  for (const w of worktrees) removeWorktree(run, w, done);
  if (worktrees.length) gitSays(run.repo, 'worktree', 'prune');
  for (const at of strays(within)) if (!done.left.some((l) => l.path === at)) done.left.push({ path: at, unknown: true });
  return done;
}

/**
 * Remove one of a git run's worktrees, adding to `done`: one git can prune and nobody locked is gone, or pruned; one held
 * (`heldWorktree`), or whose hand-off git refuses, is left, as is one `git worktree remove` refuses; otherwise what it holds uncommitted is
 * handed off first, then it is removed.
 */
function removeWorktree(run: GitRun, w: GitWorktree & { step: string }, done: Worktrees): void {
  if (w.prunable && w.locked === undefined) {
    if (!lstatOf(w.path)) done.gone.push(w.path);
    return;
  }
  const hold = heldWorktree(w, onNoBranch(run, w));
  if (hold) {
    done.left.push({ path: w.path, ...hold });
    return;
  }
  const handed = handOff(w.path, w.step, ', before its run was forgotten');
  if (handed && 'error' in handed) {
    done.left.push({ path: w.path, step: w.step, uncommitted: handed.error });
    return;
  }
  if (handed) done.handedOff.push({ step: w.step, ...(w.branch ? { branch: w.branch } : {}), commit: handed.commit });
  try {
    execFileSync('git', ['worktree', 'remove', w.path], { cwd: run.repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    done.removed.push(w.path);
  } catch (err) {
    done.left.push({ path: w.path, git: gitWords(err) });
  }
}

/** For a worktree on no branch that nobody locked: whether it is clean, and whether its HEAD is on a branch; neither, for any other. */
function onNoBranch(run: GitRun, w: GitWorktree): { clean: boolean; onBranch: boolean } {
  const status = w.detached && w.locked === undefined ? gitSays(w.path, 'status', '--porcelain') : undefined;
  const onBranch =
    w.detached && w.head && w.locked === undefined
      ? Boolean(gitSays(run.repo, 'for-each-ref', '--contains', w.head, '--format=%(refname)', 'refs/heads/')?.trim())
      : false;
  return { clean: status !== undefined && !status.trim(), onBranch };
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
 * Delete the branches of the git run `id`, as asked (`branchFates`): those git has under `wf/<id>/`, merged into the run's base branch
 * as git says it, or forced. One git refuses to delete is kept, in git's words.
 */
function deleteBranches(id: string, run: GitRun, how: ForgetHow): BranchFate[] {
  const listed = (gitSays(run.repo, 'for-each-ref', '--format=%(refname)', `refs/heads/wf/${id}/`) ?? '')
    .split('\n')
    .filter(Boolean)
    .map((ref) => ref.replace(/^refs\/heads\//, ''));
  const merged = (branch: string): boolean => {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', `refs/heads/${branch}`, run.branch], { cwd: run.repo, stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };
  return branchFates(run, listed, merged, how).map((b): BranchFate => {
    if (!b.deleted) return b;
    try {
      execFileSync('git', ['branch', '-D', b.branch], { cwd: run.repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return b;
    } catch (err) {
      return { branch: b.branch, deleted: false, why: { git: gitWords(err) } };
    }
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
  let otherIds: string[] = [];
  try {
    if (!names)
      otherIds = fs
        .readdirSync(runsDir())
        .filter((f) => f.endsWith('.json'))
        .map((f) => path.basename(f, '.json'));
  } catch {}
  for (const file of checkLogsOf(id, names, logs, otherIds)) remove(path.join(checks, file));
  try {
    fs.rmdirSync(path.join(HOME, 'worktrees', id));
    removed.push(`worktrees/${id}/`);
  } catch {}
  return removed;
}
