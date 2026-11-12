/**
 * A factory made from a template. `nemia factory apply`, an entry of the command table, served on the api as the Factory's `apply`, files
 * `factories/<name>.json` with the template it was made from, its parameters given with `--set`, and nothing else (`FACTORY_APPLY`). The
 * factory controller (`reconcile`): on each pass, level-triggered, each factory made from a template is read against its template, its base
 * (`applied/`) rendered once where it is absent, its tree seeded once from the base where it is absent, an upgrade to the version its file
 * wants merged three ways once the person has chosen for each conflict, and an owner's resolution — a Workflow's, an Agent's, a Skill's, a
 * Hire's or the Factory's — proposed by `nemia factory resolve`, has applied (`upgradePass`), and its status written — the version and
 * digest of its base and its conditions, `Applied` and `ConflictsPending` (`reconcileFactory`). Nothing is carried between passes: what a
 * pass does, it reads off the disk. A tree once seeded is the person's, written here again only by an upgrade's merge, and never over a
 * write of theirs made since the merge read it.
 */
import fs from 'node:fs';
import { Cause, Clock, Duration, Effect } from 'effect';
import { tried } from '../../runtime-client.ts';
import { leftOut, type Args, type Flag, type Spec } from '../../command/command.ts';
import type { Command } from '../../command/entry.verb.ts';
import { Invalid, type Refusal } from '../../refusal/refusal.ts';
import type { FeedConflicts } from '../../feed/index.ts';
import { FactoryDoor, factoryRepos, originsOf, refuseName } from '../door/factories.store.ts';
import { cloned } from '../clones/clones.verb.ts';
import { StoreRoot } from '../../config/root.store.ts';
import type { Factory, FactoryConditionReason, FactoryConditionType, FactoryTemplate } from '../factory.ts';
import { openedTree, packageSkillNames, problemLine, type OpenTemplate } from '../../template/template.store.ts';
import { TemplateSource } from '../../template/door/templates.model.ts';
import { BuiltinTemplates, TemplateDoor, templatePlace } from '../../template/door/templates.store.ts';
import { builtinPlace, nameOfSource, sourceGiven } from '../../template/door/templates.ts';
import type { FactorySpec } from '../../template/index.ts';
import {
  appliedDir,
  digestOf,
  entriesIn,
  readResolutions,
  readStatus,
  replaceBase,
  stageFolder,
  swapTree,
  treeDir,
  writeStatus,
  choicesFor,
  proposalsFor,
  type Condition,
  type Entry,
  type Status,
} from './applied.store.ts';
import { overlaid, renderFactory, resolveParams, type Params } from './index.ts';
import { transitionedAt } from './condition-time.ts';
import { generationOf } from '../door/generation.ts';
import { trustedLines, type PlaceTrust } from '../../trust/trust.ts';
import { NO_TRUST, trustPlaces } from '../../trust/trust.verb.ts';
import {
  approveLine,
  baseTemplateOf,
  compose,
  conflictCut,
  conflictOwners,
  mergeBaseOf,
  mergeTrees,
  resolveLine,
  sameVersionChange,
  switchTrees,
  takenFromTree,
  resolutionOf,
  ownerOfKey,
  type Choice,
  type Conflict,
  type Switched,
  type TreeFile,
  type TreeMerge,
  type UpgradeResolution,
} from '../upgrade/index.ts';
import type { ProposalPhase } from 'objects';
import { ProposalDoor } from '../../proposal/proposal.store.ts';
import { templatePacked } from '../../template/given.store.ts';

/**
 * A template rendered with a factory's parameters: its name (its tree's, which the lint holds equal to its manifest's), its version, the
 * parameters it rendered with, the files of a tree, each with its bytes, and the parameters held that it declares none of, dropped (none
 * where nothing was held).
 */
export type RenderedAt = { name: string; version: string; params: Params; entries: Entry[]; dropped: readonly string[] };

/** The `--set` words that give `params`, each `<key>=<value>`. */
export const setsOf = (params: FactoryTemplate['params']): string[] =>
  Object.entries(params).map(([key, value]) => `${key}=${String(value)}`);

/** What a render answers where it does not render: every problem a line, with the template's name and version where they were read. */
export type Unrendered = { problems: string[]; version?: string; name?: string };

/**
 * The template at `source`, a folder or an archive by its whole path or the name of a builtin template (`templatePlace`), read
 * through the Template door and rendered with `sets`, each `<key>=<value>`, over `held` where it is given — a factory's own parameters,
 * those the template declares kept and the others dropped (`overlaid`) — its files read off its tree; or why it is not: its
 * problems (`nemia template lint`), a parameter refused (`resolveParams`) and what the render refuses (`renderFactory`), every one a
 * line, with the template's version where it was read. Nothing is written. Refused as `templatePlace` refuses a name, and as the door
 * refuses a read.
 */
export const renderedAt = Effect.fn('renderedAt')(function* (source: string, sets: readonly string[], held?: Params) {
  const place = yield* templatePlace(source);
  const tree = yield* (yield* TemplateDoor).templates.read(TemplateSource.read(place));
  return yield* tried(() => renderOpened(openedTree(place, tree, packageSkillNames()), sets, held));
});

/** The template opened as `read`, rendered with `sets` over `held` where it is given, or why it is not (`renderedAt`). */
function renderOpened(read: OpenTemplate, given: readonly string[], held: Params | undefined): RenderedAt | Unrendered {
  if (read.problems.length) return { problems: read.problems.map(problemLine), name: read.name };
  const spec = (read.folder.documents.get('nemia.yaml') as { spec: FactorySpec }).spec;
  const declared = spec.parameters ?? {};
  const { sets, dropped } = held === undefined ? { sets: given, dropped: [] } : overlaid(declared, held, given);
  const { params, refusals } = resolveParams(declared, sets);
  if (refusals.length) return { problems: refusals, version: spec.version, name: read.name };
  const rendered = renderFactory(read, params);
  if (rendered.refusals.length) return { problems: rendered.refusals, version: spec.version, name: read.name };
  const entries: Entry[] = [
    ...rendered.files.map((file) => ({ path: file.path, bytes: Buffer.from(file.text) })),
    ...rendered.copies.map((copy) => {
      const from = read.file(copy.from);
      return { path: copy.path, bytes: Buffer.from(from.bytes), mode: from.mode };
    }),
  ];
  return { name: read.name, version: spec.version, params, entries, dropped };
}

/** A condition, as Kubernetes words one. */
const condition = (type: FactoryConditionType, status: boolean, reason: FactoryConditionReason, message: string): Condition => ({
  type,
  status: status ? 'True' : 'False',
  reason,
  message,
});

/** No upgrade is under way, so nothing waits to be merged. */
const NO_CONFLICTS = condition('ConflictsPending', false, 'NoUpgrade', 'No upgrade is under way, so no change waits to be merged.');

/** `render` as an answer that cannot fail: what it rendered, or, for whatever stopped it, its words as the one problem. */
export const renderedOrNot = <R>(
  render: Effect.Effect<RenderedAt | Unrendered, unknown, R>,
): Effect.Effect<RenderedAt | Unrendered, never, R> =>
  render.pipe(Effect.catchCause((cause) => Effect.succeed({ problems: [messageOf(Cause.squash(cause))] })));

/** The words of what was thrown or failed. */
const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * The template `source` as `factory` reads it: rendered, or the `Applied` condition that says why it is not; and the template's name,
 * wherever it was read, even where it does not render or is at another version, else where its source fixes it (`nameOfSource`, a
 * builtin's), so a builtin gone or renamed still names the base it rendered.
 */
const templateNow = Effect.fn('templateNow')(function* (factory: Factory & { template: FactoryTemplate }) {
  const { source, version, params } = factory.template;
  const fix = `nemia template lint ${builtinPlace(source, yield* BuiltinTemplates)}`;
  const read = yield* renderedOrNot(renderedAt(source, setsOf(params)));
  return { now: conditionOf(factory, version, fix, read), named: read.name ?? nameOfSource(source) };
});

/** The render `read` as `factory`, applied at `version`, takes it: rendered, or the `Applied` condition that says why it is not. */
function conditionOf(
  factory: Factory & { template: FactoryTemplate },
  version: string,
  fix: string,
  read: RenderedAt | Unrendered,
): RenderedAt | Condition {
  if ('problems' in read) {
    const more = read.problems.length > 1 ? ` (and ${read.problems.length - 1} more: ${fix})` : '';
    return condition('Applied', false, 'TemplateInvalid', `The template does not render: ${read.problems[0]}${more}`);
  }
  if (read.version !== version)
    return condition(
      'Applied',
      false,
      'VersionDrift',
      `The template is at version ${read.version}, and ${factory.name} was applied at ${version}: its base and tree are left as they are. Put the template back at ${version}, or upgrade to ${read.version}: nemia factory diff ${factory.name} --to ${read.version}, then nemia factory upgrade ${factory.name} --to ${read.version}.`,
    );
  return read;
}

/** Whether two parameter sets give the same value to every name. */
export const sameParams = (a: FactoryTemplate['params'], b: FactoryTemplate['params']): boolean =>
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
      `The parameters in ${factory.name}'s file differ from those its base was rendered with, and the template's files changed under version ${now.version} too: its base and tree are left as they are. Give the template a new version for its change and upgrade with the parameters, nemia factory diff ${factory.name} --to <version> --set <key>=<value>, then the line it prints; or put the template's files back, and the next pass merges the parameters.`,
    );
  return condition(
    'Applied',
    false,
    'ContentChanged',
    `The template's files changed under version ${now.version}: give the template a new version for the change, or put its files back.`,
  );
}

/** The `Applied` condition of a base that is not the template rendered now, where no status names the version it was applied at. */
const unknownOf = ({ name, template }: Factory & { template: FactoryTemplate }): Condition =>
  condition(
    'Applied',
    false,
    'VersionUnknown',
    `${name}'s base is not ${template.source} at ${template.version}, and no status names the version it was applied at: its base and tree are left as they are. Name that version, nemia factory upgrade ${name} --to <it> [--template <name|folder|archive>], and the next pass checks it against the base.`,
  );

/** The conditions of a factory whose base holds the template as an upgrade merged it, the tree holding the merge. */
const upgraded = (factory: Factory & { template: FactoryTemplate }, version: string): Condition[] => [
  condition(
    'Applied',
    true,
    'Upgraded',
    `The base holds ${factory.template.source} at ${version}, and the tree its merge with your changes; the tree is yours to change.`,
  ),
  condition('ConflictsPending', false, 'Merged', `The upgrade to ${version} is merged, so no change waits to be merged.`),
];

/** The phase of each proposal `resolutions.json` names, by its name, as read now: `gone` where the store holds it no more. */
export type ProposalPhases = Readonly<Record<string, ProposalPhase | 'gone'>>;

/** An owner's resolution as a pass reads it: the proposal named for it, by name and phase now, where one is, and what it is to it. */
export type OwnerResolved = {
  readonly proposal?: { readonly name: string; readonly phase: ProposalPhase | 'gone' };
  readonly resolution: UpgradeResolution;
};

/**
 * An upgrade's merge as the pass and `nemia factory resolve` read it: the merge, the key of the owner whose proposal resolves each of its
 * conflicts by address (`conflictOwners`, `ownerKey`), and each such owner's resolution, by the proposal `proposals` names for it and its
 * phase in `phases` (`resolutionOf`).
 */
export type UpgradeMerge = {
  readonly merge: TreeMerge;
  readonly owners: ReadonlyMap<string, string>;
  readonly resolved: ReadonlyMap<string, OwnerResolved>;
};

/**
 * The tree `ours` of the factory `factory` merged with `base` and the render `theirs` three ways, or, for a switch, with `theirs` alone:
 * where an owner with conflicts has a resolution that applied (`taken`), merged again with that owner's files taken from the tree for
 * the render's (`takenFromTree`), so its conflicts are settled by what the proposal wrote. Each owner's files are its own, so the order
 * its proposals applied in changes nothing. Pure.
 */
export function upgradeMerge(
  factory: string,
  base: readonly TreeFile[],
  ours: readonly TreeFile[],
  theirs: readonly TreeFile[],
  switched: boolean,
  proposals: Readonly<Record<string, string>>,
  phases: ProposalPhases,
): UpgradeMerge {
  const mergeOf = (render: readonly TreeFile[]) => (switched ? switchTrees(ours, render) : mergeTrees(base, ours, render));
  const sides = [switched ? [] : base, ours, theirs];
  const first = mergeOf(theirs);
  const firstOwners = conflictOwners(first.conflicts, factory, ...sides);
  const resolved = new Map<string, OwnerResolved>();
  for (const owner of new Set(firstOwners.values())) {
    const name = proposals[owner];
    const proposal = name === undefined ? undefined : { name, phase: phases[name] ?? ('gone' as const) };
    const resolution = resolutionOf(proposal === undefined ? undefined : { phase: proposal.phase });
    resolved.set(owner, proposal === undefined ? { resolution } : { proposal, resolution });
  }
  const taken = [...resolved].filter(([, r]) => r.resolution === 'taken').map(([owner]) => owner);
  if (!taken.length) return { merge: first, owners: firstOwners, resolved };
  const merge = mergeOf(takenFromTree(theirs, ours, taken, factory));
  return { merge, owners: conflictOwners(merge.conflicts, factory, ...sides), resolved };
}

/** `choices` without those for a conflict an owner's proposal resolves (`owners`): the draft it was composed from, never the merge. */
export const choicesUnowned = (
  choices: Readonly<Record<string, Choice>>,
  owners: ReadonlyMap<string, string>,
): Readonly<Record<string, Choice>> => Object.fromEntries(Object.entries(choices).filter(([at]) => !owners.has(at)));

/** The owner a key names as a person reads it: `the Agent reviewer`. */
export const ownerSaid = (key: string): string => {
  const owner = ownerOfKey(key);
  return `the ${owner.kind} ${owner.name}`;
};

/**
 * The line that settles the conflict `conflict` of the factory `name`: where an owner's proposal resolves it, the approve line while the
 * proposal waits, or the resolve line again, saying why, once it ended unapplied; else the resolve line.
 */
function settleLine(name: string, conflict: Conflict, read: UpgradeMerge): string {
  const owner = read.owners.get(conflict.at);
  const resolved = owner === undefined ? undefined : read.resolved.get(owner);
  const proposal = resolved?.proposal;
  if (owner !== undefined && proposal !== undefined && resolved?.resolution === 'proposed')
    return `${ownerSaid(owner)} waits on its resolution's proposal ${proposal.name}: ${approveLine(name, proposal.name)}`;
  if (proposal !== undefined && resolved?.resolution === 'refused')
    return `${resolveLine(name, conflict.at)} again, since its proposal ${proposal.name} ${proposal.phase === 'gone' ? 'is gone' : `was ${proposal.phase}`}`;
  return resolveLine(name, conflict.at);
}

/** A pending conflict as the status keeps it: its sides cut (`conflictCut`), and the proposal its resolution waits on, where one is. */
function conflictKept(conflict: Conflict, read: UpgradeMerge) {
  const owner = read.owners.get(conflict.at);
  const proposal = owner === undefined ? undefined : read.resolved.get(owner)?.proposal;
  return proposal === undefined
    ? conflictCut(conflict)
    : { ...conflictCut(conflict), proposal: { name: proposal.name, phase: proposal.phase === 'gone' ? null : proposal.phase } };
}

/**
 * The conditions of an upgrade from `from` waiting on the person's choice for each conflict of `pending`, each with the line that settles
 * it (`settleLine`) once; where it is a switch onto another template (`switched`), saying so, and that it has no common base.
 */
function waiting(
  factory: Factory & { template: FactoryTemplate },
  from: string,
  pending: readonly Conflict[],
  switched: Switched | undefined,
  read: UpgradeMerge,
): Condition[] {
  const { name, template } = factory;
  const count = `${pending.length} conflict${pending.length === 1 ? '' : 's'}`;
  const what =
    switched !== undefined
      ? `switched from ${switched.from} ${from} to ${switched.to} ${template.version}, another template, with no common base`
      : from === template.version
        ? `given its new parameters at ${from}`
        : `upgraded from ${from} to ${template.version}`;
  const diff = `nemia factory diff ${name} --to ${template.version}${switched === undefined ? '' : ` --template ${template.source}`}`;
  return [
    condition(
      'Applied',
      false,
      'UpgradePending',
      `${name} waits to be ${what}: ${count} wait for a choice (${diff} shows each). Its base and tree are left as they are until each has one.`,
    ),
    condition(
      'ConflictsPending',
      true,
      'Conflicts',
      `${count} of the ${switched === undefined ? 'upgrade' : 'switch'} to ${template.version} wait for a choice: ${[...new Set(pending.map((c) => settleLine(name, c, read)))].join('; ')}.`,
    ),
  ];
}

/**
 * Whether an upgrade is due: the base was applied at a known version, does not hold the template now, and the version wanted is
 * another, or the template now is another than the one the base holds (a switch, whatever the versions), or, at the same version, the
 * base is still the template rendered with the parameters it was recorded with (`recorded`), so the parameters alone changed
 * (`sameVersionChange`).
 */
const upgradeDue = (
  factory: Factory & { template: FactoryTemplate },
  now: RenderedAt,
  digest: string,
  last: Status | undefined,
  recorded: string | undefined,
): boolean =>
  typeof last?.version === 'string' &&
  digest !== digestOf(now.entries) &&
  (last.version !== factory.template.version ||
    mergeBaseOf(last.template, now.name) === 'none' ||
    sameVersionChange({ base: digest, recorded, wanted: digestOf(now.entries) }) === 'params');

/**
 * The upgrade of a factory from the version its base holds (`last`) to the one its file wants, the template rendered at it (`now`): its
 * tree merged three ways with its base, or with no base where the template now is another than the base's (`switchTrees`), an owner
 * whose resolution's proposal applied taken from the tree (`upgradeMerge`, read with the proposals' `phases`), and the person's choices
 * for the version and the template composed into it, but those for an owner's conflicts, which its proposal resolves. While a conflict
 * has none, only the status is written, naming each and the proposal it waits on; once every one has, the tree is swapped for the merge
 * where no one wrote it since it was read, then the base for the render, then the status. A pass that stops between them composes the
 * same tree on the next.
 */
function upgradePass(
  home: string,
  factory: Factory & { template: FactoryTemplate },
  now: RenderedAt,
  base: Entry[],
  last: Status & { version: string },
  at: string,
  phases: ProposalPhases,
) {
  const { name, template } = factory;
  const ours = entriesIn(treeDir(home, name));
  const switched =
    last.template !== undefined && mergeBaseOf(last.template, now.name) === 'none' ? { from: last.template, to: now.name } : undefined;
  const merging = { from: last.version, to: template.version, template: now.name, base: digestOf(base) };
  const resolutions = readResolutions(home, name);
  const read = upgradeMerge(name, base, ours, now.entries, switched !== undefined, proposalsFor(resolutions, merging), phases);
  const composed = compose(read.merge, choicesUnowned(choicesFor(resolutions, merging), read.owners));
  if ('pending' in composed) {
    const status: Status = {
      version: last.version,
      ...(last.template === undefined ? {} : { template: last.template }),
      digest: digestOf(base),
      params: last.params,
      conditions: waiting(factory, last.version, composed.pending, switched, read),
      upgrade: { from: last.version, to: template.version, conflicts: composed.pending.map((c) => conflictKept(c, read)) },
    };
    return statusWritten(home, factory, stamped(status, last, at, factory));
  }
  if (!swapTree(home, name, composed.entries, digestOf(ours))) return last;
  replaceBase(home, name, now.entries);
  const status: Status = {
    version: now.version,
    template: now.name,
    digest: digestOf(now.entries),
    params: template.params,
    conditions: upgraded(factory, now.version),
  };
  return statusWritten(home, factory, stamped(status, last, at, factory));
}

/**
 * `status` as the pass at `at` writes it over `last`, what the file held: each condition stamped with when its status last moved, against
 * the condition of its type `last` held (`transitionedAt`), and the generation of `factory` the pass read (`observedGeneration`). Decided
 * from what the pass read alone, so two passes that observe the same keep the same time.
 */
function stamped(status: Status, last: Status | undefined, at: string, factory: Pick<Factory, 'generation'>): Status {
  const conditions = status.conditions.map((c) => {
    const before = last?.conditions.find((was) => was.type === c.type);
    const held = before === undefined ? null : { status: before.status, lastTransitionTime: before.lastTransitionTime ?? null };
    return { ...c, lastTransitionTime: transitionedAt(held, c.status, at) };
  });
  return { ...status, conditions, observedGeneration: generationOf(factory) };
}

/** `status` written as the status of `factory`, where it changed; the status. */
const statusWritten = (home: string, factory: Pick<Factory, 'name'>, status: Status): Status => {
  writeStatus(home, factory.name, status);
  return status;
};

/** The `Applied` condition of a pass that merges nothing: the render's problem, else a version no status names, else `appliedOf`'s. */
function observedOf(
  factory: Factory & { template: FactoryTemplate },
  now: RenderedAt | Condition,
  digest: string | null,
  version: string | null,
  last: Status | undefined,
): Condition {
  if ('type' in now) return now;
  if (digest !== null && version === null) return unknownOf(factory);
  return appliedOf(factory, digest ?? '', now, last);
}

/** Whether the last status says the base it holds now came by an upgrade to `version`. */
const cameByUpgrade = (last: Status | undefined, version: string): boolean =>
  last?.version === version && last.conditions.some((c) => c.type === 'Applied' && c.reason === 'Upgraded');

/**
 * One templated factory brought to its template: its base rendered where absent, then its tree seeded from its base where absent, an
 * upgrade merged where one is due (`upgradePass`), and its status written where it changed. The version its base holds is the template's
 * wherever the base is its render, else the one last written, else unknown, said by its own condition. The proposals the upgrade's
 * resolutions name are read as they are now (`phasesNamed`), so an owner's conflicts are taken once its proposal applied. The status it
 * observed.
 */
export const reconcileFactory = Effect.fn('reconcileFactory')(function* (factory: Factory & { template: FactoryTemplate }) {
  const home = yield* StoreRoot;
  const { now, named } = yield* templateNow(factory);
  const recorded = yield* recordedOf(factory, now, readStatus(home, factory.name));
  const phases = yield* phasesNamed(factory.name, readResolutions(home, factory.name)?.proposals ?? {});
  const at = new Date(yield* Clock.currentTimeMillis).toISOString();
  return reconciledWith(home, factory, now, named, at, recorded, phases);
});

/**
 * Each templated factory's `ConflictsPending` condition as `reconcileFactory` last wrote it, read through the Factory door for the tick's
 * pass, which hands it to the feed (`emitFeed`, `conflictLines`): whether it is `True`, and its message. A factory whose file does not
 * read, that has no status yet, or whose status says no such condition is left out: nothing read, nothing said.
 */
export const conflictsNow = (): Effect.Effect<FeedConflicts, Refusal> =>
  Effect.gen(function* () {
    const listed = yield* (yield* FactoryDoor).factories.listed();
    return listed.flatMap((l) => {
      if ('error' in l) return [];
      const c = l.status?.conditions.find((condition) => condition.type === 'ConflictsPending');
      return c === undefined ? [] : [{ factory: l.name, pending: c.status === 'True', message: c.message }];
    });
  });

/**
 * The phase now of each proposal of the factory `factory` that `proposals` names, read through the Proposal door: `gone` where the store
 * holds none of that name, or the name is no proposal's.
 */
export const phasesNamed = Effect.fn('phasesNamed')(function* (factory: string, proposals: Readonly<Record<string, string>>) {
  const door = (yield* ProposalDoor).proposals;
  const phases: Record<string, ProposalPhase | 'gone'> = {};
  for (const name of new Set(Object.values(proposals))) {
    const read = yield* door.read(factory, name).pipe(Effect.catchTag('Invalid', () => Effect.succeed(undefined)));
    phases[name] = read?.status.phase ?? 'gone';
  }
  return phases;
});

/**
 * The digest of the template rendered now (`now`) at the version `last` names, with the parameters `last` recorded rather than the
 * file's: read only where the file wants that version of that template with other parameters, so a pass can tell a change of the
 * parameters alone from a template changed under its version (`sameVersionChange`); none where it is not read or does not render.
 */
const recordedOf = Effect.fn('recordedOf')(function* (
  factory: Factory & { template: FactoryTemplate },
  now: RenderedAt | Condition,
  last: Status | undefined,
) {
  if ('type' in now || last?.version !== factory.template.version || sameParams(last.params, factory.template.params)) return undefined;
  if (mergeBaseOf(last.template, now.name) === 'none') return undefined;
  const read = yield* renderedOrNot(renderedAt(factory.template.source, setsOf(last.params)));
  return 'problems' in read ? undefined : digestOf(read.entries);
});

/**
 * The name of the template a base holds (`baseTemplateOf`): `rendered` where the base is the render; else the status's `last`; else, while
 * no upgrade is under way, `named`, the template the factory's file names.
 */
const namedBase = (
  factory: Factory & { template: FactoryTemplate },
  rendered: string | undefined,
  last: Status | undefined,
  named: string | undefined,
): string | undefined =>
  baseTemplateOf({
    rendered,
    recorded: last?.template,
    idle: typeof last?.version === 'string' && last.version === factory.template.version && last.upgrade === undefined,
    named,
  });

/**
 * `factory` brought to its template as rendered now (`now`), or as the condition that says why it is not, `named` the name of the
 * template its file names where it was read (`reconcileFactory`). The status names the template the base holds (`baseTemplateOf`).
 */
function reconciledWith(
  home: string,
  factory: Factory & { template: FactoryTemplate },
  now: RenderedAt | Condition,
  named: string | undefined,
  at: string,
  recorded: string | undefined,
  phases: ProposalPhases,
): Status {
  const last = readStatus(home, factory.name);
  if (!('type' in now)) stageFolder(appliedDir(home, factory.name), now.entries, true);
  const base = entriesIn(appliedDir(home, factory.name));
  if (base.length && !fs.existsSync(treeDir(home, factory.name))) stageFolder(treeDir(home, factory.name), base, false);
  const digest = base.length ? digestOf(base) : null;
  if (!('type' in now) && digest !== null && upgradeDue(factory, now, digest, last, recorded))
    return upgradePass(home, factory, now, base, last as Status & { version: string }, at, phases);
  return observed(home, factory, now, base, digest, last, named, at);
}

/**
 * The status of a pass that merges nothing, written where it changed: the version and the template its base holds, its digest, its
 * parameters and its conditions (`reconciledWith`).
 */
function observed(
  home: string,
  factory: Factory & { template: FactoryTemplate },
  now: RenderedAt | Condition,
  base: readonly Entry[],
  digest: string | null,
  last: Status | undefined,
  named: string | undefined,
  at: string,
): Status {
  const current = !('type' in now) && digest === digestOf(now.entries);
  const version = base.length ? (current ? now.version : (last?.version ?? null)) : null;
  const template = base.length ? namedBase(factory, current ? now.name : undefined, last, named) : undefined;
  const status: Status = {
    version,
    ...(template === undefined ? {} : { template }),
    digest,
    params: current ? factory.template.params : (last?.params ?? factory.template.params),
    conditions:
      current && cameByUpgrade(last, now.version)
        ? upgraded(factory, now.version)
        : [observedOf(factory, now, digest, version, last), NO_CONFLICTS],
  };
  return statusWritten(home, factory, stamped(status, last, at, factory));
}

/** One pass: every factory of the store made from a template, reconciled (`reconcileFactory`). The factories reconciled, by name. */
export const reconcileOnce = Effect.fn('reconcileOnce')(function* () {
  const done: string[] = [];
  for (const factory of yield* (yield* FactoryDoor).factories.listed()) {
    if ('error' in factory || factory.template === undefined) continue;
    const templated = factory as Factory & { template: FactoryTemplate };
    yield* reconcileFactory(templated).pipe(
      Effect.catchCause((cause) => Effect.logWarning(`The factory ${factory.name} could not be reconciled: ${Cause.pretty(cause)}`)),
    );
    done.push(factory.name);
  }
  return done;
});

/** The controller's pace, which no caller shortens. */
export const RECONCILE_EVERY: Duration.Input = '5 seconds';

/**
 * The controller, for as long as it runs: a pass each `RECONCILE_EVERY`; a pass that fails is a warning, and the next is tried a pass
 * later.
 */
export const reconcile = (): Effect.Effect<never, never, StoreRoot> => {
  const pass = Effect.suspend(() => reconcileOnce()).pipe(
    Effect.catchCause((cause) => Effect.logWarning(`The factories could not be reconciled this pass: ${Cause.pretty(cause)}`)),
  );
  return Effect.forever(pass.pipe(Effect.andThen(Effect.sleep(RECONCILE_EVERY))));
};

/**
 * Why the command line takes an apply by its arguments: the api serves it as the Factory's `apply`, calling its handler with the template
 * by a builtin's name or packed, kept under its store.
 */
const HERE = {
  side: 'cli',
  why: "the api serves it as the Factory's `apply` of `objects`' Api, calling this handler: a template travels there packed, or by a builtin template's name",
} as const;

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
        "--template takes the name of a builtin template, a template's folder, the one that holds its nemia.yaml, or an archive nemia template pack wrote: nemia factory apply <name> --template <name|folder|archive>",
      twice: 'nemia factory apply takes --template once: a factory is made from one template.',
    },
    {
      flag: '--repo',
      kind: 'text',
      key: 'repos',
      many: true,
      takes:
        "--repo takes a repository's directory or its git URL: nemia factory apply <name> --template <name|folder|archive> --repo <path|url> [--repo <path|url> ...]",
    },
    {
      flag: '--set',
      kind: 'text',
      key: 'sets',
      many: true,
      takes: '--set takes a parameter of the template and its value: --set <key>=<value>',
    } satisfies Flag,
    NO_TRUST,
  ],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory apply does not take ${arg}. It takes the name, --template <name|folder|archive>, --repo <path|url> once per repository, --set <key>=<value> once per parameter, and --no-trust.`
      : `nemia factory apply makes one factory, and ${arg} is a second name: nemia factory apply <name> --template <name|folder|archive> --repo <path>.`,
  missing:
    "nemia factory apply takes the new factory's name: nemia factory apply <name> --template <name|folder|archive> --repo <path> [--set <key>=<value> ...].",
};

/**
 * What `nemia factory apply` filed: the factory, its repositories, its file, the template it was made from and the folder or archive it
 * was read at, and the tree it runs from.
 */
type Applied = { name: string; repos: readonly string[]; file: string; template: FactoryTemplate; place: string; tree: string };

/**
 * The factory `args` name, made from the template in `--template` with `--set`'s parameters. Refused, before anything is written: no
 * `--template` (`Invalid`); the repositories (`factoryRepos`); a template that does not pass its check, a parameter not declared, of the
 * wrong type or required and not given, and what the render refuses (`Invalid`, every one at once); then as `addFactory` refuses.
 */
const applied = Effect.fn('applied')(function* (args: Args) {
  const name = textOf(args, 'name') ?? '';
  const given = textOf(args, 'template');
  if (given === undefined)
    return yield* Effect.fail(
      new Invalid({
        message: `nemia factory apply makes a factory from a template: name a builtin template, or a template's folder or archive, with --template <name|folder|archive>. Nothing was filed.`,
      }),
    );
  const home = yield* StoreRoot;
  const { repos, origins } = yield* tried(() => {
    refuseName(name, 'add');
    return factoryRepos(home, name, manyOf(args, 'repos'));
  });
  const source = sourceGiven(given);
  const read = yield* renderedAt(source, manyOf(args, 'sets'));
  if ('problems' in read)
    return yield* Effect.fail(
      new Invalid({
        message: `${source} cannot make ${name}, with ${read.problems.length} problem${read.problems.length === 1 ? '' : 's'}:\n${read.problems.join('\n')}\nNothing was filed.`,
      }),
    );
  const template = { source, version: read.version, params: read.params };
  const tree = treeDir(home, name);
  yield* cloned(origins);
  const factory: Factory = { name, repos, workflows: [], hires: {}, schedules: {}, template, tree, ...originsOf(origins) };
  const file = yield* (yield* FactoryDoor).factories.create(factory);
  const place = builtinPlace(source, yield* BuiltinTemplates);
  return { name, repos, file, template, place, tree } satisfies Applied;
});

/**
 * `nemia factory apply`: a factory filed from a template, its places then trusted as `nemia factory add` trusts them unless
 * `--no-trust` (`trustPlaces`); the daemon renders its tree.
 */
export const FACTORY_APPLY: Command<Applied & { trusts: readonly PlaceTrust[] }> = {
  name: 'factory apply',
  served: [{ endpoint: 'factories.apply', request: templatePacked }],
  usage: '<name> --template <name|folder|archive> --repo <path|url> [--repo <path|url> ...] [--set <key>=<value> ...] [--no-trust]',
  help: ['make a factory from a template that passes its check, its parameters', 'given with --set; the daemon renders its tree'],
  spec: APPLY_SPEC,
  check: (args) => leftOut(APPLY_SPEC, args),
  writes: true,
  class: 'ask',
  asksAlways: true,
  only: HERE,
  handler: (args) =>
    Effect.gen(function* () {
      const filed = yield* applied(args);
      return { ...filed, trusts: args.noTrust === true ? [] : yield* trustPlaces(filed.repos) };
    }),
  print: ({ name, repos, file, template, place, tree, trusts }) => [
    `${name}  ${repos.join(', ')}`,
    `filed: ${file}`,
    `made from ${place === template.source ? template.source : `the builtin template ${template.source} (${place})`} at ${template.version}; the daemon renders its tree into ${tree} on its next pass (nemia up)`,
    ...trustedLines(name, trusts),
  ],
};
