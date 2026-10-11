/**
 * `nemia prune`: remove a run's worktrees alone (`prune`), reading the run as `cancel` does and refusing by name before anything is
 * touched, and removing through the place it is given; and what `nemia rm` shares with it — a path as git names a worktree
 * (`resolved`), and whose merge is in the checkout (`merging`). A controller, reaching the runtime through the client
 * (`runtime-client.ts`); it never stops anything.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Effect } from 'effect';
import { EngineService, type Engine } from '../runtime-client.ts';
import type { Workflow } from '../step/step.ts';
import type { MergeState } from '../ending/ending.ts';
import { pruneAgain, pruneRefusal, type PruneFacts, type Pruning } from './prune.ts';
import { filesPrunedWords, isRepositoryRun, namesInOrder, type RepositoryRun, type Pruned, type Run } from '../record/record.ts';
import { approvedFirst, landsOnCheck } from '../status/status.ts';
import { decision } from '../decide/decide.ts';
import { forgetRefusal, heldWorktree, idRefusal, inventoryUnread, runWorktrees, type AskName } from '../forget/forget.ts';
import { HOME, stepsOf } from '../record/record.store.ts';
import { runStore } from '../record/files.store.ts';
import { PlaceService, readRunPlace, type RunPlaceRead } from '../place/place.store.ts';
import { sayFilled, unansweredWords, type Held } from '../place/place.ts';
import { shippedOf, standingsOf } from '../branches/branches.store.ts';
import { checkoutStatus, stagedHere, statusMemo, type StatusMemo } from '../place/landing.store.ts';
import { headsOver, standingLive } from '../standing/standing.verb.ts';
import { closeoutAsked, closeoutReader, exitVerdicts, harnessBlocked, spendReader, taskPhasesRead } from '../views/views.verb.ts';
import { adoptChecks, adoptRounds, adoptTries, handOffOwed, unrecordedSteps } from '../tick/advance.verb.ts';
import { Conflict, Invalid } from '../refusal/refusal.ts';

/**
 * Whose merge is in the repository's checkout, for a run whose ending lands on its check (`forgetRefusal`): none where the file its place
 * named at `open` is not there (`stagedHere`), or, for a record that names none, where no such ending is filed and not landed; else as its
 * place's `status` reads it (`checkoutStatus`), through `memo`. Refuses (`Conflict`) a checkout the place did not read, in its words:
 * nothing is removed on a guess.
 */
export function merging(run: Run, steps: readonly Workflow[] | undefined, memo: StatusMemo): MergeState['merging'] {
  if (!isRepositoryRun(run)) return 'none';
  const landings = (steps ?? []).filter((s) => landsOnCheck(s, run));
  const marked = stagedHere(run);
  if (!landings.length || marked === false) return 'none';
  if (marked === undefined && !landings.some((s) => run.steps[s.name]?.taskId && !run.steps[s.name]?.landed)) return 'none';
  const read = checkoutStatus(run, memo);
  if ('unread' in read) throw new Conflict({ message: `run ${run.id}: ${read.unread}; read its checkout, ${run.repo}, then try again` });
  return read.merging;
}

/**
 * Remove the worktrees of a run that is over, and nothing else — `nemia prune`. Its record, asks, closeouts and costs, its branches, its
 * files directory, its check logs and inputs, and the engine's record of its sessions are kept, so `nemia decide`, `nemia ls` and the board
 * still read it, and a run waiting on it still reads whether it shipped.
 *
 * With `artifacts` — `nemia prune --artifacts` — its files directory too (`runs/<id>/artifacts/`: the screenshots and logs its steps and
 * checks left, which are on no branch), by far the most of what a run keeps once its worktrees are gone. It is judged exactly as the
 * worktrees are, since a run that is not over, or waits on a person, is read off those files; a run whose worktrees are already gone, or
 * never cut, may still give them back. Everything else stays: the record, the asks, the inputs a person gave, the prompts its steps were
 * rendered (`agents/`), the check logs and the engine's journals, each small and each read by `nemia decide` or the board — which say the
 * files were removed where they would list them, as the api's file route does (410).
 *
 * What the run left is read first by its place (`inventory`): one refused or not heard is no answer,
 * never an empty one, and the prune is refused in those words (`inventoryUnread`), touching nothing.
 *
 * Read as `nemia rm` reads a run (`forget`), and refused, before anything is touched, for every reason `pruneRefusal` names: a folder run,
 * a run not over, anything that holds `nemia rm`, a finished run not merged unless `unmerged`, a hand-off owed, and a worktree that is
 * locked, on no branch with something a removal would leave on none, or holds a change no commit has — or whose status does not read. No
 * other run is asked: one waiting on this run reads its record, which stays. A run once pruned is not asked its merge again for its
 * worktrees; for its files it is. A record whose workflow folder is gone is judged without its steps, and `pruneRefusal` says so.
 *
 * The worktrees are the run's as its place lists them: a directory already gone is git's to forget (the place's `remove` prunes), not a
 * removal, and a
 * run with no worktree left answers `nothing`, and says why. A link as the files directory is removed as a link, and read as nothing to
 * give back.
 *
 * Without `yes`, nothing is touched: each worktree and what removing it frees on disk (`diskBytes`: a worktree's `node_modules` is main's
 * files hardlinked, which cost its directories alone while main still holds them, and the blocks of any main has since replaced). With it,
 * the run is marked pruned first (`runStore.runs.prune`), its files counted as gone when they are to go, so that a pass or the api reading
 * it while its worktrees go reads it pruned and files nothing (`advance`); then the place's `remove` takes the worktrees — never forced, so
 * a file that turned up since it was read is git's refusal and not a loss — and `worktrees/<id>` once it is empty; then its files, under
 * `artifacts`, removed and never followed, what would not go said and counted out of what was freed; and the marker is written again with
 * what was removed. The marker's time moves only when a worktree goes. A prune that removed nothing takes the marker back: gone on a run
 * never pruned before, as it was on one that was. The tick never calls this.
 */
export const prune = (...args: Parameters<typeof pruning>) => pruning(...args).pipe(Effect.map((p): Pruning => p));

const pruning = Effect.fn('prune')(function* (
  id: string,
  { unmerged = false, yes = false, artifacts = false }: { unmerged?: boolean; yes?: boolean; artifacts?: boolean } = {},
) {
  const e = yield* EngineService;
  const refusedId = idRefusal(id, 'prune');
  if (refusedId) throw new Invalid({ message: refusedId });
  const run = runStore.runs.read(id);
  const none = { worktrees: [], left: [] };
  const folder = pruneRefusal(run, { decided: undefined, held: null, owed: [], worktrees: [] });
  if (!isRepositoryRun(run)) return { id, kind: 'refused', refusal: folder!, ...none } satisfies Pruning;

  const within = resolved(path.join(HOME, 'worktrees', id));
  const steps = frozenSteps(run);
  const place = readRunPlace(run, yield* PlaceService, within);
  if (!('inventory' in place))
    return { id, kind: 'refused', refusal: inventoryUnread('prune', id, run.repo, place), ...none } satisfies Pruning;
  const listed = placeWorktrees(run, steps, within, place).filter((w) => !(w.prunable && w.locked === undefined));
  const files = artifacts ? runStore.runs.filesAt(id) : undefined;
  if (!listed.length && !files) return nothingLeft(run, place, { yes, artifacts });

  const judged = yield* judgedOf(e, run, steps, { unmerged, artifacts });
  const worktreeFacts = listed.map((w) => pruneFact(run, place, w));
  const refusal = pruneRefusal(run, { ...judged, worktrees: worktreeFacts, files: Boolean(files) }, { unmerged, artifacts });
  if (refusal) return { id, kind: 'refused', refusal, ...none } satisfies Pruning;

  const worktrees = listed.map((w) => ({ path: w.path, bytes: diskBytes(w.path, path.join(run.repo, 'node_modules')) }));
  const kept = files ? { path: files, bytes: diskBytes(files) } : undefined;
  if (!yes) return { id, kind: 'prunable', worktrees, ...(kept ? { artifacts: kept } : {}), left: [] } satisfies Pruning;
  return removeAll(run, place, within, worktrees, kept, unmerged);
});

/** A run's frozen steps, or none when its workflow does not read: the run is judged without them. */
function frozenSteps(run: Run): Workflow[] | undefined {
  try {
    return stepsOf(run);
  } catch {
    return undefined;
  }
}

/** The run's worktrees inside `within` as its place's inventory read them (`runWorktrees`), the record's paths read as git names them. */
function placeWorktrees(run: RepositoryRun, steps: readonly Workflow[] | undefined, within: string, place: RunPlaceRead) {
  const recorded = {
    ...run,
    steps: Object.fromEntries(
      Object.entries(run.steps).map(([name, st]) => [name, st.workspace ? { ...st, workspace: resolved(st.workspace) } : st]),
    ),
  };
  return runWorktrees(recorded, namesInOrder(run, steps ?? []), within, place.inventory.workspaces).worktrees;
}

/**
 * Why a run with no worktree left — nor, under `--artifacts`, a files directory — has nothing to prune; with `yes` on a run pruned
 * before, the place's `remove` of nothing, which prunes git's list of worktrees whose directory is gone.
 */
function nothingLeft(run: RepositoryRun, place: RunPlaceRead, { yes, artifacts }: { yes: boolean; artifacts: boolean }): Pruning {
  const worktrees =
    run.pruned?.worktrees.length || (run.pruned && !run.pruned.artifacts)
      ? `its worktrees were removed at ${run.pruned.at || 'a time its marker no longer says'} (nemia prune)`
      : !run.isolate
        ? `it cut no worktree — it worked in ${run.repo} itself`
        : 'no worktree of it is left';
  const nothing = !artifacts
    ? worktrees
    : `${worktrees}, and ${run.pruned?.artifacts ? filesPrunedWords(run.pruned.artifacts) : 'it has no files'}`;
  if (yes && run.pruned) place.place.askNow('remove', { repo: run.repo, workspaces: [], branches: [] });
  return { id: run.id, kind: 'nothing', nothing, worktrees: [], left: [] };
}

/**
 * Whether the run is over, what holds it as `nemia rm` would be held (`forgetRefusal`, worded for prune) and the hand-offs owed, once
 * what a pass filed and never wrote down is adopted onto it; none of it, for a run whose workflow does not read.
 */
const judgedOf = Effect.fn('prune.judged')(function* (
  e: Engine,
  run: RepositoryRun,
  steps: Workflow[] | undefined,
  flags: { unmerged: boolean; artifacts: boolean },
) {
  const judged: Pick<PruneFacts, 'decided' | 'held' | 'owed'> = { decided: undefined, held: null, owed: [] };
  if (!steps) return judged;
  const git = yield* standingLive([run]);
  const placed = yield* PlaceService;
  const { views, phaseOf } = yield* taskPhasesRead(run);
  const { asks, rounds } = runStore.asks.read(run.id);
  const reader = closeoutReader(views, run);
  const asked = closeoutAsked(views);
  const verdictOf = exitVerdicts(views, run);
  const spendOf = spendReader(views);
  yield* adoptRounds(e, run, steps, views, phaseOf, reader, asked, rounds, spendOf);
  yield* adoptTries(e, run, steps, views, phaseOf, reader, asked, verdictOf, asks, spendOf);
  yield* adoptChecks(e, run, steps, views, phaseOf, reader, asked, spendOf);
  for (const { name, taskId } of yield* unrecordedSteps(e, run, steps, views, phaseOf, reader, asked, verdictOf, asks, rounds, spendOf)) {
    run.steps[name] = { ...run.steps[name], taskId };
  }
  const askAt = (a: AskName) => runStore.asks.where(run.id, a);
  const standings = steps.some((s) => approvedFirst(s, run) && !run.steps[s.name]?.taskId) ? standingsOf(run, git) : [];
  return {
    decided: decision(steps, run, phaseOf, shippedOf(run, git), reader, asked, verdictOf, asks, rounds, harnessBlocked(views), spendOf)
      .kind,
    held: forgetRefusal(
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
      merging(run, steps, statusMemo(headsOver(git), placed)),
      pruneAgain(run.id, flags),
    ),
    owed: handOffOwed(steps, run, phaseOf),
  };
});

/**
 * One worktree as `pruneRefusal` judges it, from what the place's inventory read: its hold (`heldWorktree`), each change it holds
 * uncommitted — and that its status did not read, where it is not locked — and the place's command for it (`say`).
 */
function pruneFact(run: RepositoryRun, place: RunPlaceRead, w: Held): PruneFacts['worktrees'][number] {
  const hold = heldWorktree(w);
  const fix = !hold
    ? sayFilled(place.say.inspect, { path: w.path })
    : 'locked' in hold
      ? sayFilled(place.say.unlock, { repo: run.repo, path: w.path })
      : sayFilled(place.say.attach, { path: w.path });
  const unread = w.locked === undefined && w.clean === null ? ['(its status could not be read)'] : [];
  const changes = [...(w.changes ?? []), ...unread];
  return { path: w.path, ...hold, ...(changes.length ? { changes } : {}), fix };
}

/**
 * Prune the run: marked first, its files counted as gone when they are to go; then the place's `remove` of `worktrees`, never forced,
 * which prunes git's list; `within` once empty; the files under `--artifacts`; and the marker written again with what went, or taken
 * back when nothing did.
 */
function removeAll(
  run: RepositoryRun,
  place: RunPlaceRead,
  within: string,
  worktrees: ReadonlyArray<{ path: string; bytes: number }>,
  kept: { path: string; bytes: number } | undefined,
  unmerged: boolean,
): Pruning {
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
  runStore.runs.prune(run.id, marker([], kept?.bytes));
  const { removed, left } = removeWorktrees(run, place, worktrees);
  try {
    fs.rmdirSync(within);
  } catch {}
  const files = kept ? removeFiles(run.id, kept) : undefined;
  if (files?.left) left.push(files.left);
  const filesWent = files !== undefined && (files.freed > 0 || !files.left);
  runStore.runs.prune(run.id, !removed.length && !filesWent ? run.pruned : marker(removed, filesWent ? files.freed : undefined));
  return {
    id: run.id,
    kind: 'pruned',
    worktrees: removed,
    ...(filesWent ? { artifacts: { path: kept!.path, bytes: files.freed } } : {}),
    left,
    at,
    ...(unmerged ? { unmerged: true as const } : {}),
  };
}

/** The place's `remove` of `worktrees`: those it removed, and those it left, in git's words, or every one, when it did not answer. */
function removeWorktrees(run: RepositoryRun, place: RunPlaceRead, worktrees: ReadonlyArray<{ path: string; bytes: number }>) {
  const outcome = place.place.askNow('remove', { repo: run.repo, workspaces: worktrees.map((w) => w.path), branches: [] });
  if (!('answer' in outcome)) {
    const said = unansweredWords(outcome);
    return { removed: [], left: worktrees.map((w): Pruning['left'][number] => ({ path: w.path, unread: said })) };
  }
  const gone = new Set(outcome.answer.removed);
  return {
    removed: worktrees.filter((w) => gone.has(w.path)),
    left: outcome.answer.left.map((l): Pruning['left'][number] => ({
      path: l.path,
      git: l.said,
      fix: sayFilled(place.say.inspect, { path: l.path }),
    })),
  };
}

/** Remove the run's files directory, and answer what it freed, and what would not go when not all of it did. */
function removeFiles(id: string, kept: { path: string; bytes: number }): { freed: number; left?: Pruning['left'][number] } {
  const why = runStore.runs.dropFiles(id);
  if (why === null) return { freed: kept.bytes };
  return { freed: Math.max(0, kept.bytes - diskBytes(kept.path)), left: { path: kept.path, files: why } };
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
