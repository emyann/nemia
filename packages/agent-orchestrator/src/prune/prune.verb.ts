/**
 * `nemia prune`: remove a run's worktrees alone (`prune`), reading the run as `cancel` does and refusing by name before anything is
 * touched (`judging`), and removing through the place it is given (`freeing`); many runs at once, judged side by side
 * (`judgingMany`) and removed a few runs a turn with one removal a repository (`freeingMany`, `freedByRepo`); and what `nemia rm`
 * shares with it — a path as git names a worktree (`resolved`), and whose merge is in the checkout (`merging`). A controller, reaching
 * the runtime through the client (`runtime-client.ts`); it never stops anything.
 */
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Cause, Effect, Exit } from 'effect';
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
import { landedOf, standingsOf } from '../branches/branches.store.ts';
import { askCheckoutStatus, checkoutStatus, stagedHere, statusMemo, type StatusMemo } from '../place/landing.store.ts';
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
  if (!readsCheckout(run, steps)) return 'none';
  const read = checkoutStatus(run, memo);
  if ('unread' in read) throw new Conflict({ message: `run ${run.id}: ${read.unread}; read its checkout, ${run.repo}, then try again` });
  return read.merging;
}

/** Whether `merging` asks the place how `run`'s checkout stands: never for a run it answers `none` of without a question. */
function readsCheckout(run: Run, steps: readonly Workflow[] | undefined): run is RepositoryRun {
  if (!isRepositoryRun(run)) return false;
  const landings = (steps ?? []).filter((s) => landsOnCheck(s, run));
  const marked = stagedHere(run);
  if (!landings.length || marked === false) return false;
  return marked !== undefined || landings.some((s) => run.steps[s.name]?.taskId && !run.steps[s.name]?.landed);
}

/**
 * Remove the worktrees of a run that is over, and nothing else — `nemia prune`. Its record, asks, closeouts and costs, its branches, its
 * files directory, its check logs and inputs, and the engine's record of its sessions are kept, so `nemia decide`, `nemia ls` and the board
 * still read it, and a run waiting on it still reads whether it landed.
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
  if (!yes) return prunableOf(ready);
  const [pruned] = yield* freeing([ready]);
  return pruned;
});

/** A run ready to prune as a listing says it: each worktree and its files with what removing them frees, nothing touched. */
export const prunableOf = ({ run, worktrees, files }: Sized): Pruning => ({
  id: run.id,
  kind: 'prunable',
  worktrees,
  ...(files ? { artifacts: files } : {}),
  left: [],
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
 * what a pass filed and never wrote down is adopted onto it; none of it, for a run whose workflow does not read. Where `merging` reads
 * the run's checkout, the place is asked first and off the loop (`askCheckoutStatus`), and `merging` answers from that.
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
  const checkout = statusMemo(headsOver(git), placed);
  if (readsCheckout(run, steps)) yield* askCheckoutStatus(run, checkout);
  return {
    decided: decision(steps, run, phaseOf, landedOf(run, git), reader, asked, verdictOf, asks, rounds, harnessBlocked(views), spendOf).kind,
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
      merging(run, steps, checkout),
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

/** A run being pruned, marked: when, the mark its file held before (`base`), and the mark this prune put over it (`mine`). */
type Marked = Sized & { readonly now: string; readonly base: Pruned | undefined; readonly mine: Pruned };

/**
 * Mark `ready` pruned at `now`, before anything of it is removed: over the mark its file holds then, read here and never off the
 * judgement, every worktree that mark lists kept, and its files counted as gone when they are to go. The read and the write are one
 * stretch nothing else of this process runs in.
 */
function marked(ready: Sized, now: string): Marked {
  const base = runStore.runs.pruned(ready.run.id);
  const filesBefore = base?.artifacts;
  const mine: Pruned = {
    at: ready.worktrees.length || !base ? now : base.at,
    worktrees: base?.worktrees ?? [],
    ...(ready.files
      ? { artifacts: { at: now, bytes: (filesBefore?.bytes ?? 0) + ready.files.bytes } }
      : filesBefore
        ? { artifacts: filesBefore }
        : {}),
  };
  runStore.runs.prune(ready.run.id, mine);
  return { ...ready, now, base, mine };
}

/**
 * Write the mark of `r` once its removal is over, on the file as it reads then, in one stretch: the mark without this prune is what
 * the file held before it (`base`) while the file still holds this prune's own, else what another prune wrote since. No worktree
 * that mark lists is dropped. The worktrees `removed` are added, or every worktree this prune listed once none of them stands on disk,
 * whoever removed them and whatever the place answered; the time moves only when this prune removed one; the files' bytes `freed`
 * are added to those gone before. A prune that removed nothing, with a worktree it listed still standing or none listed, leaves the
 * mark as it reads without it (`takenBack`): gone on a run never pruned, as it was on one that was.
 */
function settle(r: Marked, removed: Pruning['worktrees'], freed: number | undefined): void {
  const current = runStore.runs.pruned(r.run.id);
  const untouched = isDeepStrictEqual(current, r.mine);
  const theirs = untouched ? r.base : current;
  const gone = r.worktrees.length > 0 && r.worktrees.every((w) => !fs.existsSync(w.path));
  const went = gone ? r.worktrees : removed;
  const at = removed.length ? r.now : (theirs?.at ?? r.now);
  if (went.length || freed !== undefined) runStore.runs.prune(r.run.id, markWith(theirs, went, freed, at, r.now));
  else if (untouched) runStore.runs.prune(r.run.id, takenBack(r));
}

/**
 * The mark a prune that removed nothing puts back over its own: the one the file held before it, unless that one lists no worktree
 * and no files while this prune listed worktrees, which stand. Such a mark is another prune's own, put there before its removal, and
 * says nothing went: restored, it would leave a run nothing was removed from reading pruned once both prunes are over.
 */
function takenBack(r: Marked): Pruned | undefined {
  const empty = r.base !== undefined && !r.base.worktrees.length && !r.base.artifacts;
  return empty && r.worktrees.length > 0 ? undefined : r.base;
}

/** The mark `theirs` at `at`, with the worktrees `went` it does not list yet, and the files' bytes `freed` at `now` over those before. */
function markWith(theirs: Pruned | undefined, went: Pruning['worktrees'], freed: number | undefined, at: string, now: string): Pruned {
  const before = theirs?.worktrees ?? [];
  const held = new Set(before.map((w) => w.path));
  const files = freed === undefined ? theirs?.artifacts : { at: now, bytes: (theirs?.artifacts?.bytes ?? 0) + freed };
  return { at, worktrees: [...before, ...went.filter((w) => !held.has(w.path))], ...(files ? { artifacts: files } : {}) };
}

/**
 * Prune runs of one repository, each judged ready and sized: each marked pruned first (`marked`), its files counted as gone when they
 * are to go, so that a pass or the api reading it while its worktrees go reads it pruned and files nothing (`advance`); then one
 * `remove` asked of the place with every worktree of every run — never forced, so a file that turned up since it was read is git's
 * refusal and not a loss — which prunes git's list once; then, a run at a time, `worktrees/<id>` once it is empty, its files under
 * `--artifacts`, removed and never followed, what would not go said and counted out of what was freed, and the mark written again
 * with what was removed (`settle`), on the file as it reads then: a prune of the same run by another process meanwhile loses no
 * worktree of its mark to this one.
 *
 * @param ready The runs to prune, all of one repository and one place: the first's are asked.
 * @returns What was done with each, in the order given.
 */
export const freeing = Effect.fn('prune.freeing')(function* (ready: readonly Sized[]) {
  if (!ready.length) return [];
  const now = new Date().toISOString();
  const all = ready.map((r) => marked(r, now));
  const [{ run, place }] = ready;
  const outcome = yield* place.place.ask('remove', {
    repo: run.repo,
    workspaces: ready.flatMap((r) => r.worktrees.map((w) => w.path)),
    branches: [],
  });
  return yield* Effect.forEach(all, (r) => finished(r, outcome));
});

/**
 * One marked run after the place's `remove` answered `outcome`: its folder of worktrees once empty, its files under `--artifacts`, and
 * its mark written again with what went, or taken back when nothing did (`settle`).
 */
const finished = Effect.fnUntraced(function* (r: Marked, outcome: PlaceOutcome<'remove'>) {
  const { removed, left } = removedOf(r, outcome);
  dropEmpty(r.within);
  const files = r.files ? yield* removeFiles(r.run.id, r.files) : undefined;
  if (files?.left) left.push(files.left);
  const filesWent = files !== undefined && (files.freed > 0 || !files.left);
  settle(r, removed, filesWent ? files.freed : undefined);
  const done: Pruning = {
    id: r.run.id,
    kind: 'pruned',
    worktrees: removed,
    ...(filesWent ? { artifacts: { path: r.files!.path, bytes: files.freed } } : {}),
    left,
    at: r.mine.at,
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

/** The most runs `nemia prune` judges at once, and the most one turn of its removal carries: the daemon's sweep takes as many. */
export const PRUNE_A_TURN = 4;

/**
 * One run of many as its judgement answered: what a listing says of it (`pruning`), with the run sized when it is ready (`ready`); or
 * what the judgement failed with (`failed`), a refusal or anything else, as it was thrown.
 */
export type Listed =
  | { readonly id: string; readonly pruning: Pruning; readonly ready?: Sized }
  | { readonly id: string; readonly failed: unknown };

/** One run of many after its turn: what its removal did, or what its judgement says now; or what either failed with. */
export type Turned = { readonly id: string; readonly pruning: Pruning } | { readonly id: string; readonly failed: unknown };

/** A run of many as `listedOne` answers it: with what is left of one pruned before with nothing listed (`left`), still to forget. */
type ListedOne = Listed & { readonly left?: Left };

/** One run judged and, when ready, sized, a failure of either caught as its own answer; nothing is touched. */
const listedOne = Effect.fnUntraced(function* (id: string, flags: { unmerged?: boolean; artifacts?: boolean }) {
  const exit = yield* Effect.exit(
    Effect.gen(function* () {
      const judged = yield* judging(id, flags);
      if ('ready' in judged) {
        const ready = yield* sized(judged.ready);
        return { id, pruning: prunableOf(ready), ready } satisfies ListedOne;
      }
      return { id, pruning: judged.pruning, ...(judged.left ? { left: judged.left } : {}) } satisfies ListedOne;
    }),
  );
  const listed: ListedOne = Exit.isSuccess(exit) ? exit.value : { id, failed: Cause.squash(exit.cause) };
  return listed;
});

/**
 * Judge many runs for a prune, touching nothing: each as `judging` judges one and sized when ready (`sized`), `PRUNE_A_TURN` of them
 * side by side. A run whose judgement fails costs its own answer alone.
 *
 * @param ids The runs, by id.
 * @returns One answer a run, in the order of `ids` whatever order they ended in.
 */
export const judgingMany = Effect.fn('prune.judgingMany')(function* (
  ids: readonly string[],
  flags: { unmerged?: boolean; artifacts?: boolean } = {},
) {
  return yield* Effect.forEach(ids, (id) => listedOne(id, flags), { concurrency: PRUNE_A_TURN });
});

/**
 * Runs judged ready, removed by one `remove` a repository (`freeing`), `bound` repositories side by side: the runs are grouped by
 * their repository, in the order each is first met.
 *
 * @returns Each group with how its removal ended: what was done with each of its runs, in the group's order, or why it failed.
 */
export const freedByRepo = Effect.fn('prune.freedByRepo')(function* (ready: readonly Sized[], bound: number) {
  const byRepo = new Map<string, Sized[]>();
  for (const r of ready) byRepo.set(r.run.repo, [...(byRepo.get(r.run.repo) ?? []), r]);
  return yield* Effect.forEach([...byRepo.values()], (group) => Effect.exit(freeing(group)).pipe(Effect.map((exit) => ({ group, exit }))), {
    concurrency: bound,
  });
});

/**
 * What is left of the runs of one turn that were pruned before with nothing listed (`forgetGone`), one at a time: git's list is asked
 * pruned once a repository, and not at all in a repository of `asked`, where the turn's own `remove` pruned it; then each run's
 * folder of worktrees goes, once empty.
 */
const forgottenGone = Effect.fnUntraced(function* (lefts: readonly Left[], asked: ReadonlySet<string>) {
  const pruned = new Set(asked);
  for (const left of lefts) {
    if (pruned.has(left.run.repo)) dropEmpty(left.within);
    else yield* forgetGone(left);
    pruned.add(left.run.repo);
  }
});

/**
 * One turn of `freeingMany`: its runs judged again, side by side, unless `yes`; those ready removed by one `remove` a repository
 * (`freedByRepo`); what is left of those pruned meanwhile forgotten after it (`forgottenGone`); and what was done with each, in the
 * turn's order.
 */
const turned = Effect.fnUntraced(function* (
  turn: readonly ListedOne[],
  { yes, ...flags }: { unmerged: boolean; artifacts: boolean; yes: boolean },
) {
  const judged = yes ? turn : yield* Effect.forEach(turn, (l) => listedOne(l.id, flags), { concurrency: PRUNE_A_TURN });
  const groups = yield* freedByRepo(
    judged.flatMap((l) => ('ready' in l && l.ready ? [l.ready] : [])),
    PRUNE_A_TURN,
  );
  yield* forgottenGone(
    judged.flatMap((l) => ('left' in l && l.left ? [l.left] : [])),
    new Set(groups.map(({ group }) => group[0].run.repo)),
  );
  const done = new Map<string, Turned>();
  for (const { group, exit } of groups) {
    group.forEach((r, k) => {
      const id = r.run.id;
      done.set(id, Exit.isSuccess(exit) ? { id, pruning: exit.value[k] } : { id, failed: Cause.squash(exit.cause) });
    });
  }
  return judged.map((l): Turned => done.get(l.id) ?? ('failed' in l ? l : { id: l.id, pruning: l.pruning }));
});

/**
 * Remove the runs a listing found ready (`judgingMany`), in turns of `PRUNE_A_TURN` runs in the listing's order, one turn after
 * another, so a repository's removals never run two at once and one `remove` carries a few runs' worktrees. Within a turn the runs of
 * one repository go by one `remove` (`freedByRepo`), repositories side by side.
 *
 * With `yes`, the command line's own, each run is removed on the listing's judgement: it is judged once. Without it a person answered
 * a prompt since the listing, so each run of a turn is judged and sized again just before that turn's removal, side by side; one no
 * longer ready answers its refusal, or that nothing is left, and is not removed. What git still lists of a run freed meanwhile is
 * forgotten after the turn's removal, one repository at a time.
 *
 * @param listed What `judgingMany` answered; a run with no `ready` is left alone.
 * @param told Called once a turn, as it ends, with what was done with each of its runs, in the listing's order.
 * @returns What every turn told, in order.
 */
export const freeingMany = Effect.fn('prune.freeingMany')(function* (
  listed: readonly Listed[],
  { unmerged = false, artifacts = false, yes = false }: { unmerged?: boolean; artifacts?: boolean; yes?: boolean } = {},
  told: (turn: readonly Turned[]) => void = () => {},
) {
  const ready = listed.filter((l) => 'ready' in l && l.ready !== undefined);
  const turns = Array.from({ length: Math.ceil(ready.length / PRUNE_A_TURN) }, (_, k) =>
    ready.slice(k * PRUNE_A_TURN, (k + 1) * PRUNE_A_TURN),
  );
  const said = yield* Effect.forEach(
    turns,
    (turn) => turned(turn, { unmerged, artifacts, yes }).pipe(Effect.tap((done) => Effect.sync(() => told(done)))),
    { concurrency: 1 },
  );
  return said.flat();
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
