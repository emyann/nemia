/**
 * The factories as objects (`Factory`, `FactoryList`, from `objects`), cluster-scoped: the default factory first, on the repository the
 * caller names (the api's own), offering every workflow, hiring no one and keeping no file; then each factory of the store as `nemia
 * factory` lists it (`factoriesListed`), a file that does not read listed all the same, its `status.error` saying why, so it hides no
 * other. A factory's `metadata.generation` is its file's count of changes to its spec (`generationOf`); its status the controller's
 * `status.json` (its conditions, each with the time it last moved, the generation that pass observed, the version applied and an upgrade
 * waiting) and its places a harness does not trust, read live; its `resourceVersion` a digest of its encoded spec and status, so a live
 * read that changes moves it with no file written. And `factoryCommands`, the lines a person types for one factory, built off the
 * command table as the board read them before.
 *
 * Every kind of a factory's parts is listed the one way (`objectsListed`): selected by its labels first — no kind here stores a label,
 * so only a negative selector (`key!=value`, `key notin (…)`) keeps any — sorted by name, then cut into a page (`pageOf`), so
 * `remainingItemCount` counts what the selector keeps.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { Effect } from 'effect';
import {
  API_VERSION,
  type Factory as FactoryObject,
  type FactoryCommands,
  type FactoryList,
  type FactoryStatus,
  type ObjectMeta,
} from 'objects';
import { readStatusAt } from '../applied/applied.store.ts';
import { commandLine } from '../command/command.ts';
import { COMMANDS } from '../command/commands.verb.ts';
import { generationOf } from '../factories/generation.ts';
import { DEFAULT_FACTORY, type FactoryListing } from '../factory/factory.ts';
import { readFactoriesAt } from '../factory/factory.store.ts';
import { keptRuns } from '../record/files.store.ts';
import { tried } from '../runtime-client.ts';
import { schedulesListed } from '../schedule/listed.store.ts';
import { untrustedPlaces } from '../trust/trust.verb.ts';
import type { ScheduleListed } from '../schedule/schedule.ts';
import type { Untrusted } from '../trust/trust.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import type { Level } from '../level/level.ts';
import { readFactoryLevelAt } from '../level/level.store.ts';
import { factoryVolumesNamed } from '../volume/volume.ts';
import { parseSelectors, selectorsRefusal, selectsLabels } from '../watch/selector.ts';
import { pageOf } from '../object/page.ts';

/** What a list of a factory's objects is asked: its namespace (none for every factory's), `?limit=`, `?continue=`, its selectors, OR'd. */
export type ObjectQuery = {
  readonly namespace?: string | undefined;
  readonly limit?: number | null | undefined;
  readonly continue?: string | undefined;
  readonly labelSelector?: readonly string[] | undefined;
};

/** An object of any kind here: what a list reads of it, its name and labels. */
type Named = { readonly metadata: { readonly name: string; readonly labels?: Readonly<Record<string, string>> } };

/** Objects in the order a list answers them and a token reads them: by name, as `<` compares. */
const byName = (a: Named, b: Named): number => (a.metadata.name < b.metadata.name ? -1 : a.metadata.name > b.metadata.name ? 1 : 0);

/** The `resourceVersion` of an object: a digest of its spec and status as they encode. */
export const versionOf = (spec: unknown, status: unknown): string =>
  createHash('sha256').update(JSON.stringify({ spec, status })).digest('hex').slice(0, 16);

/** When a file was made, or the epoch where it cannot be read: a part's `creationTimestamp`. */
export const bornAt = (file: string): string => {
  try {
    const stat = fs.statSync(file);
    return (stat.birthtimeMs > 0 ? stat.birthtime : stat.mtime).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
};

/**
 * A page of `items`, as `<kind>List`: those its label selectors keep, sorted by name, cut by its `limit` after its `continue`. `Invalid`
 * for a selector, a limit or a token that is not one; `what` names the kind in the selector's refusal.
 */
export const objectsListed = <const K extends string, T extends Named>(
  kind: K,
  items: readonly T[],
  query: ObjectQuery,
  what: string,
): Effect.Effect<{ apiVersion: typeof API_VERSION; kind: `${K}List`; metadata: ListedMeta; items: T[] }, Invalid> => {
  const selectors = query.labelSelector ?? [];
  const refusal = selectorsRefusal(selectors);
  if (refusal !== undefined)
    return Effect.fail(new Invalid({ message: `labelSelector: ${refusal}. Correct it, or leave labelSelector out to list every ${what}` }));
  const parsed = parseSelectors(selectors);
  const kept = items.filter((o) => selectsLabels(parsed, o.metadata.labels ?? {})).sort(byName);
  const page = pageOf(kept, (o) => o.metadata.name, { limit: query.limit ?? null, continue: query.continue });
  if (page instanceof Invalid) return Effect.fail(page);
  return Effect.succeed({
    apiVersion: API_VERSION,
    kind: `${kind}List`,
    metadata: { remainingItemCount: page.remainingItemCount, ...(page.continue !== undefined ? { continue: page.continue } : {}) },
    items: [...page.items],
  });
};

/** A list's metadata: how many objects are after the page, and the token of the next one. */
type ListedMeta = { remainingItemCount: number; continue?: string };

/** What a factory's object is made of beside its listing: its schedules and its places not trusted, as `nemia factory` read them. */
export type FactoryListed = {
  readonly factories: readonly FactoryListing[];
  readonly schedules: readonly ScheduleListed[];
  readonly untrusted: readonly Untrusted[];
};

/** The places of `name` among `untrusted`, as the object says them, `never` left out where any trust can be kept. */
const untrustedOf = (untrusted: readonly Untrusted[], name: string): FactoryStatus['untrusted'] =>
  untrusted
    .filter((u) => u.factory === name)
    .map(({ place, harness, withheld, never }) => ({ place, harness, withheld, ...(never === null ? {} : { never }) }));

/** The settings a factory's file gives a harness, as the object holds them: each harness's settings an object of its keys. */
const harnessSettingsOf = (settings: Readonly<Record<string, unknown>> | undefined) => {
  const held = Object.entries(settings ?? {}).filter(
    (entry): entry is [string, Record<string, unknown>] => typeof entry[1] === 'object' && entry[1] !== null && !Array.isArray(entry[1]),
  );
  return held.length ? { harnessSettings: Object.fromEntries(held.map(([k, v]) => [k, { ...v }])) } : {};
};

/** A factory's object, of its spec and status and when it was filed: its `resourceVersion` their digest. */
const objectOf = (meta: Omit<ObjectMeta, 'resourceVersion'>, spec: FactoryObject['spec'], status: FactoryStatus): FactoryObject => ({
  apiVersion: API_VERSION,
  kind: 'Factory',
  metadata: { ...meta, resourceVersion: versionOf(spec, status) },
  spec,
  status,
});

/**
 * The factory `name`'s own default level, from its level file: none where it follows the store's, an error where the file does not
 * read.
 */
const ownLevel = (home: string, name: string): { level: Level } | { error: string } | {} => {
  try {
    const own = readFactoryLevelAt(home, name)?.level;
    return own === undefined ? {} : { level: own };
  } catch (err) {
    return { error: err instanceof Invalid ? err.message : String(err) };
  }
};

/**
 * The object of one factory `listing` of the store, read at the store `home`: a file that reads as its spec, its status the controller's
 * file and its places not trusted among `listed`'s; one that does not read with no spec but its name's, its error saying why.
 */
export const factoryObjectOf = (listing: FactoryListing, listed: FactoryListed, home: string): FactoryObject => {
  const meta = { name: listing.name, creationTimestamp: bornAt(listing.file) };
  if ('error' in listing)
    return objectOf(
      meta,
      { repos: [], workflows: [], hires: {}, volumes: [] },
      {
        conditions: [],
        untrusted: [],
        error: `${listing.file} ${listing.error}`,
      },
    );
  const written = readStatusAt(home, listing.name);
  const level = ownLevel(home, listing.name);
  const spec: FactoryObject['spec'] = {
    repos: [...listing.repos],
    workflows: [...listing.workflows],
    hires: { ...listing.hires },
    volumes: factoryVolumesNamed(listing).map(({ name, path, readOnly }) => ({ name, path, readOnly })),
    ...harnessSettingsOf(listing.harnessSettings),
    ...(listing.revisions === undefined ? {} : { revisions: listing.revisions }),
    ...(listing.template === undefined
      ? {}
      : { template: { source: listing.template.source, version: listing.template.version, params: { ...listing.template.params } } }),
    ...('level' in level ? { level: level.level } : {}),
  };
  const status: FactoryStatus = {
    ...(written?.observedGeneration === undefined ? {} : { observedGeneration: written.observedGeneration }),
    conditions: (written?.conditions ?? listing.status?.conditions ?? []).map((c) => ({ ...c })),
    ...(written?.version == null ? {} : { applied: written.version }),
    ...(written?.upgrade === undefined
      ? {}
      : { upgrade: { ...written.upgrade, conflicts: written.upgrade.conflicts.map((c) => ({ ...c })) } }),
    untrusted: untrustedOf(listed.untrusted, listing.name),
    ...('error' in level ? { error: level.error } : {}),
  };
  return objectOf({ ...meta, generation: generationOf(listing) }, spec, status);
};

/** The default factory's object: on `repo`, offering every workflow (no `workflows`), hiring no one, keeping no file. */
export const defaultFactoryObject = (repo: string, home: string): FactoryObject =>
  objectOf(
    { name: DEFAULT_FACTORY, creationTimestamp: bornAt(home) },
    { repos: [repo], hires: {}, volumes: [] },
    { conditions: [], untrusted: [] },
  );

/** Every factory's object: the default on `repo`, then each of `listed`, read at `home`. */
export const factoryObjectsOf = (listed: FactoryListed, repo: string, home: string): FactoryObject[] => [
  defaultFactoryObject(repo, home),
  ...listed.factories.map((l) => factoryObjectOf(l, listed, home)),
];

/** The refusal of a factory no object has the name of: it names the list. */
export const noFactory = (name: string): Missing =>
  new Missing({
    message: `no factory ${name}: list them with nemia factory (GET /api/factories), or file one with nemia factory add ${name} --repo <path>`,
  });

/**
 * The store's factories as `nemia factory` reads them now: each factory's file at the store `home`, the schedules with the runs they
 * started, and the places a harness does not trust, read live.
 */
export const factoriesListed = Effect.fn('factoriesListed')(function* (home: string) {
  const factories = yield* tried(() => readFactoriesAt(home));
  const schedules = yield* tried(() =>
    schedulesListed(
      keptRuns(undefined, (run) => ({
        id: run.id,
        createdAt: run.createdAt,
        ...(run.scheduled === undefined ? {} : { scheduled: run.scheduled }),
      })),
    ),
  );
  const listed: FactoryListed = { factories, schedules, untrusted: yield* untrustedPlaces(factories) };
  return listed;
});

/** A page of the factories (`FactoryList`), the default on `repo`, read now at the store `home`. */
export const factoryList = Effect.fn('factoryList')(function* (home: string, repo: string, query: ObjectQuery) {
  const objects = factoryObjectsOf(yield* factoriesListed(home), repo, home);
  const listed: FactoryList = yield* objectsListed('Factory', objects, query, 'factory');
  return listed;
});

/** The factory `name` as an object, the default on `repo`, read now at the store `home`; `Missing` where none has the name. */
export const factoryObject = Effect.fn('factoryObject')(function* (home: string, repo: string, name: string) {
  if (name === DEFAULT_FACTORY) return defaultFactoryObject(repo, home);
  const listed = yield* factoriesListed(home);
  const listing = listed.factories.find((l) => l.name === name);
  if (listing === undefined) return yield* Effect.fail(noFactory(name));
  return factoryObjectOf(listing, listed, home);
});

/** The entry of the command table named `name`. */
const named = (name: string) => {
  const command = COMMANDS.find((c) => c.name === name);
  if (command === undefined) throw new Error(`No command '${name}' in the table (COMMANDS): name one it holds.`);
  return command;
};

/**
 * The lines a person types for the factory `name`, built off the command table: a workflow attached, its file removed and filed again,
 * a workflow scheduled, its places trusted again, a volume mounted; and of the factory's own parts, each schedule taken back, by its
 * workflow, and each volume unmounted, by its name.
 */
export const factoryCommands = (factory: Pick<FactoryObject, 'metadata' | 'spec'>, schedules: readonly string[]): FactoryCommands => {
  const name = factory.metadata.name;
  return {
    attach: commandLine(named('factory attach'), { factory: name }),
    rm: commandLine(named('factory rm'), { factory: name }),
    add: commandLine(named('factory add'), { name }, { repos: '<path>' }),
    schedule: commandLine(named('factory schedule'), { factory: name }, { cron: '<expr>', brief: '<text>' }),
    trust: commandLine(named('factory trust'), { factory: name }),
    volume: commandLine(named('factory volume add'), { factory: name, volume: '<path>:ro|:rw' }),
    unschedule: Object.fromEntries(
      schedules.map((workflow) => [workflow, commandLine(named('factory unschedule'), { factory: name, workflow })]),
    ),
    volumeRm: Object.fromEntries(
      factory.spec.volumes.map((v) => [v.name ?? v.path, commandLine(named('factory volume rm'), { factory: name, path: v.path })]),
    ),
  };
};

/** The lines of the factory `name` (`factoryCommands`), read now at `home`; `Missing` where no factory has the name. */
export const factoryCommandsOf = Effect.fn('factoryCommandsOf')(function* (home: string, repo: string, name: string) {
  const factory = yield* factoryObject(home, repo, name);
  const listed = name === DEFAULT_FACTORY ? [] : (yield* factoriesListed(home)).schedules;
  return factoryCommands(
    factory,
    listed.filter((s) => s.factory === name).map((s) => s.workflow),
  );
});
