/**
 * What a pass may skip: the settled tasks whose journals nothing has written to since a pass last folded them.
 *
 * A settled task decides nothing, on any observation and at any clock (`settledQuiet`, `decide`'s first question), and its
 * fold is a pure function of an append-only journal. So a pass that has folded one needs to fold it again only once
 * something is appended — and every append reaches the board's feed (`JournalOps.feed`). The memo keeps a cursor into
 * that feed and, for each settled task, the little a pass still does with it: let the harness go of its finished sessions
 * (`releaseFinished`), which reads the observation and so is asked on every pass. Until 2026-09-25 every pass folded every
 * journal, twice, and with ~200 runs in the store that was about 30 MB read a pass.
 *
 * A cache of a pure function, never a source of truth: it lives as long as the engine that made it (`createEngine`), is
 * never written down, and a fresh engine starts with none and folds everything. A pass without one — the Effect door's,
 * with layers of its own — folds everything as before.
 */
import { Context, Layer, Schema } from 'effect';
import { isDeepStrictEqual } from 'node:util';
import { settledQuiet, type Attempt, type State } from './domain.ts';
import type { Cursor } from './journal.ts';

/** What of a settled task a pass still reads: what `releaseFinished` reads, and nothing else — a brief is not kept. */
export type Releasable = Pick<State, 'taskId' | 'settled' | 'config'> & {
  attempts: Array<Pick<Attempt, 'n' | 'ended' | 'nativeId' | 'usage'>>;
};

export const releasableOf = (state: State): Releasable => ({
  taskId: state.taskId,
  settled: state.settled,
  config: state.config,
  attempts: state.attempts.map(({ n, ended, nativeId, usage }) => ({ n, ended, nativeId, usage })),
});

/**
 * One engine's memo. `cursor` is where the last pass read the feed to, unset until the first pass; `settled` is each
 * settled task folded since, by id. `verify` is the proof's switch: each skipped task is folded again all the same, and a
 * difference fails the pass (`TickMemoDiverged`) — on in the engine's tick tests, off in an engine.
 */
export type TickMemoState = { cursor: Cursor | undefined; settled: Map<string, Releasable>; readonly verify: boolean };

/** The memo a pass skips by, when it has one. None by default: a pass without one folds every task. */
export const TickMemo = Context.Reference<TickMemoState | undefined>('engine/TickMemo', { defaultValue: () => undefined });

/** One memo, made once here: an engine builds this layer once, so every pass it runs shares the one memo. */
export const tickMemoLayer = (options: { verify?: boolean } = {}) =>
  Layer.succeed(TickMemo)({ cursor: undefined, settled: new Map(), verify: options.verify === true });

/** Why a task a pass skipped would have been read otherwise, or `undefined`: the proof `verify` asks of every skip. */
export const divergence = (kept: Releasable, fresh: State, decided: { do: string }): string | undefined =>
  !settledQuiet(fresh) ? `the memo kept it settled (${kept.settled}), and its journal says it is not`
    : decided.do !== 'nothing' ? `the memo kept it as deciding nothing, and it decides \`${decided.do}\``
    : !isDeepStrictEqual(releasableOf(fresh), kept) ? 'its journal has changed since the memo folded it, and the feed did not say so'
    : undefined;

/** A pass whose memo skipped a task its journal says it should not have: the feed missed an append. Only in `verify`. */
export class TickMemoDiverged extends Schema.TaggedError<TickMemoDiverged>()('TickMemoDiverged', {
  taskId: Schema.String,
  message: Schema.String,
}) {}
