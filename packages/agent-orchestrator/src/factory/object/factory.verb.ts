/**
 * The factories as objects (`Factory`, `FactoryList`, from `objects`), cluster-scoped: the default factory first, on the repository the
 * caller names (the api's own), offering every workflow, hiring no one and keeping no file; then each factory of the store as `nemia
 * factory` lists it (`factoriesListed`), a file that does not read listed all the same, its `status.error` saying why, so it hides no
 * other. A factory's parts read it through `factoryFiled`: its spec and its listing, off one read of the store's factories, no status, and
 * no run. A factory's `metadata.generation` is its file's count of changes to its spec (`generationOf`); its status the controller's
 * `status.json` (its conditions, each with the time it last moved, the generation that pass observed, the version applied and an upgrade
 * waiting) and its places a harness does not trust, read live; its `resourceVersion` a digest of its encoded spec and status, and of its
 * rules and its instruction, the sub-resources read beside it (`partsOf`), so a live read that changes moves it with no file written, and
 * an edit of its rules or its instruction moves it as a write of its spec does — a proposal read before either goes stale. And
 * `factoryCommands`, the lines a person types for one factory, built off the command table as the board read them before.
 *
 * Every kind of a factory's parts is listed the one way (`objectsListed`, `src/object/listed.verb.ts`).
 */
import { Effect } from 'effect';
import {
  API_VERSION,
  DEFAULT_NAMESPACE,
  type Factory as FactoryObject,
  type FactoryCommands,
  type FactoryList,
  type FactoryStatus,
  type ObjectMeta,
} from 'objects';
import { readStatusAt } from '../applied/applied.store.ts';
import { commandLine } from '../../command/command.ts';
import { COMMANDS } from '../../command/commands.verb.ts';
import { generationOf } from '../door/generation.ts';
import type { FactoryListing } from '../factory.ts';
import type { InstructionRead } from '../instruction.store.ts';
import type { RulesRead } from '../rules/rules.store.ts';
import { doorAt, doorAtOnce } from '../door/factories.store.ts';
import { FactoryName, isDefaultFactory, type DefaultFactory } from '../factory.model.ts';
import { untrustedPlaces } from '../../trust/trust.verb.ts';
import type { Untrusted } from '../../trust/trust.ts';
import { Invalid, Missing } from '../../refusal/refusal.ts';
import type { Level } from '../../level/level.ts';
import { factoryVolumesNamed } from '../volume/volume.ts';
import { bornAt, objectsListed, versionOf, type ObjectQuery } from '../../object/listed.verb.ts';

/** Two texts in the order `<` compares them. */
const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** What a factory's object is made of: the store's factories, and the places not trusted of those whose status is built. */
export type FactoryListed = {
  readonly factories: readonly FactoryListing[];
  readonly untrusted: readonly Untrusted[];
};

/** A factory as its parts read it: its name and when it was filed, and its spec, with no status. */
export type FiledFactory = {
  readonly metadata: Omit<ObjectMeta, 'resourceVersion'>;
  readonly spec: FactoryObject['spec'];
};

/** A factory as `factoryFiled` answers it: as its parts read it, and its listing in the store, none for the default factory. */
export type Filed = { readonly factory: FiledFactory; readonly listing: FactoryListing | undefined };

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

/** A factory's sub-resources as they read, each its words and why it does not read: its rules and its instruction. */
type FactoryParts = { readonly rules: RulesRead; readonly instruction: InstructionRead };

/** A read that found nothing: no words, and nothing that does not read. */
const isBlank = (read: { words: string | null; error: string | null }): boolean => read.words === null && read.error === null;

/**
 * The rules and the instruction of the factory of `listing`, read at the store `home`, as its version digests them: none where it keeps
 * neither, so a factory with no sub-resource keeps the version of its spec and status alone. Where the instruction's place cannot be said,
 * its error is read.
 */
const partsOf = (listing: Exclude<FactoryListing, { error: string }>, home: string): FactoryParts | undefined => {
  const name = FactoryName.read(listing.name);
  const { words, error } = doorAtOnce(home, (door) => door.rules.read(name));
  const rules = { words, error };
  let instruction: InstructionRead;
  try {
    const read = doorAtOnce(home, (door) => door.instruction.read(name));
    instruction = { words: read.words, error: read.error };
  } catch (err) {
    instruction = { words: null, error: err instanceof Error ? err.message : String(err) };
  }
  return isBlank(rules) && isBlank(instruction) ? undefined : { rules, instruction };
};

/** A factory's object, of its spec and status and when it was filed: its `resourceVersion` their digest, and its `parts`' where given. */
const objectOf = (
  meta: Omit<ObjectMeta, 'resourceVersion'>,
  spec: FactoryObject['spec'],
  status: FactoryStatus,
  parts?: FactoryParts,
): FactoryObject => ({
  apiVersion: API_VERSION,
  kind: 'Factory',
  metadata: { ...meta, resourceVersion: versionOf(spec, status, parts) },
  spec,
  status,
});

/**
 * The factory `name`'s own default level, from its level file: none where it follows the store's, an error where the file does not
 * read.
 */
const ownLevel = (home: string, name: string): { level: Level } | { error: string } | {} => {
  try {
    const own = doorAtOnce(home, (door) => door.level.read(FactoryName.read(name)))?.level;
    return own === undefined ? {} : { level: own };
  } catch (err) {
    return { error: err instanceof Invalid ? err.message : String(err) };
  }
};

/**
 * The object of one factory `listing` of the store, read at the store `home`: a file that reads as its spec, its status the controller's
 * file and its places not trusted among `listed`'s, its version moved by its rules and its instruction too (`partsOf`); one that does not
 * read with no spec but its name's, its error saying why.
 */
export const factoryObjectOf = (listing: FactoryListing, listed: FactoryListed, home: string): FactoryObject => {
  const { metadata, spec } = filedOf(listing, home);
  if ('error' in listing) return objectOf(metadata, spec, { conditions: [], untrusted: [], error: `${listing.file} ${listing.error}` });
  const written = readStatusAt(home, listing.name);
  const level = ownLevel(home, listing.name);
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
  return objectOf(metadata, spec, status, partsOf(listing, home));
};

/**
 * The factory of one `listing` of the store as its parts read it, at the store `home`: a file that reads as its spec, its own level among
 * it; one that does not with no spec but its name's. No status: neither the controller's file nor a harness's trust is read.
 */
export const filedOf = (listing: FactoryListing, home: string): FiledFactory => {
  const meta = { name: listing.name, creationTimestamp: bornAt(listing.file) };
  if ('error' in listing) return { metadata: meta, spec: { repos: [], workflows: [], hires: {}, volumes: [] } };
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
  return { metadata: { ...meta, generation: generationOf(listing) }, spec };
};

/** The default factory's object: on `repo`, offering every workflow (no `workflows`), hiring no one, keeping no file. */
export const defaultFactoryObject = (repo: string, home: string): FactoryObject =>
  objectOf(
    { name: DEFAULT_NAMESPACE, creationTimestamp: bornAt(home) },
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
 * The store's factories, each factory's file at the store `home` read once, and the places a harness does not trust, read live of the
 * factories `placesOf` keeps — none unless asked, since only a Factory's status says them. No run is read: what a schedule fired is the
 * schedules' own read (`scheduleList`).
 */
export const factoriesListed = Effect.fn('factoriesListed')(function* (
  home: string,
  placesOf: (listing: FactoryListing) => boolean = () => false,
) {
  const factories = yield* doorAt(home, (door) => door.factories.listed());
  const listed: FactoryListed = { factories, untrusted: yield* untrustedPlaces(factories.filter(placesOf)) };
  return listed;
});

/**
 * The record the Factory door reads under `name` at the store `home` where no listing of the store's has it: the default factory's, or
 * `Missing` (`noFactory`) for a name no factory has.
 */
const unlisted = (home: string, name: string): Effect.Effect<DefaultFactory, Missing> =>
  doorAt(home, (door) => door.factories.read(FactoryName.read(name))).pipe(
    Effect.mapError(() => noFactory(name)),
    Effect.flatMap((record) => (isDefaultFactory(record) ? Effect.succeed(record) : Effect.fail(noFactory(name)))),
  );

/**
 * The factory `name` as its parts read it (`filedOf`), the default on `repo`, read now at the store `home`, with its listing (none for
 * the default factory, which the door answers as its record): `Missing` where none has the name. One read of the store's factories, and
 * none of git or of a run.
 */
export const factoryFiled = Effect.fn('factoryFiled')(function* (home: string, repo: string, name: string) {
  const listing = (yield* factoriesListed(home)).factories.find((l) => l.name === name);
  if (listing !== undefined) {
    const filed: Filed = { factory: filedOf(listing, home), listing };
    return filed;
  }
  yield* unlisted(home, name);
  const filed: Filed = { factory: defaultFactoryObject(repo, home), listing: undefined };
  return filed;
});

/** A page of the factories (`FactoryList`), the default on `repo`, read now at the store `home`. */
export const factoryList = Effect.fn('factoryList')(function* (home: string, repo: string, query: ObjectQuery) {
  const objects = factoryObjectsOf(yield* factoriesListed(home, () => true), repo, home);
  const listed: FactoryList = yield* objectsListed('Factory', objects, query, 'factory');
  return listed;
});

/** The factory `name` as an object, the default on `repo`, read now at the store `home`; `Missing` where none has the name. */
export const factoryObject = Effect.fn('factoryObject')(function* (home: string, repo: string, name: string) {
  const listed = yield* factoriesListed(home, (l) => l.name === name);
  const listing = listed.factories.find((l) => l.name === name);
  if (listing !== undefined) return factoryObjectOf(listing, listed, home);
  yield* unlisted(home, name);
  return defaultFactoryObject(repo, home);
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
export const factoryCommands = (factory: FiledFactory, schedules: readonly string[]): FactoryCommands => {
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

/**
 * The lines of the factory `name` (`factoryCommands`), read now at `home`, each schedule its file holds taken back by its workflow, by
 * name: none for the default factory or a file that does not read. `Missing` where no factory has the name.
 */
export const factoryCommandsOf = Effect.fn('factoryCommandsOf')(function* (home: string, repo: string, name: string) {
  const { factory, listing } = yield* factoryFiled(home, repo, name);
  const scheduled = listing === undefined || 'error' in listing ? [] : Object.keys(listing.schedules).sort(byText);
  return factoryCommands(factory, scheduled);
});
