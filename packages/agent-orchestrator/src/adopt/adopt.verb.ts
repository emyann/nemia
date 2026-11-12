/**
 * A hand-made factory taken over in place by a template, as the command line asks it: `nemia factory diff <name> --template …` previews
 * the takeover and writes nothing (`adoptPreview`, run by `FACTORY_PLAN` on a factory made from no template), printing the plan's digest;
 * `nemia factory adopt <name> --template … --plan <digest>` writes it (`FACTORY_ADOPT`), refused where the digest is not the plan's now.
 * The takeover stages the render as the factory's base and tree, then gives its file the template: its name, repositories, schedules,
 * instruction, cards, runs and stats stay, and a run in flight keeps the workflow frozen on its record. The daemon writes its status on its
 * next pass. Judged by `adopt.ts`, read and staged by `adopt.store.ts`.
 */
import { Effect } from 'effect';
import { EngineService, tried } from '../runtime-client.ts';
import { informerMemo } from '../rest/informer.verb.ts';
import { runsSummarized } from '../summary/summary.verb.ts';
import { runInFactory, kindOf } from '../run-state/run-state.ts';
import { FACTORY_ADOPT_WORDS } from 'objects';
import type { Args } from '../command/command.ts';
import type { Served } from '../command/entry.verb.ts';
import { Conflict, Invalid } from '../refusal/refusal.ts';
import { FactoryDoor, filedFactory, refuseName } from '../factory/door/factories.store.ts';
import { StoreRoot } from '../config/root.store.ts';
import type { Factory, FactoryTemplate } from '../factory/factory.ts';
import { renderedAt } from '../factory/applied/applied.verb.ts';
import { treeDir } from '../factory/applied/applied.store.ts';
import { sourceGiven } from '../template/door/templates.ts';
import { adopted, adoptPlan, adoptRefusal, templatedAdoptRefusal, type AdoptPlan } from './adopt.ts';
import { adoptionAt, planDigest, stageAdoption } from './adopt.store.ts';

/** The words under `key`, or none. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** The words given under the flag `key` that takes many, in order. */
const manyOf = (args: Args, key: string): string[] => {
  const value = args[key];
  return Array.isArray(value) ? value.map(String) : [];
};

/** An argument of a command line, quoted for a shell where it holds anything but plain characters. */
export const shellArg = (arg: string): string => (/^[\w./:=@+-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`);

/** The line that takes `name` over by the template at `source` with `sets`, carrying the plan's `digest`. */
const adoptLine = (name: string, source: string, sets: readonly string[], digest: string): string =>
  `nemia factory adopt ${[name, '--template', source, ...sets.flatMap((s) => ['--set', s]), '--plan', digest].map(shellArg).join(' ')}`;

/** The line that previews the takeover of `name` by the template at `source` with `sets`. */
export const diffLine = (name: string, source: string, sets: readonly string[]): string =>
  `nemia factory diff ${[name, '--template', source, ...sets.flatMap((s) => ['--set', s])].map(shellArg).join(' ')}`;

/** What a takeover is asked of: the factory as it is, the template's source and `--set` words, and its render. */
type Asked = {
  factory: Factory;
  source: string;
  sets: string[];
  render: Extract<Effect.Success<ReturnType<typeof renderedAt>>, { entries: unknown }>;
};

/**
 * The takeover `args` ask, as `verb` reads it, refused in order before anything is written: the name (`refuseName`, the default
 * factory a `Conflict`); no `--template` (`Invalid`); the factory (`Missing`, naming those there are); one made from a template already
 * (`Conflict`, naming the upgrade); a name no builtin template has (`Missing`, `templatePlace`); and a template that does not render
 * with the `--set` words given (`Invalid`, every problem). A bare `--template` word is a builtin name, anything else a path
 * (`sourceGiven`).
 */
const takeoverAsked = Effect.fn('takeoverAsked')(function* (args: Args, verb: string, notDone: string) {
  const name = textOf(args, 'factory') ?? '';
  yield* tried(() => refuseName(name, 'adopt'));
  const given = textOf(args, 'template');
  if (given === undefined)
    return yield* Effect.fail(
      new Invalid({
        message: `${verb}: ${name} is made from no template, so name the template to take it over with: ${verb} ${name} --template <name|folder|archive> [--set <key>=<value> ...]. ${notDone}`,
      }),
    );
  const factory = yield* filedFactory(name, 'adopt');
  if (factory.template !== undefined)
    return yield* Effect.fail(new Conflict({ message: `${verb}: ${templatedAdoptRefusal(name)} ${notDone}` }));
  const source = sourceGiven(given);
  const sets = manyOf(args, 'sets');
  const render = yield* renderedAt(source, sets);
  if ('problems' in render)
    return yield* Effect.fail(
      new Invalid({
        message: `${verb}: ${source} cannot take ${name} over, with ${render.problems.length} problem${render.problems.length === 1 ? '' : 's'}:\n${render.problems.join('\n')}\n${notDone}`,
      }),
    );
  return { factory, source, sets, render } satisfies Asked;
});

/** What `nemia factory diff` previews of a hand-made factory: the plan, its digest, and the line that takes it over. */
export type AdoptPreview = { kind: 'adopt'; plan: AdoptPlan; digest: string; line: string };

/**
 * `nemia factory diff <name> --template <name|folder|archive> [--set …] [--to <x.y.z>]` on a factory made from no template: what taking it
 * over would change (`adoptPlan`) — its runs those the run list counts waiting or in flight (`kindOf`) — its digest, and the adopt
 * line; nothing written. Run with the store's root given
 * (`StoreRoot`). Refused as `takeoverAsked` refuses, and a `--to`
 * other than the template's version (`Conflict`).
 */
export const adoptPreview = Effect.fn('adoptPreview')(function* (args: Args) {
  const home = yield* StoreRoot;
  const verb = 'nemia factory diff';
  const notDone = 'Nothing was written.';
  const { factory, source, sets, render } = yield* takeoverAsked(args, verb, notDone);
  const to = textOf(args, 'to');
  if (to !== undefined && to !== render.version)
    return yield* Effect.fail(
      new Conflict({
        message: `${verb}: ${source} is at version ${render.version}, not ${to}: a takeover takes the template as it is, so leave --to out, or name a folder or archive at ${to} with --template. ${notDone}`,
      }),
    );
  const read = yield* adoptionAt(home, factory, render, notDone);
  const digest = yield* tried(() => planDigest(home, factory.name, render, source));
  const summaries = yield* runsSummarized(yield* EngineService, {
    home,
    memo: informerMemo(),
    verify: false,
  });
  const open = summaries.filter((r) => runInFactory(factory.name)(r) && kindOf(r) !== 'finished').map((r) => r.id);
  const plan = adoptPlan(factory, read.adoption, open, read.rules);
  return { kind: 'adopt', plan, digest, line: adoptLine(factory.name, source, sets, digest) } satisfies AdoptPreview;
});

/** What `nemia factory adopt` wrote: the factory, its file, the template it is now made from, and the tree it runs from. */
type Adopted = { name: string; file: string; template: FactoryTemplate; tree: string };

/**
 * The takeover `args` ask, written: refused as `takeoverAsked` refuses; then no `--plan` (`Invalid`, naming the preview) and a `--plan`
 * that is not the digest of the plan now (`Conflict`, naming the preview again); then what `adoptRefusal` refuses (`Conflict`). Then the
 * render staged as the base and the tree, and the factory's file given the template (`adopted`), through the Factory door.
 */
const adoptedNow = Effect.fn('adoptedNow')(function* (args: Args) {
  const home = yield* StoreRoot;
  const verb = 'nemia factory adopt';
  const notDone = 'Nothing was taken over.';
  const { factory, source, sets, render } = yield* takeoverAsked(args, verb, notDone);
  const preview = diffLine(factory.name, source, sets);
  const plan = textOf(args, 'plan');
  if (plan === undefined)
    return yield* Effect.fail(
      new Invalid({
        message: `${verb} takes over only a plan a person previewed: ${preview} prints it and its digest, then ${verb} … --plan <digest>. ${notDone}`,
      }),
    );
  const digest = yield* tried(() => planDigest(home, factory.name, render, source));
  if (plan !== digest)
    return yield* Effect.fail(
      new Conflict({
        message: `${verb}: --plan ${plan} is not the plan of ${factory.name}'s takeover now — the factory's file, the template, its version, its parameters or its render changed since it was previewed: preview it again, ${preview}. ${notDone}`,
      }),
    );
  const read = yield* adoptionAt(home, factory, render, notDone);
  const refused = adoptRefusal(factory, read.adoption);
  if (refused !== null) return yield* Effect.fail(new Conflict({ message: `${verb}: ${refused.message} ${notDone}` }));
  yield* tried(() => stageAdoption(home, factory.name, render.entries));
  const template: FactoryTemplate = { source, version: render.version, params: render.params };
  const tree = treeDir(home, factory.name);
  const file = yield* (yield* FactoryDoor).factories.rewrite(adopted(factory, read.adoption.wiring, template, tree));
  return { name: factory.name, file, template, tree } satisfies Adopted;
});

/** `nemia factory adopt`: a hand-made factory taken over in place by the template whose takeover `nemia factory diff` previewed. */
export const FACTORY_ADOPT: Served<Adopted> = {
  ...FACTORY_ADOPT_WORDS,
  handler: (args) => adoptedNow(args),
};
