/**
 * Forgetting a run that is over (`forget`, `wf rm`): it reads a run as `cancel` does, adopting what a pass filed and never wrote down
 * (`tick.ts`), refuses by name before anything is touched, and removes through git. A controller, reaching the runtime through the client
 * (`runtime-client.ts`); it never stops anything. `wf rm` closes a task held open that waits for a word, which runs nothing and is settled as
 * it signed: no pass reads the run again to close it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine } from './runtime-client.ts';
import type { Workflow } from './step/step.ts';
import { isGitRun, namesInOrder } from './record/record.ts';
import { approvedFirst } from './status/status.ts';
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
  type Forgot,
} from './forget/forget.ts';
import {
  HOME,
  askFile,
  asksDir,
  cancelFile,
  holdFile,
  listRuns,
  lstatOf,
  pruneFile,
  readAsks,
  readRun,
  roundAskFile,
  runFile,
  runsDir,
  stepsOf,
} from './record/record.store.ts';
import { gitSays, handOff } from './worktree.ts';
import { standingsOf } from './branches.ts';
import { closeoutAsked, closeoutReader, exitVerdicts, spendReader, taskPhases } from './views.ts';
import { adoptChecks, adoptRounds, adoptTries, closeWaitingTasks, unrecordedSteps } from './tick.ts';
import { Invalid } from './refusal/refusal.ts';

/**
 * Forget a run that is over — `wf rm` — or say why not and touch nothing (`forgetRefusal`). It never stops anything: calling a run off is
 * `cancel`, a decision of its own.
 *
 * Read as `cancel` reads a run: a check, a try, a round or a step a pass filed and never wrote down is adopted in memory, so it is in
 * flight too — on a cancelled run as well, which a pass that read it before the cancel may be filing now. A record with no frozen workflow
 * reads its folder, which may be gone: the run is then judged without its steps (`forgetRefusal`). Where the result stands against the
 * base branch is read only for an ending that has not run: one whose result git already has holds nothing.
 *
 * Once nothing refuses, a task held open that waits for a word is closed, as no pass reads the run again to close it; one the engine
 * refuses to close, answered, settled or stopped since it was read, waits for nothing. A folder run's folders are under its own directory,
 * and go with its record: no worktree, no branch, and no git asked. A git run goes in an order `wf rm` can finish when it is interrupted and
 * run again:
 *
 * 1. **Its worktrees, through git**: each git lists inside `worktrees/<id>` (`runWorktrees`), by its real path, so the run's directory and
 *    the record's are read the same way (`resolved`). One whose directory is gone, or is no worktree git can read, and is not locked, is
 *    pruned. What one holds uncommitted is committed first under its step's name, as the hand-off does — a failed or stopped step's work
 *    lives only there — and what git ignores is not work. Then `git worktree remove`, never with `--force`, and `git worktree prune`. A
 *    worktree git will not remove — locked, still dirty, on no branch with something a removal would leave on none (`heldWorktree`), or
 *    whose hand-off git refuses — is left as it is, and said why; so is a directory in `worktrees/<id>` git does not know. Then the run is
 *    `held`, and nothing else is removed, so its record is there for `wf rm` to find it by once a person has dealt with them.
 * 2. **Its branches**, as asked (`branchFates`): kept by default; deleted merged into the run's base branch, as git says it, or forced.
 * 3. **Its record, then every file under `WF_ROOT` keyed by its id** (`removeKeyed`): the record first, so the run is never read without
 *    the cancellation it had. A pass halfway through the run writes nothing back (`rewriteRun`). The engine's tasks, journal and sessions are
 *    the engine's, and are not touched.
 *
 * A run whose record is gone is normal: what is left under its id, its files, is removed and named — never a worktree, since nothing says
 * whose they are — and a run whose worktrees or branches are already gone says so. Refused before anything is read, with exit code 2: an id
 * that is not a name (`idRefusal`).
 */
export async function forget(e: Engine, id: string, how: ForgetHow = {}): Promise<Forgot> {
  const refusedId = idRefusal(id);
  if (refusedId) throw new Invalid({ message: refusedId });
  const nothing = { removed: [], handedOff: [], gone: [], left: [], branches: [], files: [] };
  const dir = path.join(HOME, 'worktrees', id);
  if (!fs.existsSync(runFile(id))) {
    const files = removeKeyed(id, undefined);
    return { id, kind: 'missing', ...nothing, files, left: lstatOf(dir) ? [{ path: dir, orphaned: true }] : [] };
  }

  const run = readRun(id);
  let steps: Workflow[] | undefined;
  let unfrozen: string | undefined;
  try {
    steps = stepsOf(run);
  } catch (err) {
    unfrozen = (err as Error).message;
  }
  const { views, phaseOf } = await taskPhases(e, run);
  const { asks, rounds } = readAsks(id);
  const reader = closeoutReader(views, run);
  const asked = closeoutAsked(views);
  const verdictOf = exitVerdicts(views, run);
  const spendOf = spendReader(views);
  if (steps) {
    await adoptRounds(e, run, steps, views, phaseOf, reader, asked, rounds, spendOf);
    await adoptTries(e, run, steps, views, phaseOf, reader, asked, verdictOf, asks, spendOf);
    await adoptChecks(e, run, steps, views, phaseOf, reader, asked, spendOf);
    for (const { name, taskId } of await unrecordedSteps(e, run, steps, views, phaseOf, reader, asked, verdictOf, asks, rounds, spendOf)) {
      run.steps[name] = { ...run.steps[name], taskId };
    }
  }
  const askAt = (a: AskName) => (a.kind === 'retry' ? askFile(id, a.step, a.n) : roundAskFile(id, a.step, a.n));
  const others = listRuns().filter((o) => o.id !== id);
  const said = { id, repo: run.repo, base: run.branch, isolate: run.isolate, ...(unfrozen ? { unfrozen } : {}) };
  const standings = steps?.some((s) => approvedFirst(s, run) && !run.steps[s.name]?.taskId) ? standingsOf(run) : [];
  const refusal = forgetRefusal(
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
  if (refusal) return { ...said, kind: 'refused', refusal, ...nothing };
  await closeWaitingTasks(e, run, views);
  if (!isGitRun(run)) return { ...said, folder: true, kind: 'forgotten', ...nothing, files: removeKeyed(id, Object.keys(run.steps)) };

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
  const removed: string[] = [];
  const handedOff: Forgot['handedOff'] = [];
  const gone = unlisted.filter((p) => !lstatOf(p));
  const left: Forgot['left'] = [];
  for (const w of worktrees) {
    if (w.prunable && w.locked === undefined) {
      if (!lstatOf(w.path)) gone.push(w.path);
      continue;
    }
    const status = w.detached && w.locked === undefined ? gitSays(w.path, 'status', '--porcelain') : undefined;
    const onBranch =
      w.detached && w.head && w.locked === undefined
        ? Boolean(gitSays(run.repo, 'for-each-ref', '--contains', w.head, '--format=%(refname)', 'refs/heads/')?.trim())
        : false;
    const hold = heldWorktree(w, { clean: status !== undefined && !status.trim(), onBranch });
    if (hold) {
      left.push({ path: w.path, ...hold });
      continue;
    }
    const handed = handOff(w.path, w.step, ', before its run was forgotten');
    if (handed && 'error' in handed) {
      left.push({ path: w.path, step: w.step, uncommitted: handed.error });
      continue;
    }
    if (handed) handedOff.push({ step: w.step, ...(w.branch ? { branch: w.branch } : {}), commit: handed.commit });
    try {
      execFileSync('git', ['worktree', 'remove', w.path], { cwd: run.repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      removed.push(w.path);
    } catch (err) {
      left.push({ path: w.path, git: gitWords(err) });
    }
  }
  if (worktrees.length) gitSays(run.repo, 'worktree', 'prune');
  let strays: string[] = [];
  try {
    strays = fs.readdirSync(within).map((name) => path.join(within, name));
  } catch {}
  for (const at of strays) if (!left.some((l) => l.path === at)) left.push({ path: at, unknown: true });
  if (left.length) return { ...said, kind: 'held', removed, handedOff, gone, left, branches: [], files: [] };

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
  const branches = branchFates(run, listed, merged, how).map((b): BranchFate => {
    if (!b.deleted) return b;
    try {
      execFileSync('git', ['branch', '-D', b.branch], { cwd: run.repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return b;
    } catch (err) {
      return { branch: b.branch, deleted: false, why: { git: gitWords(err) } };
    }
  });

  return { ...said, kind: 'forgotten', removed, handedOff, gone, left, branches, files: removeKeyed(id, Object.keys(run.steps)) };
}

/**
 * Remove what is under `WF_ROOT` keyed by a run's id, and answer with each path removed, from `WF_ROOT`: its record first, then its
 * cancellation, its pruning, its asks, its own directory (inputs, artifacts), its check logs (`checkLogsOf`, by the steps `names`, or without them any
 * under its id that is no other stored run's), and `worktrees/<id>` once it is empty. Nothing else, and never the engine's.
 */
function removeKeyed(id: string, names: readonly string[] | undefined): string[] {
  const removed: string[] = [];
  const remove = (at: string) => {
    const st = lstatOf(at);
    if (!st) return;
    fs.rmSync(at, { recursive: true, force: true });
    removed.push(`${path.relative(HOME, at)}${st.isDirectory() ? '/' : ''}`);
  };
  for (const at of [runFile(id), cancelFile(id), pruneFile(id), holdFile(id), asksDir(id), path.join(runsDir(), id)]) remove(at);
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
