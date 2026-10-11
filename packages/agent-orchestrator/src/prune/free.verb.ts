/**
 * The daemon's retention of worktrees: a run that is finished — shipped, or cancelled — has its worktrees removed with no person's act
 * (`freeOnce`, one sweep; `free`, the loop the daemon forks). It is `nemia prune <id> --yes` with no flag, asked of each finished run:
 * the same judgement (`judging`), sizing (`sized`) and removal (`freeing`), so what a person's prune keeps is kept and what it refuses
 * is refused. A controller: it reads the runs a pass answered and the disk on every sweep, and carries nothing a restart must not lose.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Effect, Exit, type Duration } from 'effect';
import { keepsWorktrees } from '../config/config.store.ts';
import { HOME } from '../record/record.store.ts';
import { dropEmpty, freeing, judging, resolved, sized, type Judged, type Sized } from './prune.verb.ts';
import { freeable, freedLine, freeSaid, freeTurn, pruneLines, type Answered, type Pruning } from './prune.ts';

/** The sweep's pace when it is given none. */
export const FREE_EVERY: Duration.Input = '5 seconds';

/** The most runs one sweep judges, and so frees: a store with many finished runs is freed over as many sweeps as that takes. */
export const FREE_A_SWEEP = 4;

/**
 * What the sweeps of one daemon remember, to order their work and say a thing once, and never to decide: the candidates judged since
 * it started (`judged`), what was last said of each run left (`said`), and how many sweeps there were (`turn`). Lost at a restart, every
 * candidate is judged again and each standing refusal said once more.
 */
export type FreeMemory = { judged: Set<string>; said: Map<string, string>; turn: number };

/** What a daemon's sweeps remember when it starts: nothing. */
export const freshFreeMemory = (): FreeMemory => ({ judged: new Set(), said: new Map(), turn: 0 });

/** What one sweep did: each run it freed, as its prune answered, and each line it said of a run it left. */
export type Freed = { readonly freed: readonly Pruning[]; readonly said: readonly string[] };

/** One candidate judged: ready, with what its removal frees; or left, with what is to be said of it, if anything. */
type Swept = { readonly id: string; readonly ready: Sized } | { readonly id: string; readonly words: string | null };

/** Why a judgement, a sizing or a removal that failed did: its refusal's or its defect's own message, on one line. */
const whyOf = (cause: Cause.Cause<unknown>): string => {
  const err = Cause.squash(cause);
  return (err instanceof Error ? err.message : String(err)).split('\n')[0];
};

/** What is to be said of a run the judgement left: nothing of one with nothing listed, whose empty folder goes; else `freeSaid`. */
function leftWords(id: string, judged: Exclude<Judged, { ready: unknown }>): string | null {
  if (judged.pruning.kind === 'nothing') {
    dropEmpty(resolved(path.join(HOME, 'worktrees', id)));
    return null;
  }
  return freeSaid(judged.facts, judged.pruning.refusal ?? pruneLines(judged.pruning).join(' '));
}

/** One candidate judged as `nemia prune <id>` judges it, and sized when it is ready; a judgement that failed is its words. */
const swept = Effect.fnUntraced(function* (id: string) {
  const exit = yield* Effect.exit(
    Effect.gen(function* () {
      const judged = yield* judging(id);
      const done: Swept = 'ready' in judged ? { id, ready: yield* sized(judged.ready) } : { id, words: leftWords(id, judged) };
      return done;
    }),
  );
  const done: Swept = Exit.isSuccess(exit) ? exit.value : { id, words: whyOf(exit.cause) };
  return done;
});

/** The runs of one repository freed by one `remove` (`freeing`); a removal that failed leaves each as it was, in its words. */
const freedTogether = Effect.fnUntraced(function* (ready: readonly Sized[]) {
  const exit = yield* Effect.exit(freeing(ready));
  if (Exit.isSuccess(exit)) return exit.value;
  const why = whyOf(exit.cause);
  return ready.map((r): Pruning => ({ id: r.run.id, kind: 'refused', refusal: why, worktrees: [], left: [] }));
});

/** What is to be said of a run after its removal: nothing when every worktree went, else each line of what was left. */
const afterWords = (p: Pruning): string | null => {
  if (p.kind !== 'pruned') return p.refusal ?? null;
  return p.left.length
    ? pruneLines({ ...p, worktrees: [] })
        .slice(1)
        .join(' ')
    : null;
};

/** The memory without what it holds of a run that is no candidate any more: freed, or no longer finished. */
function forgotten(memory: FreeMemory, candidates: readonly string[]): void {
  const standing = new Set(candidates);
  for (const id of memory.judged) if (!standing.has(id)) memory.judged.delete(id);
  for (const id of memory.said.keys()) if (!standing.has(id)) memory.said.delete(id);
}

/** Each run left said in a warning, unless its words are those last said of it; one with nothing to say is said afresh next time. */
const saidOnce = Effect.fnUntraced(function* (left: ReadonlyArray<{ id: string; words: string | null }>, memory: FreeMemory) {
  const said: string[] = [];
  for (const { id, words } of left) {
    if (words === null) memory.said.delete(id);
    else if (memory.said.get(id) !== words) {
      memory.said.set(id, words);
      const line = `${id}  not freed: ${words}`;
      said.push(line);
      yield* Effect.logWarning(line).pipe(Effect.annotateLogs({ run: id }));
    }
  }
  return said;
});

/**
 * One sweep over what the latest pass answered (`answers`), given what this daemon's sweeps remember (`memory`). Nothing, where the
 * store keeps its worktrees (`keepsWorktrees`). Else:
 *
 * - the candidates are the runs the pass found at rest, succeeded or cancelled (`freeable`), whose folder `worktrees/<id>` is on disk;
 *   no other run is asked anything, of its place or of the engine;
 * - the sweep takes `FREE_A_SWEEP` of them not judged yet, or one already judged in its turn (`freeTurn`);
 * - each is judged as `nemia prune <id>` judges it, with no flag (`judging`), and sized when ready (`sized`), side by side;
 * - those ready are removed by one `remove` a repository (`freeing`), repositories side by side;
 * - each run freed is said (`freedLine`), and a run left is said once while its words stand (`freeSaid`): a locked, detached or
 *   changed worktree, a place that did not answer, a worktree git would not remove.
 *
 * Level-triggered: a run freed has no folder left and is no candidate; one that is not freed is judged again on a later sweep, by what
 * the store and the place say then.
 */
export const freeOnce = Effect.fn('freeOnce')(function* (answers: readonly Answered[], memory: FreeMemory) {
  if (keepsWorktrees()) return { freed: [], said: [] } satisfies Freed;
  const candidates = freeable(answers).filter((id) => fs.existsSync(path.join(HOME, 'worktrees', id)));
  forgotten(memory, candidates);
  const turn = freeTurn(candidates, memory.judged, FREE_A_SWEEP, memory.turn++);
  const judged = yield* Effect.forEach(turn, swept, { concurrency: FREE_A_SWEEP });
  for (const id of turn) memory.judged.add(id);

  const byRepo = new Map<string, Sized[]>();
  for (const j of judged) if ('ready' in j) byRepo.set(j.ready.run.repo, [...(byRepo.get(j.ready.run.repo) ?? []), j.ready]);
  const removed = (yield* Effect.forEach([...byRepo.values()], freedTogether, { concurrency: FREE_A_SWEEP })).flat();

  const freed = removed.filter((p) => p.kind === 'pruned' && p.worktrees.length > 0);
  const left = [...judged.flatMap((j) => ('words' in j ? [j] : [])), ...removed.map((p) => ({ id: p.id, words: afterWords(p) }))];
  for (const p of freed) yield* Effect.logInfo(freedLine(p)).pipe(Effect.annotateLogs({ run: p.id }));
  const said = yield* saidOnce(left, memory);
  yield* Effect.annotateCurrentSpan({ candidates: candidates.length, judged: turn.length, freed: freed.length });
  return { freed, said } satisfies Freed;
});

/**
 * The retention, for as long as the daemon runs: a sweep (`freeOnce`) over what `answers` gives then — the latest pass's runs — and a
 * rest of `every`. A sweep that fails is a warning, said once while its words stand, and the next is tried a rest later.
 */
export const free = (answers: () => readonly Answered[], every: Duration.Input = FREE_EVERY) => {
  const memory = freshFreeMemory();
  let failed: string | undefined;
  const sweep = Effect.suspend(() => freeOnce(answers(), memory)).pipe(
    Effect.andThen(Effect.sync(() => void (failed = undefined))),
    Effect.catchCause((cause) => {
      const why = whyOf(cause);
      if (why === failed) return Effect.void;
      failed = why;
      return Effect.logWarning(`The worktrees of finished runs could not be freed this sweep: ${why}`);
    }),
  );
  return Effect.forever(sweep.pipe(Effect.andThen(Effect.sleep(every))));
};
