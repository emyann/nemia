/**
 * `nemia factory cost-line set` and `cost-line rm`: the cost line a factory sets for a workflow it offers, and taken back. Written into the
 * factory's own file through the Factory door, whether or not it is made from a template: a factory's cost lines are the person's, never
 * the template's. Served on both sides, typed by their `input`: the api's `putCostLine` and `deleteCostLine` call these handlers.
 */
import { Effect, Schema } from 'effect';
import type { Args, Spec } from '../../command/command.ts';
import type { Command } from '../../command/entry.verb.ts';
import { FactoryDoor, filedFactory } from '../door/factories.store.ts';
import { Invalid, Missing } from '../../refusal/refusal.ts';
import { DEFAULT_NAMESPACE, defaultFactoryRefusal } from '../factory.ts';
import { dollarsOf } from '../../keys/index.ts';
import { dollars } from '../../money/money.ts';
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

const SET_USAGE = '<factory> <workflow> <usd>';
const RM_USAGE = '<factory> <workflow>';

/** The forms of `nemia factory cost-line`, as `nemia factory --help` lists them beside the factory's others. */
export const COST_LINE_FORMS = `nemia factory cost-line set ${SET_USAGE}  (nemia factory cost-line set --help)
nemia factory cost-line rm ${RM_USAGE}`;

/** `nemia factory cost-line set --help`: what a cost line is, what it does and what it does not. */
const COST_LINE_HELP = `${COST_LINE_FORMS}

A cost line is what a run of a workflow may cost before its gate says so, in dollars, set per workflow
the factory offers: nemia factory cost-line set mill build 80. At each gate that sets budgets, the most
the run may cost under its caps — what it has spent, each step at the larger of its cap and its cost —
is read against the line; past it, the gate says so beside the caps, on the board and in nemia decide,
and no rule of auto approves that gate unasked. It cuts nothing: a step's cap still ends its session,
and a rule's under keeps its own amount of what the run has spent.

Kept in the factory's own file (factories/<name>.json, "costLines"), never in a template, and kept by
nemia factory adopt and upgrade. Frozen on a run at its start, so a run in flight keeps the line it
began with: a line set or taken back reaches the runs started after it. nemia factory lists them
under the factory. A workflow with a line is not detached until the line is taken back.

Refused, and nothing written: a workflow the factory does not offer, an amount that is not dollars above
zero, the default factory, a factory not in the store, and a cost-line rm of a workflow with no line.`;

/** The text under `key`, as the spec read it. */
const textOf = (args: Args, key: string): string => (typeof args[key] === 'string' ? args[key] : '');

/** A spec of `nemia factory cost-line <verb>`: the factory, the workflow, and the line where `valued`. */
const specOf = (verb: string, usage: string, valued: boolean): Spec => ({
  positionals: [
    { key: 'factory', takes: 'required', kind: 'name' },
    { key: 'workflow', takes: 'required', kind: 'name' },
    ...(valued ? [{ key: 'usd', takes: 'required', kind: 'text' } as const] : []),
  ],
  flags: [],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory cost-line ${verb} does not take ${arg}${valued ? ', and a line is dollars above zero' : ''}: nemia factory cost-line ${verb} ${usage}. Nothing was changed.`
      : `nemia factory cost-line ${verb} takes one workflow, and ${arg} is one more: nemia factory cost-line ${verb} ${usage}, once per workflow. Nothing was changed.`,
  missing: `nemia factory cost-line ${verb} takes ${usage}. Nothing was changed.`,
  flagFirst: true,
});

/** The command line's amount, refused before anything is read where it is not dollars above zero, in digits. */
const amountCheck = (args: Args): string | null => {
  const usd = args['usd'];
  if (typeof usd !== 'string' || dollarsOf(usd) !== undefined) return null;
  return `a cost line is dollars above zero, in digits, like 80 or 12.50, and ${usd} is not one: nemia factory cost-line set ${textOf(args, 'factory')} ${textOf(args, 'workflow')} <usd>. Nothing was changed.`;
};

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
export const FACTORY_COST_LINE_SET: Command<CostLineSet, CostLineSetInput> = {
  name: 'factory cost-line set',
  usage: SET_USAGE,
  help: [
    'set what a run of a workflow may cost before its gate says so, in dollars:',
    'a gate whose caps pass it is said, and never approved unasked at auto',
  ],
  spec: specOf('set', SET_USAGE, true),
  check: amountCheck,
  manual: COST_LINE_HELP,
  writes: true,
  class: 'ask',
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
  print: ({ file, factory, workflow, usd, replaced }) => [
    `${factory}  cost line ${workflow} ${dollars(usd)}${replaced === null ? '' : ` (was ${dollars(replaced)})`}`,
    `changed: ${file} — runs started from now on are held to it; a run in flight keeps the line it was started with`,
  ],
};

/**
 * `nemia factory cost-line rm`: the cost line of `workflow` taken off `factory`; runs started after have none. Refused before anything is
 * written: the default factory (`Invalid`), a factory not in the store and a workflow with no line (`Missing`).
 */
export const FACTORY_COST_LINE_RM: Command<CostLineRemoved, CostLineRmInput> = {
  name: 'factory cost-line rm',
  usage: RM_USAGE,
  help: ["take a workflow's cost line off a factory"],
  spec: specOf('rm', RM_USAGE, false),
  writes: true,
  class: 'ask',
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
  print: ({ file, factory, workflow }) => [
    `${factory}  cost line ${workflow} removed`,
    `changed: ${file} — a run in flight keeps the line it was started with`,
  ],
};

/** `nemia factory cost-line`'s entries, in the order `nemia`'s help lists them. */
export const FACTORY_COST_LINES: readonly Command[] = [FACTORY_COST_LINE_SET, FACTORY_COST_LINE_RM] as readonly Command[];
