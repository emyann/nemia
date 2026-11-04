/**
 * What is left of a spend cap for an attempt that continues a parked job: pure arithmetic over a task's fold, which the engine asks
 * at a spawn and at a parked end, so that `decide` reads no spend (`domain.ts`: usage on an end is a fact `decide` reads none of).
 *
 * The cap is a turn's — the task's `config.budgetUsd`, or what the answer that started a later turn gave for it (`configForTurn`) —
 * and a parked job's continuation is a restart inside its task, the same try for the layer above: it is handed what the parked
 * attempts it continues left of it, never the whole cap again.
 */
import { configForTurn } from '../harness/args.ts';
import { turnOf, type Attempt, type State } from './domain.ts';

/**
 * The cap attempt `attempt` of `state` is handed: its turn's `budgetUsd` less the `costUsd` of the parked attempts it continues —
 * the run of attempts just before it, in its turn, each of which ended `parked`, back to the first start that was not a
 * continuation. Only attempts before `attempt` are counted, never its own. An attempt whose cost its runner could not price
 * counts 0. `undefined` where its turn gives no cap; never below 0, which is a cap spent whole.
 *
 * An attempt is a continuation exactly when the one before it, of the same turn, ended parked: so an attempt not yet started is
 * answered as the next one of the current turn would be.
 */
export const capLeft = (state: State, attempt: number): number | undefined => {
  const at = state.attempts.findIndex((a) => a.n === attempt);
  const turn = at === -1 ? state.inputs.length : (state.attempts[at]?.turn ?? 0);
  const cap = configForTurn(state.config, turnOf(state, turn).config)?.budgetUsd;
  if (cap === undefined) return undefined;
  const before = (at === -1 ? state.attempts : state.attempts.slice(0, at)).filter((a) => (a.turn ?? 0) === turn);
  return Math.max(0, cap - spentParked(before));
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
