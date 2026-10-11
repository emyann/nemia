/**
 * `nemia prune`: remove a run's worktrees alone (`prune`), reading the run as `cancel` does and refusing by name before anything is
 * touched (`judging`), and removing through the place it is given (`freeing`); and what `nemia rm` shares with it — a path as git names a worktree
 * (`resolved`), and whose merge is in the checkout (`merging`). A controller, reaching the runtime through the client
 * (`runtime-client.ts`); it never stops anything.
 */
import fs from 'node:fs';
import path from 'node:path';
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
import { askRunPlace, PlaceService, type RunPlaceRead } from '../place/place.store.ts';
import { freedBytes } from './freed.store.ts';
import { sayFilled, unansweredWords, type Held, type PlaceOutcome } from '../place/place.ts';
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
 * Three parts, which the daemon's sweep of finished runs shares (`freeOnce`): the judgement (`judging`), what the removal frees
 * (`sized`), and the removal (`freeing`). The place is asked off the loop in each (`ask`), so a prune asked of a daemon holds up no pass.
 *
 * Without `yes`, nothing is touched: each worktree and what removing it frees on disk (`freedBytes`). With it, a run with something to
 * remove is freed (`freeing`); one with nothing left that was pruned before has git's list of worktrees pruned, and its empty
 * `worktrees/<id>` taken away.
 */
export const prune = Effect.fn('prune')(function* (
  id: string,
  { unmerged = false, yes = false, artifacts = false }: { unmerged?: boolean; yes?: boolean; artifacts?: boolean } = {},
) {
  const judged = yield* judging(id, { unmerged, artifacts });
  if ('pruning' in judged) {
    if (yes && judged.left) yield* forgetGone(judged.left);
    return judged.pruning;
  }
  const ready = yield* sized(judged.ready);
  const { run, worktrees, files } = ready;
  if (!yes) return { id: run.id, kind: 'prunable', worktrees, ...(files ? { artifacts: files } : {}), left: [] } satisfies Pruning;
  const [pruned] = yield* freeing([ready]);
  return pruned;
});

/** A run `judging` found ready to prune: the run as judged, its place, its folder of worktrees, each worktree listed, and its files. */
export type Ready = {
  readonly run: RepositoryRun;
  readonly place: RunPlaceRead;
  readonly within: string;
  readonly listed: readonly Held[];
  /** The run's files directory, when this prune removes it (`--artifacts`, and one is there). */
  readonly filesAt?: string;
  readonly unmerged: boolean;
};

/** A run ready to prune, with what removing each worktree, and its files directory, frees (`freedBytes`). */
export type Sized = Ready & { readonly worktrees: Pruning['worktrees']; readonly files?: { path: string; bytes: number } };

/** A run with no worktree left that was pruned before: where git's list of its worktrees, and its empty folder, are still to go. */
type Left = { readonly run: RepositoryRun; readonly place: RunPlaceRead; readonly within: string };

/**
 * What `judging` answers: the run ready to prune; or why it is not (`pruning`: refused, or nothing left), with the facts it was refused
 * on (`facts`) where the judgement got as far as reading them, and `left` for a run pruned before with nothing listed.
 */
export type Judged =
  | { readonly ready: Ready; readonly facts: PruneFacts }
  | { readonly pruning: Pruning; readonly facts?: PruneFacts; readonly left?: Left };

/**
 * Judge one run for a prune, touching nothing and sizing nothing. What the run left is read first by its place (`inventory`, through
 * `askRunPlace`): one refused or not heard is no answer, never an empty one, and the prune is refused in those words
 * (`inventoryUnread`).
 *
 * Read as `nemia rm` reads a run (`forget`), and refused for every reason `pruneRefusal` names: a folder run, a run not over, anything
 * that holds `nemia rm`, a finished run not merged unless `unmerged`, a hand-off owed, and a worktree that is locked, on no branch with
 * something a removal would leave on none, or holds a change no commit has — or whose status does not read. No other run is asked: one
 * waiting on this run reads its record, which stays. A run once pruned is not asked its merge again for its worktrees; for its files it
 * is. A record whose workflow folder is gone is judged without its steps, and `pruneRefusal` says so.
 *
 * The worktrees are the run's as its place lists them: a directory already gone is git's to forget (the place's `remove` prunes), not a
 * removal, and a run with no worktree left answers `nothing`, and says why. The run is read off its record here and what a pass filed
 * and never wrote down is adopted onto that copy alone (`judgedOf`): nothing is written.
 */
export const judging = Effect.fn('prune.judging')(function* (
  id: string,
  { unmerged = false, artifacts = false }: { unmerged?: boolean; artifacts?: boolean } = {},
) {
  const e = yield* EngineService;
  const refusedId = idRefusal(id, 'prune');
  if (refusedId) throw new Invalid({ message: refusedId });
  const run = runStore.runs.read(id);
  const refused = (refusal: string, facts?: PruneFacts): Judged => ({
    pruning: { id, kind: 'refused', refusal, worktrees: [], left: [] },
    ...(facts ? { facts } : {}),
  });
  const folder = pruneRefusal(run, { decided: undefined, held: null, owed: [], worktrees: [] });
  if (!isRepositoryRun(run)) return refused(folder!);

  const within = resolved(path.join(HOME, 'worktrees', id));
  const steps = frozenSteps(run);
  const place = yield* askRunPlace(run, yield* PlaceService, within);
  if (!('inventory' in place)) return refused(inventoryUnread('prune', id, run.repo, place));
  const listed = placeWorktrees(run, steps, within, place).filter((w) => !(w.prunable && w.locked === undefined));
  const filesAt = artifacts ? runStore.runs.filesAt(id) : undefined;
  if (!listed.length && !filesAt) {
    return { pruning: nothingLeft(run, artifacts), ...(run.pruned ? { left: { run, place, within } } : {}) } satisfies Judged;
  }

  const judged = yield* judgedOf(e, run, steps, { unmerged, artifacts });
  const facts: PruneFacts = { ...judged, worktrees: listed.map((w) => pruneFact(run, place, w)), files: Boolean(filesAt) };
  const refusal = pruneRefusal(run, facts, { unmerged, artifacts });
  if (refusal) return refused(refusal, facts);
  return { ready: { run, place, within, listed, ...(filesAt ? { filesAt } : {}), unmerged }, facts } satisfies Judged;
});

/**
 * What removing a ready run's worktrees frees, each (`freedBytes`, the run's worktrees as one set: a worktree's `node_modules` is main's
 * files hardlinked, which cost its directories alone while main still holds them, and the blocks of any main has since replaced), and
 * its files directory, alone.
 */
export const sized = Effect.fn('prune.sized')(function* (ready: Ready) {
  const bytes = yield* freedBytes(ready.listed.map((w) => w.path));
  const worktrees = ready.listed.map((w, k) => ({ path: w.path, bytes: bytes[k] }));
  const files = ready.filesAt ? { path: ready.filesAt, bytes: (yield* freedBytes([ready.filesAt]))[0] } : undefined;
  return { ...ready, worktrees, ...(files ? { files } : {}) } satisfies Sized;
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

/** Why a run with no worktree left — nor, under `--artifacts`, a files directory — has nothing to prune. */
function nothingLeft(run: RepositoryRun, artifacts: boolean): Pruning {
  const worktrees =
    run.pruned?.worktrees.length || (run.pruned && !run.pruned.artifacts)
      ? `its worktrees were removed at ${run.pruned.at || 'a time its marker no longer says'} (nemia prune)`
      : !run.isolate
        ? `it cut no worktree — it worked in ${run.repo} itself`
        : 'no worktree of it is left';
  const nothing = !artifacts
    ? worktrees
    : `${worktrees}, and ${run.pruned?.artifacts ? filesPrunedWords(run.pruned.artifacts) : 'it has no files'}`;
  return { id: run.id, kind: 'nothing', nothing, worktrees: [], left: [] };
}

/**
 * What is left of a run pruned before with no worktree listed: the place's `remove` of nothing, which prunes git's list of worktrees
 * whose directory is gone, and its folder of worktrees, once empty.
 */
const forgetGone = ({ run, place, within }: Left): Effect.Effect<void> =>
  place.place.ask('remove', { repo: run.repo, workspaces: [], branches: [] }).pipe(Effect.andThen(Effect.sync(() => dropEmpty(within))));

/** Remove the folder `within` when nothing is in it; one that holds anything, or is gone, is left as it is. */
export function dropEmpty(within: string): void {
  try {
    fs.rmdirSync(within);
  } catch {}
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

/** The marker a prune of `run` writes at `now`: with the worktrees `removed` after those gone before, and its files' bytes `freed`. */
function markerOf(run: RepositoryRun, worktrees: readonly unknown[], now: string) {
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
  return { at, marker };
}

/**
 * Prune runs of one repository, each judged ready and sized: each marked pruned first (`runStore.runs.prune`), its files counted as
 * gone when they are to go, so that a pass or the api reading it while its worktrees go reads it pruned and files nothing (`advance`);
 * then one `remove` asked of the place with every worktree of every run — never forced, so a file that turned up since it was read is
 * git's refusal and not a loss — which prunes git's list once; then, a run at a time, `worktrees/<id>` once it is empty, its files under
 * `--artifacts`, removed and never followed, what would not go said and counted out of what was freed, and the marker written again
 * with what was removed. The marker's time moves only when a worktree goes. A prune that removed nothing takes the marker back: gone on
 * a run never pruned before, as it was on one that was.
 *
 * @param ready The runs to prune, all of one repository and one place: the first's are asked.
 * @returns What was done with each, in the order given.
 */
export const freeing = Effect.fn('prune.freeing')(function* (ready: readonly Sized[]) {
  if (!ready.length) return [];
  const now = new Date().toISOString();
  const marked = ready.map((r) => ({ ...r, ...markerOf(r.run, r.worktrees, now) }));
  for (const r of marked) runStore.runs.prune(r.run.id, r.marker([], r.files?.bytes));
  const [{ run, place }] = ready;
  const outcome = yield* place.place.ask('remove', {
    repo: run.repo,
    workspaces: ready.flatMap((r) => r.worktrees.map((w) => w.path)),
    branches: [],
  });
  return yield* Effect.forEach(marked, (r) => finished(r, outcome));
});

/**
 * One marked run after the place's `remove` answered `outcome`: its folder of worktrees once empty, its files under `--artifacts`, and
 * its marker written again with what went, or taken back when nothing did.
 */
const finished = Effect.fnUntraced(function* (r: Sized & ReturnType<typeof markerOf>, outcome: PlaceOutcome<'remove'>) {
  const { removed, left } = removedOf(r, outcome);
  dropEmpty(r.within);
  const files = r.files ? yield* removeFiles(r.run.id, r.files) : undefined;
  if (files?.left) left.push(files.left);
  const filesWent = files !== undefined && (files.freed > 0 || !files.left);
  runStore.runs.prune(r.run.id, !removed.length && !filesWent ? r.run.pruned : r.marker(removed, filesWent ? files.freed : undefined));
  const done: Pruning = {
    id: r.run.id,
    kind: 'pruned',
    worktrees: removed,
    ...(filesWent ? { artifacts: { path: r.files!.path, bytes: files.freed } } : {}),
    left,
    at: r.at,
    ...(r.unmerged ? { unmerged: true as const } : {}),
  };
  return done;
});

/**
 * What the place's `remove` did with one run's worktrees: those it removed, and those it left, in git's words, or every one, when it did
 * not answer.
 */
function removedOf(
  { place, worktrees }: Sized,
  outcome: PlaceOutcome<'remove'>,
): Pick<Pruning, 'left'> & { removed: Pruning['worktrees'] } {
  if (!('answer' in outcome)) {
    const said = unansweredWords(outcome);
    return { removed: [], left: worktrees.map((w) => ({ path: w.path, unread: said })) };
  }
  const gone = new Set(outcome.answer.removed);
  const own = new Set(worktrees.map((w) => w.path));
  return {
    removed: worktrees.filter((w) => gone.has(w.path)),
    left: outcome.answer.left
      .filter((l) => own.has(l.path))
      .map((l) => ({ path: l.path, git: l.said, fix: sayFilled(place.say.inspect, { path: l.path }) })),
  };
}

/** Remove the run's files directory, and answer what it freed, and what would not go when not all of it did. */
const removeFiles = Effect.fnUntraced(function* (id: string, kept: { path: string; bytes: number }) {
  const why = runStore.runs.dropFiles(id);
  if (why === null) return { freed: kept.bytes };
  const still = (yield* freedBytes([kept.path]))[0];
  return { freed: Math.max(0, kept.bytes - still), left: { path: kept.path, files: why } satisfies Pruning['left'][number] };
});

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
