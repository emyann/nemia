/**
 * A templated factory's upgrade, as the command line asks it: `nemia factory diff` previews the merge of its tree with the template at
 * another version and writes nothing (`FACTORY_PLAN`); `nemia factory upgrade` writes the version wanted, and the template's source where
 * `--template` names one, into the factory's file alone (`FACTORY_UPGRADE`), and the factory controller merges it; `nemia factory resolve`
 * writes the person's choice for one conflict into `resolutions.json` (`FACTORY_RESOLVE`), and the controller merges once each conflict has
 * one. A run in flight keeps the folders frozen on its record.
 */
import fs from 'node:fs';
import path from 'node:path';
import { tried } from '../runtime-client.ts';
import { leftOut, type Args, type Flag, type Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { readFactory, retargetTemplate } from '../factory/factory.store.ts';
import type { Factory, FactoryTemplate } from '../factory/factory.ts';
import { renderedAt, setsOf, type RenderedAt } from '../applied/applied.verb.ts';
import {
  appliedDir,
  digestOf,
  entriesIn,
  readResolutions,
  readStatus,
  resolutionsFile,
  treeDir,
  writeResolutions,
  type Entry,
} from '../applied/applied.store.ts';
import { compareVersions, compose, mergeTrees, planLines, resolveLine, type Choice, type TreeMerge } from './index.ts';

/** A factory made from a template. */
type Templated = Factory & { template: FactoryTemplate };

/**
 * What an upgrade to `to` is asked of: the factory, the version its base holds where a status names it, the template's source, and its
 * render at `to`.
 */
type Asked = { factory: Templated; from: string | undefined; to: string; source: string; render: RenderedAt; base: Entry[] };

/** The version a base holds where no status names it, as the plan and the upgrade print it. */
const UNKNOWN = 'a version no status names';

const HERE = { side: 'cli', why: 'a template is a folder on the machine nemia runs on; the board upgrades none' } as const;

/** The words under `key`, or none. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** A version as a template declares it: three numbers, `x.y.z`. */
const VERSION = /^\d+\.\d+\.\d+$/;

/**
 * The templated factory `name`, rendered once: its base, and the version it holds where its status names it. Refused: the factory, one
 * made from no template, one not rendered.
 */
function rendered(name: string, verb: string, notDone: string): { factory: Templated; from: string | undefined; base: Entry[] } {
  const factory = readFactory(name, notDone);
  if (factory.template === undefined)
    throw new Invalid({
      message: `${verb}: ${name} is not made from a template, so it has none to upgrade; nemia factory apply makes one from a template. ${notDone}`,
    });
  const base = entriesIn(appliedDir(name));
  if (!base.length)
    throw new Conflict({
      message: `${verb}: ${name} is not rendered yet, so there is no base to merge with: start the daemon, nemia up, and try again once nemia factory ls shows it applied. ${notDone}`,
    });
  return { factory: factory as Templated, from: readStatus(name)?.version ?? undefined, base };
}

/**
 * The template at `source` rendered with `factory`'s parameters, or refused where it is at another version than `to`, or does not
 * render.
 */
function renderTo(verb: string, factory: Templated, source: string, to: string, notDone: string): RenderedAt {
  let read: RenderedAt | { problems: string[]; version?: string };
  try {
    read = renderedAt(source, setsOf(factory.template.params));
  } catch (err) {
    read = { problems: [(err as Error).message] };
  }
  if (read.version !== undefined && read.version !== to)
    throw new Conflict({
      message: `${verb}: ${source} is at version ${read.version}, not ${to}: put the template at ${to}, or name a folder or archive at ${to} with --template <folder|archive>. ${notDone}`,
    });
  if ('problems' in read)
    throw new Invalid({
      message: `${verb}: ${source} does not render ${factory.name} at ${to}, with ${read.problems.length} problem${read.problems.length === 1 ? '' : 's'} (a parameter the version requires is given by none: an upgrade takes no --set yet):\n${read.problems.join('\n')}\n${notDone}`,
    });
  return read;
}

/**
 * The upgrade of the factory `args` name to `--to`, as `verb` asks it, refused in order before anything is written: the factory, one made
 * from no template (`Invalid`) and one not rendered (`Conflict`); a `--to` that is no `x.y.z` (`Invalid`); a template at another version
 * than `--to` (`Conflict`, naming `--template`); the version its base holds asked again, the same content or another (`Conflict`); a
 * downgrade without `--downgrade` where `downgrades` (`Conflict`); and a template that does not render (`Invalid`). Where no status
 * names the version its base holds, any `--to` is taken: the controller checks it against the base.
 */
function upgradeAsked(args: Args, verb: string, notDone: string, downgrades = true): Asked {
  const { factory, from, base } = rendered(textOf(args, 'factory') ?? '', verb, notDone);
  const to = textOf(args, 'to');
  if (to === undefined || !VERSION.test(to))
    throw new Invalid({
      message: `${verb} takes the version to upgrade to, three numbers: ${verb} ${factory.name} --to <x.y.z>. ${notDone}`,
    });
  const given = textOf(args, 'template');
  const source = given === undefined ? factory.template.source : path.resolve(given);
  const render = renderTo(verb, factory, source, to, notDone);
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
  return { factory, from, to, source, render, base };
}

/** The merge of the factory's tree with its base and `render`, three ways. */
const mergeOf = (name: string, base: readonly Entry[], render: RenderedAt): TreeMerge =>
  mergeTrees(base, entriesIn(treeDir(name)), render.entries);

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
  takes: "--template takes the template's folder, the one that holds its nemia.yaml, or an archive nemia template pack wrote",
  twice: 'take --template once: a factory is made from one template.',
};

/** `nemia factory diff`'s spec: the factory, `--to` and `--template`. */
const PLAN_SPEC: Spec = {
  positionals: [{ key: 'factory', takes: 'required', kind: 'name' }],
  flags: [TO, FROM_TEMPLATE],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory diff does not take ${arg}. It takes the factory, --to <x.y.z> and --template <folder|archive>.`
      : `nemia factory diff previews one factory, and ${arg} is a second: nemia factory diff <name> --to <x.y.z>.`,
  missing: 'nemia factory diff takes the factory to preview: nemia factory diff <name> --to <x.y.z> [--template <folder|archive>].',
};

/** What `nemia factory diff` previews: the factory, the versions, and the merge. */
type Planned = { name: string; from: string | undefined; to: string; merge: TreeMerge };

/** `nemia factory diff`: the merge an upgrade would make, what merges cleanly and each conflict; nothing written. */
export const FACTORY_PLAN: Command<Planned> = {
  name: 'factory diff',
  usage: '<name> --to <x.y.z> [--template <folder|archive>]',
  help: ["preview a templated factory's upgrade: what merges cleanly, and each", 'conflict with its sides; nothing is written'],
  spec: PLAN_SPEC,
  check: (args) => leftOut(PLAN_SPEC, args),
  writes: false,
  class: 'read',
  only: HERE,
  handler: (args) =>
    tried(() => {
      const { factory, from, to, render, base } = upgradeAsked(args, 'nemia factory diff', 'Nothing was written.', false);
      return { name: factory.name, from, to, merge: mergeOf(factory.name, base, render) };
    }),
  print: ({ name, from, to, merge }) => planLines(name, from ?? UNKNOWN, to, merge),
};

/** `nemia factory upgrade`'s spec: the factory, `--to`, `--template` and `--downgrade`. */
const UPGRADE_SPEC: Spec = {
  positionals: [{ key: 'factory', takes: 'required', kind: 'name' }],
  flags: [TO, FROM_TEMPLATE, { flag: '--downgrade', kind: 'switch', key: 'downgrade' }],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory upgrade does not take ${arg}. It takes the factory, --to <x.y.z>, --template <folder|archive> and --downgrade.`
      : `nemia factory upgrade upgrades one factory, and ${arg} is a second: nemia factory upgrade <name> --to <x.y.z>.`,
  missing: 'nemia factory upgrade takes the factory to upgrade: nemia factory upgrade <name> --to <x.y.z> [--template <folder|archive>].',
};

/** What `nemia factory upgrade` filed: the factory, the versions, its file, and the conflicts the merge waits on. */
type Upgraded = { name: string; from: string | undefined; to: string; file: string; conflicts: number };

/** `nemia factory upgrade`: the version wanted written into the factory's file; the daemon merges it. */
export const FACTORY_UPGRADE: Command<Upgraded> = {
  name: 'factory upgrade',
  usage: '<name> --to <x.y.z> [--template <folder|archive>] [--downgrade]',
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
  handler: (args) =>
    tried(() => {
      const { factory, from, to, render, base } = upgradeAsked(args, 'nemia factory upgrade', 'Nothing was upgraded.');
      const given = textOf(args, 'template');
      const conflicts = mergeOf(factory.name, base, render).conflicts.length;
      const { file } = retargetTemplate(factory.name, { version: to, source: given === undefined ? undefined : path.resolve(given) });
      return { name: factory.name, from, to, file, conflicts };
    }),
  print: ({ name, from, to, file, conflicts }) => [
    `${name}: ${from ?? UNKNOWN} → ${to}`,
    `filed: ${file}`,
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
 * The choice `args` give, written for one conflict of the upgrade under way. Refused, nothing written: the factory as an upgrade is
 * (`rendered`); a base whose version no status names, no upgrade under way, or a template that no longer renders at the version wanted
 * (`Conflict`); an address that is no conflict of the merge (`Missing`, naming those there are); and a `--file` that is not there
 * (`Invalid`).
 */
function resolved(args: Args): Resolved {
  const verb = 'nemia factory resolve';
  const notDone = 'Nothing was resolved.';
  const { factory, from, base } = rendered(textOf(args, 'factory') ?? '', verb, notDone);
  const to = factory.template.version;
  if (from === undefined)
    throw new Conflict({
      message: `${verb}: no status names the version ${factory.name}'s base was applied at, so no upgrade of it can be merged: name it, nemia factory upgrade ${factory.name} --to <it> [--template <folder|archive>], and upgrade again once nemia factory ls shows it applied. ${notDone}`,
    });
  if (to === from)
    throw new Conflict({
      message: `${verb}: no upgrade of ${factory.name} is under way, so it has no conflict to resolve: nemia factory diff ${factory.name} --to <x.y.z>, then nemia factory upgrade. ${notDone}`,
    });
  const merge = mergeOf(factory.name, base, renderTo(verb, factory, factory.template.source, to, notDone));
  const at = textOf(args, 'conflict') ?? '';
  if (!merge.conflicts.some((c) => c.at === at))
    throw new Missing({
      message: `${verb}: ${at} is no conflict of ${factory.name}'s upgrade to ${to}; ${merge.conflicts.length ? `its conflicts: ${merge.conflicts.map((c) => c.at).join(', ')}` : 'it has none'} (nemia factory diff ${factory.name} --to ${to}). ${notDone}`,
    });
  const choice = choiceOf(args);
  const kept = readResolutions(factory.name);
  const choices = { ...(kept?.to === to ? kept.choices : {}), [at]: choice };
  writeResolutions(factory.name, { ...kept, to, choices });
  const left = compose(merge, choices);
  return { name: factory.name, at, to, file: resolutionsFile(factory.name), left: 'pending' in left ? left.pending.map((c) => c.at) : [] };
}

/** `nemia factory resolve`: the person's choice for one conflict of an upgrade; the daemon merges once each has one. */
export const FACTORY_RESOLVE: Command<Resolved> = {
  name: 'factory resolve',
  usage: '<name> <conflict> --ours|--theirs|--file <path>',
  help: [
    "choose for one conflict of a templated factory's upgrade: your tree, the",
    'template, or the text of a file; the daemon merges once each has one',
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
  handler: (args) => tried(() => resolved(args)),
  print: ({ name, at, to, file, left }) => [
    `${name}: ${at} resolved for the upgrade to ${to} — ${file}`,
    left.length
      ? `${left.length} conflict${left.length === 1 ? '' : 's'} still wait for a choice: ${left.map((c) => resolveLine(name, c)).join('; ')}`
      : 'every conflict has a choice: the daemon merges on its next pass (nemia up)',
  ],
};
