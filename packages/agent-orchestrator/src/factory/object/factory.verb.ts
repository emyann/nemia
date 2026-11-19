/**
 * The factories as objects (`Factory`, `FactoryList`, from `objects`), cluster-scoped: the default factory first, on no repository,
 * offering every workflow, hiring no one and keeping no file; then each factory of the store as `nemia
 * factory` lists it (`factoriesListed`), a file that does not read listed all the same, its `status.error` saying why, so it hides no
 * other. A factory's parts read it through `factoryFiled`: its spec and its listing, off one read of the store's factories, no status, and
 * no run. A factory's `metadata.generation` is its file's count of changes to its spec (`generationOf`); its status the controller's
 * `status.json` (its conditions, each with the time it last moved, the generation that pass observed, the version applied and an upgrade
 * waiting) and its places a harness does not trust, read live; its `resourceVersion` a digest of its encoded spec, and of its rules and
 * its instruction, the sub-resources read beside it (`partsOf`), never of its status: an edit of its rules or its instruction moves it as
 * a write of its spec does, so a proposal read before either goes stale, and a controller's pass, which writes only the status, moves
 * nothing, so a Factory proposal recorded in that status stays fresh. That is Kubernetes' `metadata.generation`, which counts changes to
 * an object's desired state and which a status write never moves; a watch tells a change of the status by the status itself. And
 * `factoryCommands`, the lines a person types for one factory, built off the command table as the board read them before. And
 * `factoryHomeOf`, a factory's home read whole for a client to render (`GET /api/factories/<name>/home`): every file of its tree's
 * `home/`, read and refused as a run's start reads it (`homeFilesOf`), and the digest the run's copy of the same files is named by.
 *
 * Every kind of a factory's parts is listed the one way (`objectsListed`, `src/object/listed.verb.ts`).
 */
import { Effect } from 'effect';
import {
  API_VERSION,
  COMMAND_WORDS,
  DEFAULT_NAMESPACE,
  type Factory as FactoryObject,
  type FactoryHome,
  type FactoryList,
  type FactoryStatus,
  type ObjectMeta,
} from 'objects';
import { readStatus } from '../applied/applied.store.ts';
import { declaredAt } from '../applied/declared.verb.ts';
import type { Parameter } from '../../template/index.ts';
import { commandLine } from '../../command/command.ts';
import { COMMANDS } from '../../command/commands.verb.ts';
import { generationOf } from '../door/generation.ts';
import type { FactoryListing } from '../factory.ts';
import type { InstructionRead } from '../instruction.store.ts';
import type { RulesRead } from '../rules/rules.store.ts';
import { doorAt, doorAtOnce, FactoryDoor } from '../door/factories.store.ts';
import { fromThrow as tried } from '../../door/door.store.ts';
import { homeAt, homeFilesOf, workflowFilesDigest } from '../../frozen/frozen.store.ts';
import { FactoryName, isDefaultFactory } from '../factory.model.ts';
import { untrustedPlaces } from '../../trust/untrusted.verb.ts';
import type { Untrusted } from '../../trust/trust.ts';
import { Invalid, Missing } from '../../refusal/refusal.ts';
import { factoryVolumesNamed } from '../volume/volume.ts';
import { bornAt, objectsListed, versionOf, type ObjectQuery } from '../../object/listed.verb.ts';

/** Two texts in the order `<` compares them. */
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

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
const untrustedOf = (untrusted: readonly Untrusted[], name: string) =>
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
const isBlank = (read: { words: string | null; error: string | null }) => read.words === null && read.error === null;

/**
 * The rules and the instruction of the factory of `listing`, read at the store `home`, as its version digests them: none where it keeps
 * neither, so a factory with no sub-resource keeps the version of its spec and status alone. Where the instruction's place cannot be said,
 * its error is read.
 */
const partsOf = (listing: Exclude<FactoryListing, { error: string }>, home: string) => {
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

/**
 * A factory's object, of its spec and status and when it was filed: its `resourceVersion` the digest of its spec and its `parts`' where
 * given, never of its status (see the file's head).
 */
const objectOf = (meta: Omit<ObjectMeta, 'resourceVersion'>, spec: FactoryObject['spec'], status: FactoryStatus, parts?: FactoryParts) =>
  ({
    apiVersion: API_VERSION,
    kind: 'Factory',
    metadata: { ...meta, resourceVersion: versionOf(spec, null, parts) },
    spec,
    status,
  }) satisfies FactoryObject;

/**
 * The factory `name`'s own default level, from its level file: none where it follows the store's, an error where the file does not
 * read.
 */
const ownLevel = (home: string, name: string) => {
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
 * @param listing The factory's file as the store listed it, or why it does not read.
 * @param listed The store's listing whole, whose places a harness does not trust are read.
 * @param home The store's root.
 */
export const factoryObjectOf = (listing: FactoryListing, listed: FactoryListed, home: string) => {
  const { metadata, spec } = filedOf(listing, home);
  if ('error' in listing)
    return objectOf(metadata, spec, { conditions: [], untrusted: [], error: `${listing.file} ${listing.error}` }) satisfies FactoryObject;
  const written = readStatus(home, listing.name);
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
  return objectOf(metadata, spec, status, partsOf(listing, home)) satisfies FactoryObject;
};

/**
 * The factory of one `listing` of the store as its parts read it, at the store `home`: a file that reads as its spec, its own level among
 * it; one that does not with no spec but its name's. No status: neither the controller's file nor a harness's trust is read.
 * @param listing The factory's file as the store listed it, or why it does not read.
 * @param home The store's root.
 */
export const filedOf = (listing: FactoryListing, home: string) => {
  const meta = { name: listing.name, creationTimestamp: bornAt(listing.file) };
  if ('error' in listing) return { metadata: meta, spec: { workflows: [], hires: {}, volumes: [] } };
  const level = ownLevel(home, listing.name);
  const spec: FactoryObject['spec'] = {
    workflows: [...listing.workflows],
    hires: { ...listing.hires },
    volumes: factoryVolumesNamed(listing).map(({ name, path, readOnly, origin, claudeMd, skills }) => ({
      name,
      path,
      readOnly,
      ...(origin === undefined ? {} : { origin }),
      ...(claudeMd === undefined ? {} : { claudeMd }),
      ...(skills === undefined ? {} : { skills }),
    })),
    ...harnessSettingsOf(listing.harnessSettings),
    ...(listing.costLines === undefined || Object.keys(listing.costLines).length === 0 ? {} : { costLines: { ...listing.costLines } }),
    ...(listing.workflowRepos === undefined || Object.keys(listing.workflowRepos).length === 0
      ? {}
      : { workflowRepos: { ...listing.workflowRepos } }),
    ...(listing.revisions === undefined ? {} : { revisions: listing.revisions }),
    ...(listing.template === undefined
      ? {}
      : { template: { source: listing.template.source, version: listing.template.version, params: { ...listing.template.params } } }),
    ...('level' in level ? { level: level.level } : {}),
  };
  return { metadata: { ...meta, generation: generationOf(listing) }, spec };
};

/**
 * The default factory's object: with no volume (a volume is a factory's own, given with `nemia factory volume add`), offering every
 * workflow (no `workflows`), hiring no one, keeping no file.
 * @param home The store's root, whose time of birth is the default factory's.
 */
export const defaultFactoryObject = (home: string) =>
  objectOf(
    { name: DEFAULT_NAMESPACE, creationTimestamp: bornAt(home) },
    { hires: {}, volumes: [] },
    { conditions: [], untrusted: [] },
  ) satisfies FactoryObject;

/**
 * Every factory's object: the default, then each of `listed`, read at `home`.
 * @param listed The store's listing of its factories' files.
 * @param home The store's root.
 */
export const factoryObjectsOf = (listed: FactoryListed, home: string) =>
  [defaultFactoryObject(home), ...listed.factories.map((l) => factoryObjectOf(l, listed, home))] satisfies FactoryObject[];

/**
 * The refusal of a factory no object has the name of: it names the list.
 * @param name The name asked for.
 */
export const noFactory = (name: string) =>
  new Missing({
    message: `no factory ${name}: list them with nemia factory (GET /api/factories), or file one with nemia factory add ${name} --volume <path|url>:rw`,
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
const unlisted = (home: string, name: string) =>
  doorAt(home, (door) => door.factories.read(FactoryName.read(name))).pipe(
    Effect.mapError(() => noFactory(name)),
    Effect.flatMap((record) => (isDefaultFactory(record) ? Effect.succeed(record) : Effect.fail(noFactory(name)))),
  );

/**
 * The factory `name` as its parts read it (`filedOf`), read now at the store `home`, with its listing (none for
 * the default factory, which the door answers as its record): `Missing` where none has the name. One read of the store's factories, and
 * none of git or of a run.
 */
export const factoryFiled = Effect.fn('factoryFiled')(function* (home: string, name: string) {
  const listing = (yield* factoriesListed(home)).factories.find((l) => l.name === name);
  if (listing !== undefined) {
    const filed: Filed = { factory: filedOf(listing, home), listing };
    return filed;
  }
  yield* unlisted(home, name);
  const filed: Filed = { factory: defaultFactoryObject(home), listing: undefined };
  return filed;
});

/** A page of the factories (`FactoryList`), the default first, read now at the store `home`. */
export const factoryList = Effect.fn('factoryList')(function* (home: string, query: ObjectQuery) {
  const objects = factoryObjectsOf(yield* factoriesListed(home, () => true), home);
  const listed: FactoryList = yield* objectsListed('Factory', objects, query, 'factory');
  return listed;
});

/** The factory `name` as an object, read now at the store `home`; `Missing` where none has the name. */
export const factoryObject = Effect.fn('factoryObject')(function* (home: string, name: string) {
  const listed = yield* factoriesListed(home, (l) => l.name === name);
  const listing = listed.factories.find((l) => l.name === name);
  if (listing !== undefined) return factoryObjectOf(listing, listed, home);
  yield* unlisted(home, name);
  return defaultFactoryObject(home);
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
 * @param factory The factory as its parts read it.
 * @param schedules The workflows the factory schedules, each by its folder name.
 */
export const factoryCommands = (factory: FiledFactory, schedules: readonly string[]) => {
  const name = factory.metadata.name;
  return {
    attach: commandLine(named('factory attach'), { factory: name }),
    rm: commandLine(named('factory rm'), { factory: name }),
    add: commandLine(named('factory add'), { name }, { volumes: '<path|url>:rw' }),
    schedule: commandLine(named('factory schedule'), { factory: name }, { cron: '<expr>', brief: '<text>' }),
    trust: commandLine(named('factory trust'), { factory: name }),
    volume: commandLine(named('factory volume add'), { factory: name, volume: '<path|url>:ro|:rw' }),
    unschedule: Object.fromEntries(
      schedules.map((workflow) => [workflow, commandLine(named('factory unschedule'), { factory: name, workflow })]),
    ),
    volumeRm: Object.fromEntries(
      factory.spec.volumes.map((v) => [v.name ?? v.path, commandLine(named('factory volume rm'), { factory: name, path: v.path })]),
    ),
  };
};

/**
 * The line that opens a person's own session in the home of the factory `name`, typed in the folder it adds beside it: its optional
 * repository left unsaid. `nemia factory home` is the client's own verb, whose words `objects` holds and this table does not.
 * @param name The factory's name.
 */
const homeLine = (name: string) => {
  const home = COMMAND_WORDS.find((c) => c.name === 'factory home');
  if (home === undefined) throw new Error("No command 'factory home' in objects' COMMAND_WORDS: name one it holds.");
  const positionals = home.spec.positionals.filter((p) => p.takes === 'required');
  return commandLine({ name: home.name, spec: { ...home.spec, positionals } }, { factory: name });
};

/**
 * The lines of the factory `name` (`factoryCommands`), read now at `home`, each schedule its file holds taken back by its workflow, by
 * name, and the line that opens its home where its tree holds one (`homeAt`): none for the default factory or a file that does not
 * read. `Missing` where no factory has the name.
 */
export const factoryCommandsOf = Effect.fn('factoryCommandsOf')(function* (home: string, name: string) {
  const { factory, listing } = yield* factoryFiled(home, name);
  const scheduled = listing === undefined || 'error' in listing ? [] : Object.keys(listing.schedules).sort(byText);
  const tree = listing === undefined || 'error' in listing ? undefined : listing.tree;
  const commands = { ...factoryCommands(factory, scheduled), ...(homeAt(tree) === undefined ? {} : { home: homeLine(name) }) };
  const template = listing === undefined || 'error' in listing ? undefined : listing.template;
  if (template === undefined) return commands;
  const declared = yield* declaredAt(template.source).pipe(Effect.orElseSucceed(() => ({})));
  const follow = followOf(name, template.version, declared);
  return follow === undefined ? commands : { ...commands, follow };
});

/**
 * The first parameter of `declared` that follows a host (`whenOrigin`), with the line that previews the factory `name` at `version` with it
 * set true (`nemia factory diff`), which prints the upgrade's line to type; none where no boolean of it follows one.
 * @param name The factory's name.
 * @param version The template's version the factory is applied at.
 * @param declared The parameters its template declares, by name.
 */
export const followOf = (name: string, version: string, declared: Readonly<Record<string, Parameter>>) => {
  const found = Object.entries(declared)
    .sort(([a], [b]) => byText(a, b))
    .find(([, p]) => p.type === 'boolean' && p.whenOrigin !== undefined);
  if (found === undefined || found[1].whenOrigin === undefined) return undefined;
  const [parameter, { whenOrigin: host }] = found;
  return { host, parameter, line: commandLine(named('factory diff'), { factory: name }, { to: version, sets: `${parameter}=true` }) };
};

/**
 * The home of the factory `name`: its files sorted by path, each its permission bits and its bytes in base64, and their digest. Refused
 * `Missing` where no factory has the name, where it has no tree (made by hand, or the default factory) and where its tree holds no
 * `home/`, each naming what to type; `Invalid` where the home holds a link or what is neither a file nor a folder, as a run's start is.
 */
export const factoryHomeOf = Effect.fn('factoryHomeOf')(function* (name: string) {
  const door = yield* FactoryDoor;
  const record = yield* door.factories.read(FactoryName.read(name));
  const tree = isDefaultFactory(record) ? undefined : record.tree;
  if (tree === undefined)
    return yield* Effect.fail(
      new Missing({
        message: `${name} has no home: it was not made from a template, and a home is a template's. Take it over by one that gives a home/ (nemia factory diff ${name} --template <folder|archive>, then nemia factory adopt), then open it again.`,
      }),
    );
  const files = yield* tried(() => homeFilesOf(tree));
  if (files === undefined)
    return yield* Effect.fail(
      new Missing({
        message: `${name} has no home: its tree (${tree}) holds no home/, which its template does not give. Upgrade it onto a version of its template that does (nemia factory upgrade ${name} --to <x.y.z>), then open it again.`,
      }),
    );
  return {
    name,
    digest: workflowFilesDigest(files),
    files: files.map((f) => ({ path: f.path, mode: f.mode, content: Buffer.from(f.bytes).toString('base64') })),
  } satisfies FactoryHome;
});
