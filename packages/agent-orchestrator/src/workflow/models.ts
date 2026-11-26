/**
 * A model named for a step, judged against the models its harness lists (`modelJudged`): the one judgement an agent's or a step's `model:`,
 * a card's `model:`, `nemia start --model` and `nemia retry --model` are each refused by, each in its own words. Nemia keeps no model fact
 * of its own: the list, its aliases, which models keep `auto` and their effort levels are the harness's, as the daemon last recorded them
 * (`models.store.ts`).
 */
import type { ModelJudgedOf } from '../../contracts/model-listed.contract.ts';

export type { ModelAsk, ModelJudged, ModelListed } from '../../contracts/model-listed.contract.ts';

/**
 * How `model` stands against the list `listed` its harness gave: taken where it is a canonical id the harness lists and keeps the step's
 * mode and effort; an alias, naming the id it resolves to; unlisted; a listed model that drops the step's mode, or that has not the step's
 * effort, naming what it keeps; and unchecked where no list is recorded. Pure.
 * @param model The model named.
 * @param listed The harness's list as recorded, or undefined where none is.
 * @param ask What the step asks of the session beside its model: its mode, its effort, and the harness's word for the auto mode.
 */
export const modelJudged: ModelJudgedOf = (model, listed, ask) => {
  if (listed === undefined) return { kind: 'unchecked' };
  const held = listed.find((m) => m.id === model);
  if (held === undefined) {
    const of = listed.find((m) => m.aliases.includes(model));
    return of === undefined ? { kind: 'unlisted' } : { kind: 'alias', id: of.id };
  }
  if (ask.mode !== undefined && ask.mode === ask.autoMode && held.keepsAuto === false) return { kind: 'mode-dropped', mode: ask.mode };
  if (ask.effort !== undefined && held.efforts !== undefined && !held.efforts.includes(ask.effort))
    return { kind: 'effort-unlisted', efforts: held.efforts };
  return { kind: 'listed' };
};
