/**
 * A factory made from a template. `nemia factory apply`, an entry of the command table, the command line's alone, files
 * `factories/<name>.json` with the template it was made from, its parameters given with `--set`, and nothing else (`FACTORY_APPLY`).
 * The factory controller (`reconcile`): on each pass, level-triggered, each factory made from a template is read against its template,
 * its base (`applied/`) rendered once where it is absent, its tree seeded once from the base where it is absent, and its status written —
 * the version and digest of its base and its conditions, `Applied` and `ConflictsPending` (`reconcileFactory`). Nothing is carried
 * between passes: what a pass does, it reads off the disk. A tree once seeded is the person's, and never written here again.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Duration, Effect } from 'effect';
import { tried } from '../runtime-client.ts';
import { leftOut, type Args, type Flag, type Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { Invalid } from '../refusal/refusal.ts';
import { addFactory, factoryRepos, readFactories } from '../factory/factory.store.ts';
import type { Factory, FactoryTemplate } from '../factory/factory.ts';
import { openTemplate, problemLine } from '../template/template.store.ts';
import type { FactorySpec } from '../template/index.ts';
import {
  appliedDir,
  digestOf,
  entriesIn,
  readStatus,
  stageFolder,
  treeDir,
  writeStatus,
  type Condition,
  type Entry,
  type Status,
} from './applied.store.ts';
import { renderFactory, resolveParams, type Params } from './index.ts';

/** A template rendered with a factory's parameters: its version, and the files of a tree, each with its bytes. */
export type RenderedAt = { version: string; params: Params; entries: Entry[] };

/** The `--set` words that give `params`, each `<key>=<value>`. */
const setsOf = (params: FactoryTemplate['params']): string[] => Object.entries(params).map(([key, value]) => `${key}=${String(value)}`);

/**
 * The template at `source`, a folder or an archive, rendered with `params`, each `<key>=<value>`, its files read off its tree; or why it
 * is not: its problems (`nemia template check`), a parameter refused (`resolveParams`) and what the render refuses (`renderFactory`),
 * every one a line. Nothing is written.
 */
export function renderedAt(source: string, sets: readonly string[]): RenderedAt | { problems: string[] } {
  const read = openTemplate(source);
  if (read.problems.length) return { problems: read.problems.map(problemLine) };
  const spec = (read.folder.documents.get('nemia.yaml') as { spec: FactorySpec }).spec;
  const { params, refusals } = resolveParams(spec.parameters ?? {}, sets);
  if (refusals.length) return { problems: refusals };
  const rendered = renderFactory(read, params);
  if (rendered.refusals.length) return { problems: rendered.refusals };
  const entries: Entry[] = [
    ...rendered.files.map((file) => ({ path: file.path, bytes: Buffer.from(file.text) })),
    ...rendered.copies.map((copy) => {
      const from = read.file(copy.from);
      return { path: copy.path, bytes: Buffer.from(from.bytes), mode: from.mode };
    }),
  ];
  return { version: spec.version, params, entries };
}

/** A condition, as Kubernetes words one. */
const condition = (type: string, status: boolean, reason: string, message: string): Condition => ({
  type,
  status: status ? 'True' : 'False',
  reason,
  message,
});

/** No upgrade is under way, so nothing waits to be merged: the one `ConflictsPending` a factory has until upgrades come. */
const NO_CONFLICTS = condition('ConflictsPending', false, 'NoUpgrade', 'No upgrade is under way, so no change waits to be merged.');

/** The template `source` as `factory` reads it: rendered, or the `Applied` condition that says why it is not. */
function readTemplate(factory: Factory & { template: FactoryTemplate }): RenderedAt | Condition {
  const { source, version, params } = factory.template;
  const fix = `nemia template check ${source}`;
  let read: RenderedAt | { problems: string[] };
  try {
    read = renderedAt(source, setsOf(params));
  } catch (err) {
    read = { problems: [(err as Error).message] };
  }
  if ('problems' in read) {
    const more = read.problems.length > 1 ? ` (and ${read.problems.length - 1} more: ${fix})` : '';
    return condition('Applied', false, 'TemplateInvalid', `The template does not render: ${read.problems[0]}${more}`);
  }
  if (read.version !== version)
    return condition(
      'Applied',
      false,
      'VersionDrift',
      `The template is at version ${read.version}, and ${factory.name} was applied at ${version}: its base and tree are left as they are until upgrades come. Put the template back at ${version}, or apply it again under another name.`,
    );
  return read;
}

/** Whether two parameter sets give the same value to every name. */
const sameParams = (a: FactoryTemplate['params'], b: FactoryTemplate['params']): boolean =>
  Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([key, value]) => b[key] === value);

/** The `Applied` condition of a base whose digest is `base`, against the template rendered now (`now`) and the status last written. */
function appliedOf(factory: Factory & { template: FactoryTemplate }, base: string, now: RenderedAt, last: Status | undefined): Condition {
  if (base === digestOf(now.entries))
    return condition(
      'Applied',
      true,
      'Rendered',
      `The base holds ${factory.template.source} at ${now.version}; the tree is yours to change.`,
    );
  if (last !== undefined && !sameParams(last.params, factory.template.params))
    return condition(
      'Applied',
      false,
      'ParamsChanged',
      `The parameters in ${factory.name}'s file differ from those its base was rendered with: its base and tree are left as they are until upgrades come.`,
    );
  return condition(
    'Applied',
    false,
    'ContentChanged',
    `The template's files changed under version ${now.version}: give the template a new version for the change, or put its files back.`,
  );
}

/**
 * One templated factory brought to its template: its base rendered where absent, then its tree seeded from its base where absent, and its
 * status written where it changed. The status it observed.
 */
export function reconcileFactory(factory: Factory & { template: FactoryTemplate }): Status {
  const now = readTemplate(factory);
  const last = readStatus(factory.name);
  const staged = !('type' in now) && stageFolder(appliedDir(factory.name), now.entries, true);
  const base = entriesIn(appliedDir(factory.name));
  if (base.length && !fs.existsSync(treeDir(factory.name))) stageFolder(treeDir(factory.name), base, false);
  const digest = base.length ? digestOf(base) : null;
  const status: Status = {
    version: base.length ? (staged ? factory.template.version : (last?.version ?? factory.template.version)) : null,
    digest,
    params: staged ? factory.template.params : (last?.params ?? factory.template.params),
    conditions: ['type' in now ? now : appliedOf(factory, digest ?? '', now, last), NO_CONFLICTS],
  };
  writeStatus(factory.name, status);
  return status;
}

/** One pass: every factory of the store made from a template, reconciled (`reconcileFactory`). The factories reconciled, by name. */
export const reconcileOnce = Effect.fn('reconcileOnce')(function* () {
  const done: string[] = [];
  for (const factory of readFactories()) {
    if ('error' in factory || factory.template === undefined) continue;
    const templated = factory as Factory & { template: FactoryTemplate };
    yield* Effect.sync(() => reconcileFactory(templated)).pipe(
      Effect.catchCause((cause) => Effect.logWarning(`The factory ${factory.name} could not be reconciled: ${Cause.pretty(cause)}`)),
    );
    done.push(factory.name);
  }
  return done;
});

/** The controller's pace when it is given none. */
export const RECONCILE_EVERY: Duration.Input = '5 seconds';

/** The controller, for as long as it runs: a pass each `every`; a pass that fails is a warning, and the next is tried a pass later. */
export const reconcile = (every: Duration.Input = RECONCILE_EVERY): Effect.Effect<never> => {
  const pass = Effect.suspend(() => reconcileOnce()).pipe(
    Effect.catchCause((cause) => Effect.logWarning(`The factories could not be reconciled this pass: ${Cause.pretty(cause)}`)),
  );
  return Effect.forever(pass.pipe(Effect.andThen(Effect.sleep(every))));
};

/** Why the api applies no template: a template is a folder on the machine nemia runs on. */
const HERE = { side: 'cli', why: 'a template is a folder on the machine nemia runs on; the board applies none' } as const;

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

/** `nemia factory apply`'s spec: the factory's name, its template (a folder or an archive), a `--repo` or more, a `--set` a parameter. */
const APPLY_SPEC: Spec = {
  positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
  flags: [
    {
      flag: '--template',
      kind: 'text',
      key: 'template',
      takes:
        "--template takes the template's folder, the one that holds its nemia.yaml, or an archive nemia template pack wrote: nemia factory apply <name> --template <folder|archive>",
      twice: 'nemia factory apply takes --template once: a factory is made from one template.',
    },
    {
      flag: '--repo',
      kind: 'text',
      key: 'repos',
      many: true,
      takes:
        "--repo takes a repository's directory: nemia factory apply <name> --template <folder|archive> --repo <path> [--repo <path> ...]",
    },
    {
      flag: '--set',
      kind: 'text',
      key: 'sets',
      many: true,
      takes: '--set takes a parameter of the template and its value: --set <key>=<value>',
    } satisfies Flag,
  ],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory apply does not take ${arg}. It takes the name, --template <folder|archive>, --repo <path> once per repository and --set <key>=<value> once per parameter.`
      : `nemia factory apply makes one factory, and ${arg} is a second name: nemia factory apply <name> --template <folder|archive> --repo <path>.`,
  missing:
    "nemia factory apply takes the new factory's name: nemia factory apply <name> --template <folder|archive> --repo <path> [--set <key>=<value> ...].",
};

/** What `nemia factory apply` filed: the factory, its repositories, its file, the template it was made from, and the tree it runs from. */
type Applied = { name: string; repos: readonly string[]; file: string; template: FactoryTemplate; tree: string };

/**
 * The factory `args` name, made from the template in `--template` with `--set`'s parameters. Refused, before anything is written: no
 * `--template` (`Invalid`); the repositories (`factoryRepos`); a template that does not pass its check, a parameter not declared, of the
 * wrong type or required and not given, and what the render refuses (`Invalid`, every one at once); then as `addFactory` refuses.
 */
function applied(args: Args): Applied {
  const name = textOf(args, 'name') ?? '';
  const given = textOf(args, 'template');
  if (given === undefined)
    throw new Invalid({
      message: `nemia factory apply makes a factory from a template: name its folder or archive with --template <folder|archive>. Nothing was filed.`,
    });
  const repos = factoryRepos(name, manyOf(args, 'repos'));
  const source = path.resolve(given);
  const read = renderedAt(source, manyOf(args, 'sets'));
  if ('problems' in read)
    throw new Invalid({
      message: `${source} cannot make ${name}, with ${read.problems.length} problem${read.problems.length === 1 ? '' : 's'}:\n${read.problems.join('\n')}\nNothing was filed.`,
    });
  const template = { source, version: read.version, params: read.params };
  const { factory, file } = addFactory({ name, repos, template });
  return { name: factory.name, repos: factory.repos, file, template, tree: treeDir(name) };
}

/** `nemia factory apply`: a factory filed from a template; the daemon renders its tree. */
export const FACTORY_APPLY: Command<Applied> = {
  name: 'factory apply',
  usage: '<name> --template <folder|archive> --repo <path> [--repo <path> ...] [--set <key>=<value> ...]',
  help: ['make a factory from a template that passes its check, its parameters', 'given with --set; the daemon renders its tree'],
  spec: APPLY_SPEC,
  check: (args) => leftOut(APPLY_SPEC, args),
  writes: true,
  nemia: 'prompts',
  only: HERE,
  handler: (args) => tried(() => applied(args)),
  print: ({ name, repos, file, template, tree }) => [
    `${name}  ${repos.join(', ')}`,
    `filed: ${file}`,
    `made from ${template.source} at ${template.version}; the daemon renders its tree into ${tree} on its next pass (nemia up)`,
  ],
};
