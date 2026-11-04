/**
 * A templated factory's upgrade, as the command line asks it: `nemia factory diff` previews the merge of its tree with the template at
 * another version, rendered with the factory's parameters overlaid by each `--set`, and writes nothing (`FACTORY_PLAN`); `nemia factory
 * upgrade` writes the version wanted, the template's source where `--template` names one, and the parameters it rendered with, into the
 * factory's file alone (`FACTORY_UPGRADE`), and the factory controller merges it; `nemia factory resolve`
 * writes the person's choice for one conflict into `resolutions.json` (`FACTORY_RESOLVE`), and the controller merges once each conflict has
 * one. A run in flight keeps the folders frozen on its record.
 */
import fs from 'node:fs';
import path from 'node:path';
import { tried } from '../runtime-client.ts';
import { leftOut, type Args, type Flag, type Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { StoreRoot } from '../config/root.store.ts';
import { readFactory } from '../factory/factory.store.ts';
import { FactoryName } from '../factory/factory.model.ts';
import { FactoryDoor } from '../factories/factories.store.ts';
import { rooted } from '../wiring/wire.verb.ts';
import { templatePlace } from '../templates/templates.store.ts';
import { sourceGiven } from '../templates/templates.ts';
import { Effect } from 'effect';
import type { Factory, FactoryTemplate } from '../factory/factory.ts';
import { renderedAt, renderedOrNot, setsOf, type RenderedAt } from '../applied/applied.verb.ts';
import {
  appliedDir,
  digestOf,
  entriesIn,
  readResolutions,
  readStatus,
  choicesFor,
  resolutionsFile,
  treeDir,
  writeResolutions,
  type Entry,
} from '../applied/applied.store.ts';
import {
  compareVersions,
  compose,
  mergeBaseOf,
  mergeTrees,
  planLines,
  resolveLine,
  switchTrees,
  type Choice,
  type PlanNext,
  type Switched,
  type TreeMerge,
} from './index.ts';
import type { Status } from '../applied/applied.store.ts';
import { adoptPreview, shellArg, type AdoptPreview } from '../adopt/adopt.verb.ts';
import { planDigest } from '../adopt/adopt.store.ts';
import { adoptLines } from '../adopt/adopt.ts';

/** A factory made from a template. */
type Templated = Factory & { template: FactoryTemplate };

/**
 * What an upgrade to `to` is asked of: the factory, the version its base holds where a status names it, the template's source, its
 * render at `to`, and, where the render is of another template than the one the base holds, both by name (a switch, merged with no
 * common base).
 */
type Asked = {
  factory: Templated;
  from: string | undefined;
  to: string;
  source: string;
  render: RenderedAt;
  base: Entry[];
  switched?: Switched;
};

/** The switch an upgrade onto `render` is, from the base the status `status` names, both templates by name; none where it is no switch. */
const switchOf = (status: Status | undefined, render: RenderedAt): Switched | undefined =>
  status?.template !== undefined && mergeBaseOf(status.template, render.name) === 'none'
    ? { from: status.template, to: render.name }
    : undefined;

/** The version a base holds where no status names it, as the plan and the upgrade print it. */
const UNKNOWN = 'a version no status names';

const HERE = { side: 'cli', why: 'a template is a folder on the machine nemia runs on; the board upgrades none' } as const;

/** The words under `key`, or none. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** The `--set` words `args` give, in order. */
const setsGiven = (args: Args): string[] => (Array.isArray(args.sets) ? args.sets.map(String) : []);

/** A version as a template declares it: three numbers, `x.y.z`. */
const VERSION = /^\d+\.\d+\.\d+$/;

/**
 * The templated factory `name`, rendered once: its base, the version it holds where its status names it, and the status. Refused: the
 * factory, one made from no template, one not rendered.
 */
function rendered(
  name: string,
  verb: string,
  notDone: string,
): { factory: Templated; from: string | undefined; base: Entry[]; status: Status | undefined } {
  const factory = readFactory(name, notDone);
  if (factory.template === undefined)
    throw new Invalid({
      message: `${verb}: ${name} is not made from a template, so it has none to upgrade; to put one onto it in place, nemia factory diff ${name} --template <name|folder|archive> previews the takeover, then nemia factory adopt. ${notDone}`,
    });
  const base = entriesIn(appliedDir(name));
  if (!base.length)
    throw new Conflict({
      message: `${verb}: ${name} is not rendered yet, so there is no base to merge with: start the daemon, nemia up, and try again once nemia factory ls shows it applied. ${notDone}`,
    });
  const status = readStatus(name);
  return { factory: factory as Templated, from: status?.version ?? undefined, base, status };
}

/**
 * The template at `source` rendered with `factory`'s parameters: as its file holds them where `sets` is not given, as the controller
 * renders it; else those the template declares overlaid by `sets`, the others dropped (`overlaid`). Refused where it is at another
 * version than `to`, or does not render.
 */
const renderTo = Effect.fn('renderTo')(function* (
  verb: string,
  factory: Templated,
  source: string,
  to: string,
  notDone: string,
  sets?: readonly string[],
) {
  const params = factory.template.params;
  const read = yield* renderedOrNot(sets === undefined ? renderedAt(source, setsOf(params)) : renderedAt(source, sets, params));
  if (read.version !== undefined && read.version !== to)
    return yield* Effect.fail(
      new Conflict({
        message: `${verb}: ${source} is at version ${read.version}, not ${to}: put the template at ${to}, or name a template, folder or archive at ${to} with --template <name|folder|archive>. ${notDone}`,
      }),
    );
  if ('problems' in read)
    return yield* Effect.fail(
      new Invalid({
        message: `${verb}: ${source} does not render ${factory.name} at ${to}, with ${read.problems.length} problem${read.problems.length === 1 ? '' : 's'}; give a parameter the version requires with --set <key>=<value>:\n${read.problems.join('\n')}\n${notDone}`,
      }),
    );
  return read;
});

/**
 * The upgrade of the factory `args` name to `--to`, as `verb` asks it, refused in order before anything is written: the factory, one made
 * from no template (`Invalid`) and one not rendered (`Conflict`); a `--to` that is no `x.y.z` (`Invalid`); a `--template` naming no
 * builtin template (`Missing`, `templatePlace`); a template at another version
 * than `--to` (`Conflict`, naming `--template`); a template that does not render with the factory's parameters overlaid by each
 * `--set` (`Invalid`, a `--set` of a key it declares none of among them); a `--template` while the status names a version but not yet
 * the template the base holds, no upgrade waiting (`Conflict`, naming `nemia up`, whose next pass names it); the version its base holds
 * asked again, the same content or another (`Conflict`); and a downgrade without `--downgrade` where `downgrades` (`Conflict`). A switch
 * onto a template of another name is judged by no version: its numbers are another template's. Where no status names the version its
 * base holds, any `--to` is taken: the controller checks it against the base.
 */
const upgradeAsked = Effect.fn('upgradeAsked')(function* (args: Args, verb: string, notDone: string, downgrades = true) {
  const { factory, from, base, status } = yield* tried(() => rendered(textOf(args, 'factory') ?? '', verb, notDone));
  const to = textOf(args, 'to');
  if (to === undefined || !VERSION.test(to))
    return yield* Effect.fail(
      new Invalid({
        message: `${verb} takes the version to upgrade to, three numbers: ${verb} ${factory.name} --to <x.y.z>. ${notDone}`,
      }),
    );
  const given = textOf(args, 'template');
  const source = given === undefined ? factory.template.source : sourceGiven(given);
  if (given !== undefined) yield* templatePlace(source);
  const render = yield* renderTo(verb, factory, source, to, notDone, setsGiven(args));
  if (given !== undefined && typeof status?.version === 'string' && status.template === undefined && status.upgrade === undefined)
    return yield* Effect.fail(
      new Conflict({
        message: `${verb}: ${factory.name}'s status does not name the template its base was rendered from yet, so whether ${given} is another template, to merge with no common base, cannot be told: start the daemon, nemia up, whose next pass names it, then ${verb} again. ${notDone}`,
      }),
    );
  const switched = switchOf(status, render);
  return yield* tried(() => upgradeChecked({ factory, from, to, source, render, base, switched }, verb, notDone, downgrades, args));
});

/** The upgrade `asked`, refused where it asks the version its base holds again, or a downgrade not asked for (`upgradeAsked`). */
function upgradeChecked(asked: Asked, verb: string, notDone: string, downgrades: boolean, args: Args): Asked {
  const { factory, from, to, render, base } = asked;
  if (asked.switched !== undefined) return asked;
  if (to === from)
    throw new Conflict({
      message:
        digestOf(render.entries) === digestOf(base)
          ? `${verb}: ${factory.name} is already applied at ${to}: its base holds the template at ${to}. ${notDone}`
          : `${verb}: ${factory.name} was applied at ${to}, and the template at ${to} now renders other content: a template changed under the same version is no upgrade — give it a new version, then ${verb} ${factory.name} --to <it>. ${notDone}`,
    });
  if (downgrades && from !== undefined && compareVersions(to, from) < 0 && args.downgrade !== true)
    throw new Conflict({
      message: `${verb}: ${to} is below ${from}, the version ${factory.name} was applied at: a downgrade is asked with --downgrade, ${verb} ${factory.name} --to ${to} --downgrade. ${notDone}`,
    });
  return asked;
}

/**
 * What files the upgrade `asked` as `args` give it: the line, the plan's digest, and the parameters it drops. The line carries
 * `--template` where one was given, each `--set`, `--plan` where the upgrade changes the factory's parameters — a `--set` given or a
 * parameter dropped — or is a switch (`planRequired`), and `--downgrade` where it is one of the same template.
 */
function nextOf(home: string, asked: Asked, args: Args): PlanNext {
  const { factory, from, to, source, render } = asked;
  const digest = planDigest(home, factory.name, render, source, asked.switched?.from);
  const words = [
    factory.name,
    '--to',
    to,
    ...(textOf(args, 'template') === undefined ? [] : ['--template', source]),
    ...setsGiven(args).flatMap((set) => ['--set', set]),
    ...(planRequired(asked, args) ? ['--plan', digest] : []),
    ...(asked.switched === undefined && from !== undefined && compareVersions(to, from) < 0 ? ['--downgrade'] : []),
  ];
  return { line: `nemia factory upgrade ${words.map(shellArg).join(' ')}`, digest, dropped: render.dropped };
}

/**
 * Whether the upgrade `asked` as `args` give it changes the factory's parameters, or is a switch, whose every line asks a choice, so is
 * held to its preview's `--plan`.
 */
const planRequired = (asked: Asked, args: Args): boolean =>
  asked.switched !== undefined || setsGiven(args).length > 0 || asked.render.dropped.length > 0;

/** The line that previews the upgrade `asked` as `args` give it. */
const previewLine = (asked: Asked, args: Args): string =>
  `nemia factory diff ${[
    asked.factory.name,
    '--to',
    asked.to,
    ...(textOf(args, 'template') === undefined ? [] : ['--template', asked.source]),
    ...setsGiven(args).flatMap((set) => ['--set', set]),
  ]
    .map(shellArg)
    .join(' ')}`;

/**
 * The upgrade `asked`, held to the plan a person previewed: refused where it changes the factory's parameters and no `--plan` is given
 * (`Invalid`), and where a `--plan` given is not the plan of the upgrade now (`Conflict`); each naming the preview to run.
 */
function planHeld(home: string, asked: Asked, args: Args, verb: string, notDone: string): Asked {
  const plan = textOf(args, 'plan');
  const preview = previewLine(asked, args);
  if (plan === undefined) {
    if (!planRequired(asked, args)) return asked;
    throw new Invalid({
      message: `${verb}: this upgrade ${asked.switched === undefined ? `rewrites ${asked.factory.name}'s parameters` : `switches ${asked.factory.name} from ${asked.switched.from} onto ${asked.switched.to}, another template, with no common base`}, so it files only a plan a person previewed: ${preview} prints it and the line to type, which carries --plan <digest>. ${notDone}`,
    });
  }
  if (plan !== planDigest(home, asked.factory.name, asked.render, asked.source, asked.switched?.from))
    throw new Conflict({
      message: `${verb}: --plan ${plan} is not the plan of ${asked.factory.name}'s upgrade now — the factory's file, the template, its version, the parameters or the render changed since it was previewed: preview it again, ${preview}. ${notDone}`,
    });
  return asked;
}

/** The merge of the factory's tree with its base and `render`, three ways; or, for a switch, with `render` alone, with no common base. */
const mergeOf = (name: string, base: readonly Entry[], render: RenderedAt, switched: Switched | undefined): TreeMerge =>
  switched === undefined
    ? mergeTrees(base, entriesIn(treeDir(name)), render.entries)
    : switchTrees(entriesIn(treeDir(name)), render.entries);

/** The flags plan and upgrade take: `--to`, and `--template` where the template is at another place than the one the factory names. */
const TO: Flag = {
  flag: '--to',
  kind: 'text',
  key: 'to',
  takes: '--to takes the version to upgrade to, three numbers: --to <x.y.z>',
  twice: 'take --to once: a factory is upgraded to one version.',
};
const FROM_TEMPLATE: Flag = {
  flag: '--template',
  kind: 'text',
  key: 'template',
  takes:
    "--template takes the name of a builtin template, a template's folder, the one that holds its nemia.yaml, or an archive nemia template pack wrote",
  twice: 'take --template once: a factory is made from one template.',
};

/** `nemia factory diff`'s spec: the factory, `--to`, `--template`, and a `--set` per parameter. */
const PLAN_SPEC: Spec = {
  positionals: [{ key: 'factory', takes: 'required', kind: 'name' }],
  flags: [
    TO,
    FROM_TEMPLATE,
    {
      flag: '--set',
      kind: 'text',
      key: 'sets',
      many: true,
      takes: '--set takes a parameter of the template and its value: --set <key>=<value>',
    },
  ],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory diff does not take ${arg}. It takes the factory, --to <x.y.z>, --template <name|folder|archive> and --set <key>=<value> once per parameter.`
      : `nemia factory diff previews one factory, and ${arg} is a second: nemia factory diff <name> --to <x.y.z>.`,
  missing:
    'nemia factory diff takes the factory to preview: nemia factory diff <name> --to <x.y.z> [--template <name|folder|archive>] [--set <key>=<value> ...], or, made by hand, nemia factory diff <name> --template <name|folder|archive> [--set <key>=<value> ...].',
};

/** What `nemia factory diff` previews of a templated factory: the factory, the versions, the merge, and what files it. */
type Planned = {
  kind: 'upgrade';
  name: string;
  from: string | undefined;
  to: string;
  merge: TreeMerge;
  next: PlanNext;
  switched?: Switched;
};

/**
 * `nemia factory diff`: on a templated factory, the merge an upgrade would make, what merges cleanly and each conflict, the parameters
 * it drops, the plan's digest and the upgrade line that files it; on one made by hand, the takeover a template would make
 * (`adoptPreview`). Nothing written.
 */
export const FACTORY_PLAN: Command<Planned | AdoptPreview> = {
  name: 'factory diff',
  usage:
    '<name> --to <x.y.z> [--template <name|folder|archive>] [--set <key>=<value> ...] | <name> --template <name|folder|archive> [--set <key>=<value> ...]',
  help: [
    "preview a templated factory's upgrade: what merges cleanly, and each",
    'conflict with its sides; onto a template of another name, a switch',
    "with no common base; or a hand-made factory's takeover by a",
    'template, and the plan nemia factory adopt takes; nothing is written',
  ],
  spec: PLAN_SPEC,
  check: (args) => leftOut(PLAN_SPEC, args),
  writes: false,
  class: 'read',
  only: HERE,
  handler: (args, _env, home) =>
    rooted(
      home,
      'factory diff',
      Effect.gen(function* () {
        const verb = 'nemia factory diff';
        const notDone = 'Nothing was written.';
        const name = textOf(args, 'factory') ?? '';
        const now = yield* (yield* FactoryDoor).factories.read(FactoryName.read(name));
        if (now.template === undefined) return yield* adoptPreview(args);
        const home = yield* StoreRoot;
        const asked = yield* upgradeAsked(args, verb, notDone, false);
        const { factory, from, to, render, base, switched } = asked;
        const merge = yield* tried(() => mergeOf(factory.name, base, render, switched));
        const next = yield* tried(() => nextOf(home, asked, args));
        return { kind: 'upgrade', name: factory.name, from, to, merge, next, ...(switched ? { switched } : {}) } satisfies Planned;
      }),
    ),
  print: (planned) =>
    planned.kind === 'adopt'
      ? adoptLines(planned.plan, planned.digest, planned.line)
      : planLines(planned.name, planned.from ?? UNKNOWN, planned.to, planned.merge, planned.next, planned.switched),
};

/** `nemia factory upgrade`'s spec: the factory, `--to`, `--template`, a `--set` per parameter, `--plan` and `--downgrade`. */
const UPGRADE_SPEC: Spec = {
  positionals: [{ key: 'factory', takes: 'required', kind: 'name' }],
  flags: [
    TO,
    FROM_TEMPLATE,
    {
      flag: '--set',
      kind: 'text',
      key: 'sets',
      many: true,
      takes: '--set takes a parameter of the template and its value: --set <key>=<value>',
    },
    {
      flag: '--plan',
      kind: 'text',
      key: 'plan',
      takes: '--plan takes the digest nemia factory diff printed for this upgrade: --plan sha256:<hex>',
      twice: 'take --plan once: an upgrade files one plan.',
    },
    { flag: '--downgrade', kind: 'switch', key: 'downgrade' },
  ],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory upgrade does not take ${arg}. It takes the factory, --to <x.y.z>, --template <name|folder|archive>, --set <key>=<value> once per parameter, --plan <digest> and --downgrade.`
      : `nemia factory upgrade upgrades one factory, and ${arg} is a second: nemia factory upgrade <name> --to <x.y.z>.`,
  missing:
    'nemia factory upgrade takes the factory to upgrade: nemia factory upgrade <name> --to <x.y.z> [--template <name|folder|archive>].',
};

/** What `nemia factory upgrade` filed: the factory, the versions, its file, the parameters dropped, and the conflicts it waits on. */
type Upgraded = { name: string; from: string | undefined; to: string; file: string; dropped: readonly string[]; conflicts: number };

/**
 * `nemia factory upgrade`: the version wanted, the template's source and the parameters it renders with written into the factory's
 * file; the daemon merges it. One that changes the parameters, a `--set` given or one dropped, is held to its preview's `--plan`
 * (`planHeld`).
 */
export const FACTORY_UPGRADE: Command<Upgraded> = {
  name: 'factory upgrade',
  usage: '<name> --to <x.y.z> [--template <name|folder|archive>] [--set <key>=<value> ...] [--plan <digest>] [--downgrade]',
  help: [
    'upgrade a templated factory: its file wants --to, and the daemon merges',
    "the template's change into its tree once each conflict is resolved",
  ],
  spec: UPGRADE_SPEC,
  check: (args) => leftOut(UPGRADE_SPEC, args),
  writes: true,
  ticks: true,
  class: 'ask',
  asksAlways: true,
  only: HERE,
  handler: (args, _env, home) =>
    rooted(
      home,
      'factory upgrade',
      Effect.gen(function* () {
        const verb = 'nemia factory upgrade';
        const notDone = 'Nothing was upgraded.';
        const home = yield* StoreRoot;
        const asked = yield* upgradeAsked(args, verb, notDone);
        const { factory, from, to, source, render, base, switched } = yield* tried(() => planHeld(home, asked, args, verb, notDone));
        const conflicts = yield* tried(() => mergeOf(factory.name, base, render, switched).conflicts.length);
        const door = yield* FactoryDoor;
        const now = yield* door.factories.read(FactoryName.read(factory.name));
        const template = now.template ?? factory.template;
        const file = yield* door.factories.rewrite({ ...now, template: { ...template, version: to, source, params: render.params } });
        return { name: factory.name, from, to, file, dropped: render.dropped, conflicts };
      }),
    ),
  print: ({ name, from, to, file, dropped, conflicts }) => [
    `${name}: ${from ?? UNKNOWN} → ${to}`,
    `filed: ${file}`,
    ...(dropped.length ? [`dropped: ${dropped.join(', ')}`] : []),
    conflicts
      ? `${conflicts} conflict${conflicts === 1 ? '' : 's'} wait for a choice: nemia factory diff ${name} --to ${to} shows each, and nemia factory resolve its line; the daemon merges once each has one`
      : 'the daemon merges it on its next pass (nemia up)',
  ],
};

/** `nemia factory resolve`'s spec: the factory, the conflict's address, and one of `--ours`, `--theirs` and `--file`. */
const RESOLVE_SPEC: Spec = {
  positionals: [
    { key: 'factory', takes: 'required', kind: 'name' },
    { key: 'conflict', takes: 'required', kind: 'name' },
  ],
  flags: [
    { flag: '--ours', kind: 'switch', key: 'ours', way: true },
    { flag: '--theirs', kind: 'switch', key: 'theirs', way: true },
    {
      flag: '--file',
      kind: 'text',
      key: 'file',
      way: true,
      takes: '--file takes the file that holds what the conflict becomes: nemia factory resolve <name> <conflict> --file <path>',
    },
  ],
  unknown: (arg) =>
    `nemia factory resolve does not take ${arg}. It takes the factory, the conflict as nemia factory diff names it, and one of --ours, --theirs and --file <path>.`,
  oneWay: 'nemia factory resolve takes one choice: --ours keeps your tree, --theirs takes the template, --file <path> gives the text.',
  missing:
    'nemia factory resolve takes the factory and the conflict, as nemia factory diff names it: nemia factory resolve <name> <conflict> --ours|--theirs|--file <path>.',
};

/** The person's choice the resolve `args` give: ours, theirs, or the text of `--file`, refused where it is not there (`Invalid`). */
function choiceOf(args: Args): Choice {
  if (args.ours === true) return 'ours';
  if (args.theirs === true) return 'theirs';
  const file = path.resolve(textOf(args, 'file') ?? '');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile())
    throw new Invalid({
      message: `nemia factory resolve: there is no file at ${file} to resolve the conflict with. Nothing was resolved.`,
    });
  return { text: fs.readFileSync(file, 'utf8') };
}

/** What `nemia factory resolve` wrote: the factory, the conflict, the version, its file, and the conflicts still waiting. */
type Resolved = { name: string; at: string; to: string; file: string; left: string[] };

/**
 * The choice `args` give, written for one conflict of the upgrade under way — another version wanted, or a template of another name
 * than the base's (a switch) — for that version and that template. Refused, nothing written: the factory as an upgrade is (`rendered`);
 * a base whose version no status names, a template that no longer renders at the version wanted, or no upgrade under way (`Conflict`);
 * an address that is no conflict of the merge (`Missing`, naming those there are); and a `--file` that is not there (`Invalid`).
 */
const resolved = Effect.fn('resolved')(function* (args: Args) {
  const verb = 'nemia factory resolve';
  const notDone = 'Nothing was resolved.';
  const { factory, from, base, status } = yield* tried(() => rendered(textOf(args, 'factory') ?? '', verb, notDone));
  const to = factory.template.version;
  if (from === undefined)
    return yield* Effect.fail(
      new Conflict({
        message: `${verb}: no status names the version ${factory.name}'s base was applied at, so no upgrade of it can be merged: name it, nemia factory upgrade ${factory.name} --to <it> [--template <name|folder|archive>], and upgrade again once nemia factory ls shows it applied. ${notDone}`,
      }),
    );
  const render = yield* renderTo(verb, factory, factory.template.source, to, notDone);
  const switched = switchOf(status, render);
  if (to === from && switched === undefined)
    return yield* Effect.fail(
      new Conflict({
        message: `${verb}: no upgrade of ${factory.name} is under way, so it has no conflict to resolve: nemia factory diff ${factory.name} --to <x.y.z>, then nemia factory upgrade. ${notDone}`,
      }),
    );
  return yield* tried(() => resolvedWith(args, factory, to, render.name, mergeOf(factory.name, base, render, switched)));
});

/**
 * The choice `args` give for one conflict of `merge`, the upgrade of `factory` to `to` of the template named `name`, written
 * (`resolved`), beside the choices already made for that version and that template.
 */
function resolvedWith(args: Args, factory: Templated, to: string, name: string, merge: TreeMerge): Resolved {
  const verb = 'nemia factory resolve';
  const notDone = 'Nothing was resolved.';
  const at = textOf(args, 'conflict') ?? '';
  if (!merge.conflicts.some((c) => c.at === at))
    throw new Missing({
      message: `${verb}: ${at} is no conflict of ${factory.name}'s upgrade to ${to}; ${merge.conflicts.length ? `its conflicts: ${merge.conflicts.map((c) => c.at).join(', ')}` : 'it has none'} (nemia factory diff ${factory.name} --to ${to}). ${notDone}`,
    });
  const choice = choiceOf(args);
  const kept = readResolutions(factory.name);
  const choices = { ...choicesFor(kept, to, name), [at]: choice };
  writeResolutions(factory.name, { ...kept, to, template: name, choices });
  const left = compose(merge, choices);
  return { name: factory.name, at, to, file: resolutionsFile(factory.name), left: 'pending' in left ? left.pending.map((c) => c.at) : [] };
}

/** `nemia factory resolve`: the person's choice for one conflict of an upgrade; the daemon merges once each has one. */
export const FACTORY_RESOLVE: Command<Resolved> = {
  name: 'factory resolve',
  usage: '<name> <conflict> --ours|--theirs|--file <path>',
  help: [
    "choose for one conflict of a templated factory's upgrade or switch: your",
    'tree, the template (none: drop the file), or the text of a file; the',
    'daemon merges once each has one',
  ],
  spec: RESOLVE_SPEC,
  check: (args) =>
    leftOut(RESOLVE_SPEC, args) ??
    (args.ours === true || args.theirs === true || args.file !== undefined ? null : (RESOLVE_SPEC.oneWay ?? null)),
  writes: true,
  ticks: true,
  class: 'ask',
  asksAlways: true,
  only: HERE,
  handler: (args, _env, home) => rooted(home, 'factory resolve', resolved(args)),
  print: ({ name, at, to, file, left }) => [
    `${name}: ${at} resolved for the upgrade to ${to} — ${file}`,
    left.length
      ? `${left.length} conflict${left.length === 1 ? '' : 's'} still wait for a choice: ${left.map((c) => resolveLine(name, c)).join('; ')}`
      : 'every conflict has a choice: the daemon merges on its next pass (nemia up)',
  ],
};
