/**
 * `wf prune`: remove a run's worktrees alone (`prune`), reading the run as `cancel` does and refusing by name before anything is touched;
 * and the words `wf rm` shares with it — a path as git names a worktree (`resolved`), what git said when it refused (`gitWords`), and whose
 * merge is in the checkout (`merging`). A controller, reaching the runtime through the client (`runtime-client.ts`); it never stops
 * anything.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Engine } from '../runtime-client.ts';
import type { Workflow } from '../step/step.ts';
import type { MergeState } from '../ending/ending.ts';
import { pruneAgain, pruneRefusal, type Pruning } from './prune.ts';
import { filesPrunedWords, isGitRun, namesInOrder, type Pruned, type Run } from '../record/record.ts';
import { approvedFirst, landsOnCheck } from '../status/status.ts';
import { decision, type Decision } from '../decide/decide.ts';
import { forgetRefusal, heldWorktree, idRefusal, parseWorktrees, runWorktrees, type AskName } from '../forget/forget.ts';
import { HOME, lstatOf, runsDir, stepsOf } from '../record/record.store.ts';
import { runStore } from '../record/files.store.ts';
import { gitSays, mergeInProgress, mergeState } from '../workspace/worktree.store.ts';
import { resultTips, shippedOf, standingsOf } from '../branches/branches.store.ts';
import { closeoutAsked, closeoutReader, exitVerdicts, harnessBlocked, spendReader, taskPhases } from '../views/views.verb.ts';
import { adoptChecks, adoptRounds, adoptTries, handOffOwed, unrecordedSteps } from '../tick/advance.verb.ts';
import { Invalid } from '../refusal/refusal.ts';

/** Whose merge is in the repository's checkout, asked of git only for a run whose ending lands on its check (`forgetRefusal`). */
export const merging = (run: Run, steps: readonly Workflow[] | undefined): MergeState['merging'] =>
  isGitRun(run) && steps?.some((s) => landsOnCheck(s, run)) && mergeInProgress(run.repo)
    ? mergeState(run.repo, resultTips(run)).merging
    : 'none';

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
 * run not over, anything that holds `wf rm`, a finished run not merged unless `unmerged`, a hand-off owed, and a worktree that is locked,
 * on no branch with something a removal would leave on none, or holds a change no commit has — or whose status git cannot read. No other
 * run is asked: one waiting on this run reads its record, which stays. A run once pruned is not asked its merge again for its worktrees;
 * for its files it is. A record whose workflow folder is gone is judged without its steps, and `pruneRefusal` says so.
 *
 * The worktrees are the run's as git lists them: a directory already gone is git's to forget (`git worktree prune`), not a removal, and a
 * run with no worktree left answers `nothing`, and says why. A link as the files directory is removed as a link, and read as nothing to
 * give back.
 *
 * Without `yes`, nothing is touched: each worktree and what removing it frees on disk (`diskBytes`: a worktree's `node_modules` is main's
 * files hardlinked, which cost its directories alone while main still holds them, and the blocks of any main has since replaced). With it,
 * the run is marked pruned first (`runStore.runs.prune`), its files counted as gone when they are to go, so that a pass or the api
 * reading it while its worktrees go reads it pruned and files nothing (`advance`); then git removes each worktree — never `--force`, so
 * a file that turned up since it was read is git's refusal and not a loss — and `worktrees/<id>` once it is empty; then its files, under
 * `artifacts`, removed and never followed, what would not go said and counted out of what was freed; and the marker is written again with
 * what was removed. The marker's time moves only when a worktree goes. A prune that removed nothing takes the marker back: gone on a
 * run never pruned before, as it was on one that was. The tick never calls this.
 */
export async function prune(
  e: Engine,
  id: string,
  { unmerged = false, yes = false, artifacts = false }: { unmerged?: boolean; yes?: boolean; artifacts?: boolean } = {},
): Promise<Pruning> {
  const refusedId = idRefusal(id, 'prune');
  if (refusedId) throw new Invalid({ message: refusedId });
  const run = runStore.runs.read(id);
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
  const { asks, rounds } = runStore.asks.read(id);
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
    const askAt = (a: AskName) => runStore.asks.where(id, a);
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
  runStore.runs.prune(id, marker([], kept?.bytes));
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
    runStore.runs.prune(id, run.pruned);
  } else {
    runStore.runs.prune(id, marker(removed, filesWent ? freed : undefined));
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
 * What removing a directory frees on disk, in bytes, as `du` counts it: a link as a link, and a file hardlinked from `beside` not at all
 * while `beside` still holds it. `du` counts an inode once per invocation, at the first path it meets it under, so `beside` is named first
 * and the directory's own line is read. A `du` that could not read a path still totals the rest, which is read; zero when `du` says
 * nothing. A run's files directory has no `beside`: what a run collects is copied, not linked.
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
export function resolved(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    const parent = path.dirname(p);
    return parent === p ? p : path.join(resolved(parent), path.basename(p));
  }
}

/** What git said when it refused, in one line: the first of its stderr, or of the error. */
export const gitWords = (err: unknown): string => {
  const { stderr, message } = err as { stderr?: string; message?: string };
  return (stderr?.trim() || message || String(err)).split('\n')[0];
};
