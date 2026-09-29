/**
 * Forgetting a run that is over (`forget`, `wf rm`), and removing its worktrees alone (`prune`, `wf prune`): each reads a run as `cancel`
 * does, adopting what a pass filed and never wrote down (`tick.ts`), refuses by name before anything is touched, and removes through git. A
 * controller, reaching the runtime through the client (`runtime-client.ts`); neither ever stops anything. `wf rm` closes a task held open
 * that waits for a word, which runs nothing and is settled as it signed: no pass reads the run again to close it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine } from './runtime-client.ts';
import type { Workflow } from './step/step.ts';
import {
  approvedFirst,
  branchFates,
  checkLogsOf,
  decision,
  filesPrunedWords,
  forgetRefusal,
  heldWorktree,
  idRefusal,
  isGitRun,
  landsOnCheck,
  namesInOrder,
  parseWorktrees,
  pruneAgain,
  pruneRefusal,
  runWorktrees,
  type AskName,
  type BranchFate,
  type Decision,
  type ForgetHow,
  type Forgot,
  type MergeState,
  type Pruned,
  type Pruning,
  type Run,
} from './run.ts';
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
import { gitSays, handOff, mergeInProgress, mergeState } from './worktree.ts';
import { shippedOf, standingsOf } from './branches.ts';
import { closeoutAsked, closeoutReader, exitVerdicts, harnessBlocked, spendReader, taskPhases } from './views.ts';
import { adoptChecks, adoptRounds, adoptTries, closeWaitingTasks, handOffOwed, resultTips, unrecordedSteps } from './tick.ts';
import { Invalid } from './refusal/refusal.ts';

/** Whose merge is in the repository's checkout, asked of git only for a run whose ending lands on its check (`forgetRefusal`). */
const merging = (run: Run, steps: readonly Workflow[] | undefined): MergeState['merging'] =>
  isGitRun(run) && steps?.some((s) => landsOnCheck(s, run)) && mergeInProgress(run.repo)
    ? mergeState(run.repo, resultTips(run)).merging
    : 'none';

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
 * Remove the worktrees of a run that is over, and nothing else — `wf prune`. Its record, asks, closeouts and costs, its branches, its files
 * directory, its check logs and inputs, and the engine's record of its sessions are kept, so `wf decide`, `wf ls` and the board still read
 * it, and a run waiting on it still reads whether it shipped.
 *
 * With `artifacts` — `wf prune --artifacts` — its files directory too (`runs/<id>/artifacts/`: the screenshots and logs its steps and
 * checks left, which are on no branch), by far the most of what a run keeps once its worktrees are gone. It is judged exactly as the
 * worktrees are, since a run that is not over, or waits on a person, is read off those files; a run whose worktrees are already gone, or
 * never cut, may still give them back. Everything else stays: the record, the asks, the inputs a person gave, the prompts its steps were
 * rendered (`agents/`), the check logs and the engine's journals, each small and each read by `wf decide` or the board — which say the
 * files were removed where they would list them, as the api's file route does (410).
 *
 * Read as `wf rm` reads a run (`forget`), and refused, before anything is touched, for every reason `pruneRefusal` names: a folder run, a
 * run not over, anything that holds `wf rm`, a finished run not merged unless `unmerged`, a hand-off owed, and a worktree that is locked, on
 * no branch with something a removal would leave on none, or holds a change no commit has — or whose status git cannot read. No other run
 * is asked: one waiting on this run reads its record, which stays. A run once pruned is not asked its merge again for its worktrees; for
 * its files it is. A record whose workflow folder is gone is judged without its steps, and `pruneRefusal` says so.
 *
 * The worktrees are the run's as git lists them: a directory already gone is git's to forget (`git worktree prune`), not a removal, and a
 * run with no worktree left answers `nothing`, and says why. A link as the files directory is removed as a link, and read as nothing to
 * give back.
 *
 * Without `yes`, nothing is touched: each worktree and what removing it frees on disk (`diskBytes`: a worktree's `node_modules` is main's
 * files hardlinked, which cost its directories alone while main still holds them, and the blocks of any main has since replaced). With it, the
 * run is marked pruned first (`pruneFile`), its files counted as gone when they are to go, so that a pass or the api reading it while its
 * worktrees go reads it pruned and files nothing (`advance`); then git removes each worktree — never `--force`, so a file that turned up
 * since it was read is git's refusal and not a loss — and `worktrees/<id>` once it is empty; then its files, under `artifacts`, removed
 * and never followed, what would not go said and counted out of what was freed; and the marker is written again with what was removed.
 * The marker's time moves only when a worktree goes. A prune that removed nothing takes the marker back: gone on a run never pruned before,
 * as it was on one that was. The tick never calls this.
 */
export async function prune(
  e: Engine,
  id: string,
  { unmerged = false, yes = false, artifacts = false }: { unmerged?: boolean; yes?: boolean; artifacts?: boolean } = {},
): Promise<Pruning> {
  const refusedId = idRefusal(id, 'prune');
  if (refusedId) throw new Invalid({ message: refusedId });
  const run = readRun(id);
  const none = { worktrees: [], left: [] };
  const folder = pruneRefusal(run, { decided: undefined, held: null, owed: [], worktrees: [] });
  if (!isGitRun(run)) return { id, kind: 'refused', refusal: folder!, ...none };

  const within = resolved(path.join(HOME, 'worktrees', id));
  let steps: Workflow[] | undefined;
  try {
    steps = stepsOf(run);
  } catch {}
  const recorded = {
    ...run,
    steps: Object.fromEntries(
      Object.entries(run.steps).map(([name, st]) => [name, st.workspace ? { ...st, workspace: resolved(st.workspace) } : st]),
    ),
  };
  const listed = runWorktrees(
    recorded,
    namesInOrder(run, steps ?? []),
    within,
    parseWorktrees(gitSays(run.repo, 'worktree', 'list', '--porcelain') ?? ''),
  ).worktrees.filter((w) => !(w.prunable && w.locked === undefined));
  const filesDir = path.join(runsDir(), id, 'artifacts');
  const files = artifacts && lstatOf(filesDir)?.isDirectory() ? filesDir : undefined;
  if (!listed.length && !files) {
    const worktrees =
      run.pruned?.worktrees.length || (run.pruned && !run.pruned.artifacts)
        ? `its worktrees were removed at ${run.pruned.at || 'a time its marker no longer says'} (wf prune)`
        : !run.isolate
          ? `it cut no worktree — it worked in ${run.repo} itself`
          : 'no worktree of it is left';
    const nothing = !artifacts
      ? worktrees
      : `${worktrees}, and ${run.pruned?.artifacts ? filesPrunedWords(run.pruned.artifacts) : 'it has no files'}`;
    if (yes && run.pruned) gitSays(run.repo, 'worktree', 'prune');
    return { id, kind: 'nothing', nothing, ...none };
  }

  const { views, phaseOf } = await taskPhases(e, run);
  const { asks, rounds } = readAsks(id);
  const reader = closeoutReader(views, run);
  const asked = closeoutAsked(views);
  const verdictOf = exitVerdicts(views, run);
  const spendOf = spendReader(views);
  let decided: Decision['kind'] | undefined;
  let held: string | null = null;
  let owed: string[] = [];
  if (steps) {
    await adoptRounds(e, run, steps, views, phaseOf, reader, asked, rounds, spendOf);
    await adoptTries(e, run, steps, views, phaseOf, reader, asked, verdictOf, asks, spendOf);
    await adoptChecks(e, run, steps, views, phaseOf, reader, asked, spendOf);
    for (const { name, taskId } of await unrecordedSteps(e, run, steps, views, phaseOf, reader, asked, verdictOf, asks, rounds, spendOf)) {
      run.steps[name] = { ...run.steps[name], taskId };
    }
    decided = decision(steps, run, phaseOf, shippedOf(run), reader, asked, verdictOf, asks, rounds, harnessBlocked(views), spendOf).kind;
    const askAt = (a: AskName) => (a.kind === 'retry' ? askFile(id, a.step, a.n) : roundAskFile(id, a.step, a.n));
    const standings = steps.some((s) => approvedFirst(s, run) && !run.steps[s.name]?.taskId) ? standingsOf(run) : [];
    held = forgetRefusal(
      steps,
      run,
      phaseOf,
      [],
      reader,
      asked,
      verdictOf,
      asks,
      rounds,
      spendOf,
      askAt,
      standings,
      'prune',
      merging(run, steps),
      pruneAgain(id, { unmerged, artifacts }),
    );
    owed = handOffOwed(steps, run, phaseOf);
  }
  const facts = listed.map((w) => {
    const status = w.locked === undefined ? gitSays(w.path, 'status', '--porcelain') : undefined;
    const changes = (status ?? '')
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(3));
    const onBranch =
      w.detached && w.head && w.locked === undefined
        ? Boolean(gitSays(run.repo, 'for-each-ref', '--contains', w.head, '--format=%(refname)', 'refs/heads/')?.trim())
        : false;
    const hold = heldWorktree(w, { clean: status !== undefined && !changes.length, onBranch });
    const unread = w.locked === undefined && status === undefined ? ['(git status could not read it)'] : [];
    return { path: w.path, ...hold, ...(changes.length || unread.length ? { changes: [...changes, ...unread] } : {}) };
  });
  const refusal = pruneRefusal(run, { decided, held, owed, worktrees: facts, files: Boolean(files) }, { unmerged, artifacts });
  if (refusal) return { id, kind: 'refused', refusal, ...none };

  const worktrees = listed.map((w) => ({ path: w.path, bytes: diskBytes(w.path, path.join(run.repo, 'node_modules')) }));
  const kept = files ? { path: files, bytes: diskBytes(files) } : undefined;
  if (!yes) return { id, kind: 'prunable', worktrees, ...(kept ? { artifacts: kept } : {}), left: [] };

  const now = new Date().toISOString();
  const at = worktrees.length || !run.pruned ? now : run.pruned.at;
  const before = run.pruned?.worktrees ?? [];
  const filesBefore = run.pruned?.artifacts;
  const marker = (removed: Pruned['worktrees'], freed: number | undefined): Pruned => ({
    at,
    worktrees: [...before, ...removed],
    ...(freed !== undefined
      ? { artifacts: { at: now, bytes: (filesBefore?.bytes ?? 0) + freed } }
      : filesBefore
        ? { artifacts: filesBefore }
        : {}),
  });
  fs.writeFileSync(pruneFile(id), JSON.stringify(marker([], kept?.bytes), null, 2));
  const removed: Array<{ path: string; bytes: number }> = [];
  const left: Pruning['left'] = [];
  for (const w of worktrees) {
    try {
      execFileSync('git', ['worktree', 'remove', w.path], { cwd: run.repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      removed.push(w);
    } catch (err) {
      left.push({ path: w.path, git: gitWords(err) });
    }
  }
  gitSays(run.repo, 'worktree', 'prune');
  try {
    fs.rmdirSync(within);
  } catch {}
  let freed: number | undefined;
  if (kept) {
    try {
      fs.rmSync(kept.path, { recursive: true, force: true });
      freed = kept.bytes;
    } catch (err) {
      freed = Math.max(0, kept.bytes - diskBytes(kept.path));
      left.push({ path: kept.path, files: (err as Error).message.split('\n')[0] });
    }
  }
  const filesWent = freed !== undefined && (freed > 0 || !lstatOf(kept!.path));
  if (!removed.length && !filesWent) {
    if (run.pruned) fs.writeFileSync(pruneFile(id), JSON.stringify(run.pruned, null, 2));
    else fs.rmSync(pruneFile(id), { force: true });
  } else {
    fs.writeFileSync(pruneFile(id), JSON.stringify(marker(removed, filesWent ? freed : undefined), null, 2));
  }
  return {
    id,
    kind: 'pruned',
    worktrees: removed,
    ...(filesWent ? { artifacts: { path: kept!.path, bytes: freed! } } : {}),
    left,
    at,
    ...(unmerged ? { unmerged: true as const } : {}),
  };
}

/**
 * What removing a directory frees on disk, in bytes, as `du` counts it: a link as a link, and a file hardlinked from `beside` not at all while
 * `beside` still holds it. `du` counts an inode once per invocation, at the first path it meets it under, so `beside` is named first and the
 * directory's own line is read. A `du` that could not read a path still totals the rest, which is read; zero when `du` says nothing. A run's files directory has no `beside`: what a run collects is copied, not linked.
 */
function diskBytes(dir: string, beside?: string): number {
  const own = (out: string) => {
    const line = out.trimEnd().split('\n').at(-1) ?? '';
    return line.endsWith(`\t${dir}`) ? (Number.parseInt(line, 10) || 0) * 1024 : 0;
  };
  const args = beside && fs.existsSync(beside) ? ['-sk', beside, dir] : ['-sk', dir];
  try {
    return own(execFileSync('du', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (err) {
    return own((err as { stdout?: string }).stdout ?? '');
  }
}

/**
 * A path as git names a worktree: every link on the way followed, as far as the path exists, and the rest as written. A store under a
 * link — a home directory on another disk, or macOS's `/var` in `/private/var` — would otherwise hold no worktree git lists.
 */
function resolved(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    const parent = path.dirname(p);
    return parent === p ? p : path.join(resolved(parent), path.basename(p));
  }
}

/** What git said when it refused, in one line: the first of its stderr, or of the error. */
const gitWords = (err: unknown): string => {
  const { stderr, message } = err as { stderr?: string; message?: string };
  return (stderr?.trim() || message || String(err)).split('\n')[0];
};

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
