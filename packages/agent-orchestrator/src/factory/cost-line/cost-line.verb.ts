/**
 * `nemia factory cost-line set` and `cost-line rm`: the cost line a factory sets for a workflow it offers, and taken back. Written into the
 * factory's own file through the Factory door, whether or not it is made from a template: a factory's cost lines are the person's, never
 * the template's. Served on both sides, typed by their `input`: the api's `putCostLine` and `deleteCostLine` call these handlers.
 */
import { Effect, Schema } from 'effect';
import { FACTORY_COST_LINE_RM_WORDS, FACTORY_COST_LINE_SET_WORDS } from 'objects';
import { tableEntry, type Served } from '../../command/entry.verb.ts';
import { FactoryDoor, filedFactory } from '../door/factories.store.ts';
import { Invalid, Missing } from '../../refusal/refusal.ts';
import { DEFAULT_NAMESPACE, defaultFactoryRefusal } from '../factory.ts';
import { costLineRefusal, unsetCostLineRefusal, withCostLine, withoutCostLine } from './cost-line.ts';

/** What `nemia factory cost-line set` takes: the factory, the workflow by its folder's name, and the line in dollars. */
export const CostLineSetInput = Schema.Struct({
  factory: Schema.String,
  workflow: Schema.String,
  usd: Schema.Union([Schema.Finite, Schema.FiniteFromString]),
});
export type CostLineSetInput = typeof CostLineSetInput.Type;

/** What `nemia factory cost-line rm` takes: the factory, and the workflow whose line is taken back. */
export const CostLineRmInput = Schema.Struct({ factory: Schema.String, workflow: Schema.String });
export type CostLineRmInput = typeof CostLineRmInput.Type;

/** The default factory, refused before anything is read: it offers no workflow of its own and starts no run. */
const notDefault = (factory: string): Effect.Effect<void, Invalid> =>
  factory === DEFAULT_NAMESPACE ? Effect.fail(new Invalid({ message: defaultFactoryRefusal('cost-line') })) : Effect.void;

/** What a set answers: the file written, the factory, the workflow and its line, and the line it replaced, or null. */
export type CostLineSet = { file: string; factory: string; workflow: string; usd: number; replaced: number | null };

/** What an rm answers: the file written, the factory, and the workflow whose line was taken back. */
export type CostLineRemoved = { file: string; factory: string; workflow: string };

/**
 * `nemia factory cost-line set`: the cost line of `workflow` in `factory`, a second of one workflow replacing the first, reaching the runs
 * started after. Refused before anything is written, each `Invalid`: the default factory, a workflow it does not offer and an amount that
 * is not dollars above zero (`costLineRefusal`); and `Missing`, a factory not in the store.
 */
export const FACTORY_COST_LINE_SET: Served<CostLineSet, CostLineSetInput> = {
  ...FACTORY_COST_LINE_SET_WORDS,
  input: CostLineSetInput,
  handler: ({ factory: name, workflow, usd }) =>
    Effect.gen(function* () {
      yield* notDefault(name);
      const door = yield* FactoryDoor;
      const factory = yield* filedFactory(name, 'cost-line');
      const refused = costLineRefusal(factory, workflow, usd);
      if (refused !== undefined) return yield* Effect.fail(new Invalid({ message: refused }));
      const replaced = factory.costLines?.[workflow] ?? null;
      const file = yield* door.factories.rewrite({ ...factory, costLines: withCostLine(factory.costLines, workflow, usd) });
      return { file, factory: name, workflow, usd, replaced };
    }),
};

/**
 * `nemia factory cost-line rm`: the cost line of `workflow` taken off `factory`; runs started after have none. Refused before anything is
 * written: the default factory (`Invalid`), a factory not in the store and a workflow with no line (`Missing`).
 */
export const FACTORY_COST_LINE_RM: Served<CostLineRemoved, CostLineRmInput> = {
  ...FACTORY_COST_LINE_RM_WORDS,
  input: CostLineRmInput,
  handler: ({ factory: name, workflow }) =>
    Effect.gen(function* () {
      yield* notDefault(name);
      const door = yield* FactoryDoor;
      const factory = yield* filedFactory(name, 'cost-line');
      if (factory.costLines?.[workflow] === undefined)
        return yield* Effect.fail(new Missing({ message: unsetCostLineRefusal(factory, workflow) }));
      const { costLines: _gone, ...rest } = factory;
      const left = withoutCostLine(factory.costLines, workflow);
      const file = yield* door.factories.rewrite(left === undefined ? rest : { ...rest, costLines: left });
      return { file, factory: name, workflow };
    }),
};

/** `nemia factory cost-line`'s entries, in the order `nemia`'s help lists them. */
export const FACTORY_COST_LINES: readonly Served[] = [tableEntry(FACTORY_COST_LINE_SET), tableEntry(FACTORY_COST_LINE_RM)];
