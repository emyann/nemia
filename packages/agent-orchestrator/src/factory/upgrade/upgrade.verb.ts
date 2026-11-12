/**
 * A templated factory's upgrade, as the command line asks it: `nemia factory diff` previews the merge of its tree with the template at
 * another version, rendered with the factory's parameters overlaid by each `--set`, and writes nothing (`FACTORY_PLAN`); `nemia factory
 * upgrade` writes the version wanted, the template's source where `--template` names one, and the parameters it rendered with, into the
 * factory's file alone (`FACTORY_UPGRADE`), and the factory controller merges it; `nemia factory resolve` writes the person's choice for
 * one conflict into `resolutions.json` (`FACTORY_RESOLVE`), and, for a conflict an object of the tree owns (`resolvedBy`: a Workflow, an
 * Agent, a Skill, a Hire or the Factory), once each conflict of that owner has one, proposes the owner as the choices compose it
 * (`ownerSpec`), a Proposal of it at its version now, by the caller its session's token names (`sessionCaller`), and records it beside the
 * choices by the owner's key (`ownerKey`); the controller merges once each other conflict — a carried file's, the wiring's other keys', a
 * file's that is not text — has a choice and each such proposal applied. A run in flight keeps the folders frozen on its record.
 */
import fs from 'node:fs';
import path from 'node:path';
import { tried } from '../../runtime-client.ts';
import { leftOut, type Args, type Flag, type Spec } from '../../command/command.ts';
import type { Command } from '../../command/entry.verb.ts';
import { Conflict, Invalid, Missing } from '../../refusal/refusal.ts';
import { ownerSpec } from './owner-spec.ts';
import { ResolutionProposer } from './proposer.verb.ts';
import { textIn } from '../../folder/folder.ts';
import { StoreRoot } from '../../config/root.store.ts';
import { FactoryDoor, filedFactory } from '../door/factories.store.ts';
import { templatePlace } from '../../template/door/templates.store.ts';
import { nameOfSource, sourceGiven } from '../../template/door/templates.ts';
import { Effect } from 'effect';
import type { Factory, FactoryTemplate } from '../factory.ts';
import {
  phasesNamed,
  renderedAt,
  renderedOrNot,
  sameParams,
  setsOf,
  ownerSaid,
  upgradeMerge,
  type RenderedAt,
  type UpgradeMerge,
  type Unrendered,
} from '../applied/applied.verb.ts';
import {
  appliedDir,
  digestOf,
  entriesIn,
  readResolutions,
  readStatus,
  choicesFor,
  proposalsFor,
  resolutionsFile,
  treeDir,
  writeResolutions,
  type Entry,
} from '../applied/applied.store.ts';
import {
  approveLine,
  compareVersions,
  compose,
  declineLine,
  mergeBaseOf,
  mergeTrees,
  ownerOfKey,
  planLines,
  resolveLine,
  sameVersionChange,
  switchTrees,
  type Choice,
  type MergeAt,
  type SameVersionKind,
  type PlanNext,
  type Switched,
  type TreeMerge,
} from './index.ts';
import type { Status } from '../applied/applied.store.ts';
import { adoptPreview, shellArg, type AdoptPreview } from '../../adopt/adopt.verb.ts';
import { planDigest } from '../../adopt/adopt.store.ts';
import { adoptLines } from '../../adopt/adopt.ts';

/** A factory made from a template. */
type Templated = Factory & { template: FactoryTemplate };

/**
 * What an upgrade to `to` is asked of: the factory, the version its base holds where a status names it, the template's source, its
 * render at `to`, and, where the render is of another template than the one the base holds, both by name (a switch, merged with no
 * common base); where `to` is the version the base holds, of the same template, what it asks (`sameVersionOf`).
 */
type Asked = {
  factory: Templated;
  from: string | undefined;
  to: string;
  source: string;
  render: RenderedAt;
  base: Entry[];
  switched?: Switched;
  same?: SameVersionKind;
};

/**
 * What wanting `render`, at the version the base `base` holds, of the same template, asks (`sameVersionChange`): judged against the
 * template rendered with the parameters `status` recorded, read again only where they are not `render`'s; none where it is another
 * version, a switch, or no status names the version.
 */
const sameVersionOf = Effect.fn('sameVersionOf')(function* (
  source: string,
  status: Status | undefined,
  base: readonly Entry[],
  render: RenderedAt,
  switched: Switched | undefined,
) {
  if (status === undefined || status.version !== render.version || switched !== undefined) return undefined;
  const wanted = digestOf(render.entries);
  if (sameParams(status.params, render.params)) return sameVersionChange({ base: digestOf(base), recorded: wanted, wanted });
  const read = yield* renderedOrNot(renderedAt(source, setsOf(status.params)));
  const recorded = 'problems' in read ? undefined : digestOf(read.entries);
  return sameVersionChange({ base: digestOf(base), recorded, wanted });
});

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
 * The templated factory `factory`, read through the door, rendered once: its base, the version it holds where its status names it, and
 * the status. Refused: one made from no template, one not rendered.
 */
function rendered(
  home: string,
  factory: Factory,
  verb: string,
  notDone: string,
): { factory: Templated; from: string | undefined; base: Entry[]; status: Status | undefined } {
  const name = factory.name;
  if (factory.template === undefined)
    throw new Invalid({
      message: `${verb}: ${name} is not made from a template, so it has none to upgrade; to put one onto it in place, nemia factory diff ${name} --template <name|folder|archive> previews the takeover, then nemia factory adopt. ${notDone}`,
    });
  const base = entriesIn(appliedDir(home, name));
  if (!base.length)
    throw new Conflict({
      message: `${verb}: ${name} is not rendered yet, so there is no base to merge with: start the daemon, nemia up, and try again once nemia factory ls shows it applied. ${notDone}`,
    });
  const status = readStatus(home, name);
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
  return yield* judgedTo(verb, factory, source, to, notDone, read);
});

/** The render `read` of the template at `source`, refused where it is at another version than `to`, or does not render (`renderTo`). */
const judgedTo = Effect.fn('judgedTo')(function* (
  verb: string,
  factory: Templated,
  source: string,
  to: string,
  notDone: string,
  read: RenderedAt | Unrendered,
) {
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
  const home = yield* StoreRoot;
  const filed = yield* filedFactory(textOf(args, 'factory') ?? '', 'upgrade');
  const { factory, from, base, status } = yield* tried(() => rendered(home, filed, verb, notDone));
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
    return yield* Effect.fail(yield* unnamedBase(verb, factory, given, notDone));
  const switched = switchOf(status, render);
  const same = yield* sameVersionOf(source, status, base, render, switched);
  return yield* tried(() =>
    upgradeChecked({ factory, from, to, source, render, base, switched, ...(same ? { same } : {}) }, verb, notDone, downgrades, args),
  );
});

/**
 * The refusal of an upgrade naming `given` while `factory`'s status names no template its base holds: where the template its file names
 * cannot be read, and its source fixes no name, no pass can name it, so the fix is to put it back, then `nemia up`; else the next pass
 * names it, `nemia up`.
 */
const unnamedBase = Effect.fn('unnamedBase')(function* (verb: string, factory: Templated, given: string, notDone: string) {
  const { source, params } = factory.template;
  const own = yield* renderedOrNot(renderedAt(source, setsOf(params)));
  const why = `${factory.name}'s status does not name the template its base was rendered from yet, so whether ${given} is another template, to merge with no common base, cannot be told`;
  if ('problems' in own && own.name === undefined && nameOfSource(source) === undefined)
    return new Conflict({
      message: `${verb}: ${why}, and no pass can name it: ${source}, the template ${factory.name}'s file names, cannot be read (${own.problems[0] ?? 'it is not there'}). Put the template back at ${source}, then start the daemon, nemia up, whose next pass names it, and ${verb} again. ${notDone}`,
    });
  return new Conflict({ message: `${verb}: ${why}: start the daemon, nemia up, whose next pass names it, then ${verb} again. ${notDone}` });
});

/**
 * The upgrade `asked`, refused where it asks the version its base holds again — already applied, or a template changed under it — rather
 * than a change of its parameters alone, or a downgrade not asked for (`upgradeAsked`).
 */
function upgradeChecked(asked: Asked, verb: string, notDone: string, downgrades: boolean, args: Args): Asked {
  const { factory, from, to } = asked;
  if (asked.switched !== undefined) return asked;
  if (to === from && asked.same !== 'params')
    throw new Conflict({
      message:
        asked.same === 'applied'
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
const mergeOf = (home: string, name: string, base: readonly Entry[], render: RenderedAt, switched: Switched | undefined): TreeMerge =>
  switched === undefined
    ? mergeTrees(base, entriesIn(treeDir(home, name)), render.entries)
    : switchTrees(entriesIn(treeDir(home, name)), render.entries);

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
    'template, and the plan nemia factory adopt takes; nothing is written.',
    'To change a parameter alone: --to the version applied, and',
    '--set <key>=<value> for each; it prints the line that files it',
  ],
  spec: PLAN_SPEC,
  check: (args) => leftOut(PLAN_SPEC, args),
  writes: false,
  class: 'read',
  only: HERE,
  handler: (args) =>
    Effect.gen(function* () {
      const verb = 'nemia factory diff';
      const notDone = 'Nothing was written.';
      const name = textOf(args, 'factory') ?? '';
      const now = yield* filedFactory(name, 'upgrade');
      if (now.template === undefined) return yield* adoptPreview(args);
      const home = yield* StoreRoot;
      const asked = yield* upgradeAsked(args, verb, notDone, false);
      const { factory, from, to, render, base, switched } = asked;
      const merge = yield* tried(() => mergeOf(home, factory.name, base, render, switched));
      const next = yield* tried(() => nextOf(home, asked, args));
      return { kind: 'upgrade', name: factory.name, from, to, merge, next, ...(switched ? { switched } : {}) } satisfies Planned;
    }),
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
    "the template's change into its tree once each conflict is resolved;",
    'with --to the version applied and --set, a change of its parameters',
    'alone, filed with the --plan nemia factory diff printed for it',
  ],
  spec: UPGRADE_SPEC,
  check: (args) => leftOut(UPGRADE_SPEC, args),
  writes: true,
  ticks: true,
  class: 'ask',
  asksAlways: true,
  only: HERE,
  handler: (args) =>
    Effect.gen(function* () {
      const verb = 'nemia factory upgrade';
      const notDone = 'Nothing was upgraded.';
      const home = yield* StoreRoot;
      const asked = yield* upgradeAsked(args, verb, notDone);
      const { factory, from, to, source, render, base, switched } = yield* tried(() => planHeld(home, asked, args, verb, notDone));
      const conflicts = yield* tried(() => mergeOf(home, factory.name, base, render, switched).conflicts.length);
      const door = yield* FactoryDoor;
      const now = yield* filedFactory(factory.name, 'upgrade');
      const template = now.template ?? factory.template;
      const file = yield* door.factories.rewrite({ ...now, template: { ...template, version: to, source, params: render.params } });
      return { name: factory.name, from, to, file, dropped: render.dropped, conflicts };
    }),
  print: ({ name, from, to, file, dropped, conflicts }) => [
    from === to ? `${name}: its parameters at ${to}` : `${name}: ${from ?? UNKNOWN} → ${to}`,
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

/**
 * The choice `args` give, written for one conflict of the upgrade under way — another version wanted, or a template of another name
 * than the base's (a switch) — for that version and that template. Refused, nothing written: the factory as an upgrade is (`rendered`);
 * a base whose version no status names, the template at a version no upgrade is filed to yet (naming that upgrade, to file first), a
 * template that no longer renders at the version wanted, or no upgrade under way (`Conflict`);
 * an address that is no conflict of the merge (`Missing`, naming those there are); and a `--file` that is not there (`Invalid`).
 */
const resolved = Effect.fn('resolved')(function* (args: Args) {
  const home = yield* StoreRoot;
  const verb = 'nemia factory resolve';
  const notDone = 'Nothing was resolved.';
  const filed = yield* filedFactory(textOf(args, 'factory') ?? '', 'upgrade');
  const { factory, from, base, status } = yield* tried(() => rendered(home, filed, verb, notDone));
  const to = factory.template.version;
  if (from === undefined)
    return yield* Effect.fail(
      new Conflict({
        message: `${verb}: no status names the version ${factory.name}'s base was applied at, so no upgrade of it can be merged: name it, nemia factory upgrade ${factory.name} --to <it> [--template <name|folder|archive>], and upgrade again once nemia factory ls shows it applied. ${notDone}`,
      }),
    );
  const source = factory.template.source;
  const read = yield* renderedOrNot(renderedAt(source, setsOf(factory.template.params)));
  const ahead = read.version !== undefined && read.version !== to ? read.version : undefined;
  const sameTemplate = read.name === undefined || status?.template === undefined || mergeBaseOf(status.template, read.name) === 'common';
  if (ahead !== undefined && to === from && sameTemplate)
    return yield* Effect.fail(
      new Conflict({
        message: `${verb}: no upgrade of ${factory.name} to ${ahead} is filed yet, and a conflict nemia factory diff showed for it is resolved for that upgrade: file it first, nemia factory upgrade ${factory.name} --to ${ahead}, then resolve the conflict again. ${notDone}`,
      }),
    );
  const render = yield* judgedTo(verb, factory, source, to, notDone, read);
  const switched = switchOf(status, render);
  const same = yield* sameVersionOf(source, status, base, render, switched);
  if (to === from && switched === undefined && same !== 'params')
    return yield* Effect.fail(
      new Conflict({
        message: `${verb}: no upgrade of ${factory.name} is under way, so it has no conflict to resolve: nemia factory diff ${factory.name} --to <x.y.z>, then nemia factory upgrade. ${notDone}`,
      }),
    );
  const merging = { from, to, template: render.name, base: digestOf(base) };
  const proposals = proposalsFor(readResolutions(home, factory.name), merging);
  const phases = yield* phasesNamed(factory.name, proposals);
  const ours = yield* tried(() => entriesIn(treeDir(home, factory.name)));
  const merged = upgradeMerge(factory.name, base, ours, render.entries, switched !== undefined, proposals, phases);
  return yield* resolvedWith(home, args, factory, merging, merged, ours);
});

/**
 * What `nemia factory resolve` wrote: the factory, the conflict, the version, its file, the conflicts still waiting for a choice, the
 * proposal it made of the conflict's owner where it made one (`proposed`, the owner's kind and name), and the proposals the merge waits on
 * to apply (`waits`).
 */
type Resolved = {
  name: string;
  at: string;
  to: string;
  file: string;
  left: string[];
  proposed?: { kind: string; name: string; proposal: string };
  waits: string[];
};

/**
 * The owner `key` of `factory` (`ownerOfKey`) as `merge` composes its files with `choices` (`ownerSpec`), handed to the proposer the
 * program was given (`ResolutionProposer`): proposed at the version it is at now, by the caller the session's token names, or its removal.
 * Refused as `ownerSpec` refuses (`Invalid`), and as the proposer refuses. The proposal's name.
 */
const proposedResolution = Effect.fn('proposedResolution')(function* (
  factory: Templated,
  to: string,
  key: string,
  merge: TreeMerge,
  choices: Readonly<Record<string, Choice>>,
  ours: readonly Entry[],
) {
  const owner = ownerOfKey(key);
  const tree = new Map(ours.flatMap((e) => (textIn(e.bytes) === null ? [] : [[e.path, textIn(e.bytes) ?? ''] as const])));
  const spec = yield* tried(() => ownerSpec(factory.name, owner, merge, choices, tree));
  const why = `the resolution of ${factory.name}'s upgrade to ${to}: ${ownerSaid(key)} as the choices for its conflicts compose it`;
  return yield* (yield* ResolutionProposer)(factory.name, owner.kind, owner.name, spec, why);
});

/**
 * The choice `args` give for one conflict of `read`'s merge, the upgrade of `factory` named by `merging` — its versions, its template and
 * the digest of its base — written (`resolved`), beside the choices already made for that merge (`choicesFor`); where an owner's
 * proposal resolves the conflict (`read.owners`) and each conflict of that owner then has a choice, the owner proposed as the choices
 * compose it (`proposedResolution`) against the tree's files `ours`, and recorded by its key beside them. Refused before anything is
 * written: an address that is no conflict of the merge (`Missing`); a `--file` not there (`Invalid`); and a conflict of an owner whose
 * proposal still waits
 * (`Conflict`, naming the lines that approve and decline it). Refused after the choice is written, which stays a draft: as
 * `proposedResolution` refuses.
 */
const resolvedWith = Effect.fn('resolvedWith')(function* (
  home: string,
  args: Args,
  factory: Templated,
  merging: MergeAt,
  read: UpgradeMerge,
  ours: readonly Entry[],
) {
  const { to } = merging;
  const { merge } = read;
  const verb = 'nemia factory resolve';
  const notDone = 'Nothing was resolved.';
  const at = textOf(args, 'conflict') ?? '';
  if (!merge.conflicts.some((c) => c.at === at))
    return yield* Effect.fail(
      new Missing({
        message: `${verb}: ${at} is no conflict of ${factory.name}'s upgrade to ${to}; ${merge.conflicts.length ? `its conflicts: ${merge.conflicts.map((c) => c.at).join(', ')}` : 'it has none'} (nemia factory diff ${factory.name} --to ${to}). ${notDone}`,
      }),
    );
  const choice = yield* tried(() => choiceOf(args));
  const owner = read.owners.get(at);
  const waiting = owner === undefined ? undefined : read.resolved.get(owner);
  if (waiting?.resolution === 'proposed' && waiting.proposal !== undefined)
    return yield* Effect.fail(
      new Conflict({
        message: `${verb}: the conflicts of ${owner === undefined ? '' : ownerSaid(owner)} are resolved by the proposal ${waiting.proposal.name}, which is ${waiting.proposal.phase}: approve it, ${approveLine(factory.name, waiting.proposal.name)}; or decline it, ${declineLine(factory.name, waiting.proposal.name)}, then resolve again. ${notDone}`,
      }),
    );
  const kept = readResolutions(home, factory.name);
  const choices = { ...choicesFor(kept, merging), [at]: choice };
  const proposals: Record<string, string> = Object.fromEntries(Object.entries(proposalsFor(kept, merging)).filter(([o]) => o !== owner));
  const written = () => {
    const { proposals: _was, ...others } = kept ?? {};
    writeResolutions(home, factory.name, {
      ...others,
      to,
      template: merging.template,
      base: merging.base,
      choices,
      ...(Object.keys(proposals).length ? { proposals } : {}),
    });
  };
  yield* tried(written);
  let proposed: Resolved['proposed'];
  if (owner !== undefined && merge.conflicts.every((c) => read.owners.get(c.at) !== owner || Object.hasOwn(choices, c.at))) {
    const proposal = yield* proposedResolution(factory, to, owner, merge, choices, ours);
    proposals[owner] = proposal;
    yield* tried(written);
    proposed = { ...ownerOfKey(owner), proposal };
  }
  const left = compose(merge, choices);
  const waits = [...new Set(read.owners.values())].flatMap((w) => {
    if (w === owner) return proposed === undefined ? [] : [proposed.proposal];
    const r = read.resolved.get(w);
    return r?.resolution === 'proposed' && r.proposal !== undefined ? [r.proposal.name] : [];
  });
  return {
    name: factory.name,
    at,
    to,
    file: resolutionsFile(home, factory.name),
    left: 'pending' in left ? left.pending.map((c) => c.at) : [],
    ...(proposed === undefined ? {} : { proposed }),
    waits,
  } satisfies Resolved;
});

/**
 * `nemia factory resolve`: the person's choice for one conflict of an upgrade; for the conflicts of an owner — a Workflow, an Agent, a
 * Skill, a Hire or the Factory — once each has one, the proposal of that owner, to approve; the daemon merges once each conflict has a
 * choice and each such proposal applied.
 */
export const FACTORY_RESOLVE: Command<Resolved> = {
  name: 'factory resolve',
  usage: '<name> <conflict> --ours|--theirs|--file <path>',
  help: [
    "choose for one conflict of a templated factory's upgrade or switch: your",
    'tree, the template (none: drop the file), or the text of a file; once',
    'each conflict of a workflow, an agent, a skill, a hire or the rules and',
    'instruction has one, that object is proposed as they compose it, to',
    'approve (nemia proposals approve <p> -n <name>); a carried file stays a choice;',
    'the daemon merges once each has one and each proposal applied',
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
  handler: (args) => resolved(args),
  print: ({ name, at, to, file, left, proposed, waits }) => [
    `${name}: ${at} resolved for the upgrade to ${to} — ${file}`,
    ...(proposed === undefined
      ? []
      : [
          `the ${proposed.kind} ${proposed.name} is proposed as your choices compose it, ${proposed.proposal}: ${approveLine(name, proposed.proposal)}`,
        ]),
    left.length
      ? `${left.length} conflict${left.length === 1 ? '' : 's'} still wait for a choice: ${left.map((c) => resolveLine(name, c)).join('; ')}`
      : waits.length
        ? `every conflict has a choice: the daemon merges once ${waits.join(', ')} applied (${waits.map((p) => approveLine(name, p)).join('; ')})`
        : 'every conflict has a choice: the daemon merges on its next pass (nemia up)',
  ],
};
