/**
 * What is left of a spend cap for an attempt that continues a parked job: pure arithmetic over a task's fold, which the engine asks
 * at a spawn and at a parked end, so that `decide` reads no spend (`domain.ts`: usage on an end is a fact `decide` reads none of).
 *
 * The cap is a turn's — the task's `config.budgetUsd`, or what the answer that started a later turn gave for it (`configForTurn`) —
 * and a parked job's continuation is a restart inside its task, the same try for the layer above: it is handed what the parked
 * attempts it continues left of it, never the whole cap again.
 */
import { configForTurn, type HarnessArgs } from '../harness/args.ts';
import { turnOf, type Attempt, type Parked, type Sighting, type State } from './domain.ts';

/**
 * What a session whose cap is `cap` may still spend once it has spent `spent`: the one arithmetic of a cap the runtime hands on, to a
 * holder's take-up of an attached session (`resumedRequest`, `harness/claude/attached.ts`) and to a parked job's continuation
 * (`parkedCapLeft`). The Agent SDK counts `maxBudgetUsd` from its own `query()` alone (`sdk.d.ts:1989-1993`), while a resume's running
 * total carries on its parent's (`sdk.d.ts:6100-6103`), so the cap less the spend so far is the right cap for the next process either
 * way. No cap: none. Spend unknown — no result yet, or one whose totals were zeroed or reset and taken off as nothing — counts nothing,
 * an undercount like a killed process's lost spend, never a double count. At or below nothing where the cap is spent (`capSpent`).
 */
export const capLeft = (cap: number | undefined, spent: number | undefined): number | undefined =>
  cap === undefined ? undefined : cap - (spent ?? 0);

/** Whether `left`, what `capLeft` answers, is a cap spent whole: at or below nothing. No cap is never spent. */
export const capSpent = (left: number | undefined): boolean => left !== undefined && left <= 0;

/** Attempt `attempt`'s turn's cap, and the attempts of that turn before it: what `parkedCapLeft` counts from. */
const turnBefore = (state: State, attempt: number): { cap: number | undefined; before: Attempt[] } => {
  const at = state.attempts.findIndex((a) => a.n === attempt);
  const turn = at === -1 ? state.inputs.length : (state.attempts[at]?.turn ?? 0);
  const cap = configForTurn(state.config, turnOf(state, turn).config)?.budgetUsd;
  const before = (at === -1 ? state.attempts : state.attempts.slice(0, at)).filter((a) => (a.turn ?? 0) === turn);
  return { cap, before };
};

/**
 * The cap attempt `attempt` of `state` is handed (`capLeft`): its turn's `budgetUsd` less the `costUsd` of the parked attempts it
 * continues — the run of attempts just before it, in its turn, each of which ended `parked`, back to the first start that was not a
 * continuation. Only attempts before `attempt` are counted, never its own. An attempt whose cost its runner could not price counts
 * 0. `undefined` where its turn gives no cap; at or below nothing where it is spent (`capSpent`).
 *
 * An attempt is a continuation exactly when the one before it, of the same turn, ended parked: so an attempt not yet started is
 * answered as the next one of the current turn would be.
 */
export const parkedCapLeft = (state: State, attempt: number): number | undefined => {
  const { cap, before } = turnBefore(state, attempt);
  return capLeft(cap, spentParked(before));
};

/** What the run of parked attempts at the end of `attempts` cost, counting an unpriced one as 0. */
const spentParked = (attempts: readonly Attempt[]): number => {
  let spent = 0;
  for (const a of [...attempts].reverse()) {
    if (a.parked === undefined) break;
    spent += a.usage?.costUsd ?? 0;
  }
  return spent;
};

/**
 * The configuration a spawn of attempt `n` of `state` is handed where it continues a parked attempt of its own turn: `config`, the
 * turn's, with its `budgetUsd` what the parked attempts it continues left of it (`parkedCapLeft`); nothing where it continues none, or its
 * turn gives no cap, so the spawn keeps the turn's own.
 */
export const continuedCap = (state: State, n: number, config: HarnessArgs | undefined): { config?: HarnessArgs } => {
  const at = state.attempts.findIndex((a) => a.n === n);
  const before = at > 0 ? state.attempts[at - 1] : undefined;
  const continues = before?.parked !== undefined && (before.turn ?? 0) === (state.attempts[at]?.turn ?? 0);
  const left = continues ? parkedCapLeft(state, n) : undefined;
  return left === undefined ? {} : { config: { ...config, budgetUsd: left } };
};

/**
 * What the end of attempt `n` of `state`, seen `seen`, says of a park: `parked` where its job ended itself under the sessions' drain
 * (`Sighting.parked`), which `decide` continues; but a park that left nothing of its turn's cap — `parkedCapLeft` less the attempt's own
 * cost, an unpriced one counted 0 — is no park, and says `limit: 'budget'` instead, so it settles failed and nothing continues it.
 * Nothing for an end that was no park.
 */
export const parkedEnd = (
  state: State,
  n: number,
  seen: Pick<Sighting, 'parked' | 'usage'> | undefined,
): { parked?: Parked; limit?: 'budget' } => {
  if (seen?.parked === undefined) return {};
  const { cap, before } = turnBefore(state, n);
  return capSpent(capLeft(cap, spentParked(before) + (seen.usage?.costUsd ?? 0))) ? { limit: 'budget' } : { parked: seen.parked };
};
