/**
 * The factories' judgement over what the store holds of them: a factory is a record of the keyspace, `/registry/factories/<name>`, whose
 * value is the text of the file it was — `{ "volumes": [...], "workflows": [...], "hires": {...} }`, every key a later `nemia` writes
 * kept — and this file reads and judges those texts as a snapshot of them (`FactoryHeld`): read (`readFactoriesAt`, `readFactoryAt`),
 * what a filing (`createdFactory`) or a write back (`rewriteFactoryAt`) would write, a removal's refusals (`removedFactory`), and, once, a
 * record an earlier release wrote moved into one list of volumes (`volumesMovedAt`). It writes no record: the Factory door's records
 * layer (`records.store.ts`) holds the snapshot and writes what these answer, in one transaction where several belong together; a
 * templated factory's tree is files, and a write back of its wiring writes the tree. A person's verbs are their one writer; the judgement
 * is `factory.ts`'s words and `wiring.ts`'s decision.
 *
 * Beneath the controllers, beside `record.store.ts`, the one store file it imports; `runner.ts` re-exports what the package exports of it.
 */
import { DEFAULT_NAMESPACE } from 'objects';
import fs from 'node:fs';
import path from 'node:path';
import { Option, Result, Schema } from 'effect';
import {
  ambiguousFactoryRefusal,
  takenFactoryRefusal,
  templateTriggeredDetachRefusal,
  unrenderedTreeRefusal,
  scheduleRepoRefusal,
  scheduleRepoRefusalWords,
  wiredRepo,
  defaultFactoryRefusal,
  defaultStartRefusal,
  factoriesHolding,
  factoryNameRefusal,
  hireRefusal,
  noFactoryLine,
  noFactoryRefusal,
  REVISIONS_POLICIES,
  workflowNameRefusal,
  type Factory,
  type FactoryListing,
  type FactoryWrite,
  type Volume,
  volumeEntry,
} from './factory.ts';
import { volumeOf, volumeRefusal, withVolume } from './volume/volume.ts';
import { volumesFromRepos, type FileVolume } from './from-repos/from-repos.ts';
import { firesOf } from './schedule/schedule.store.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { firstRefusal, isDirectory } from '../record/record.store.ts';
import { CardTriggerSchema, readTreeWiring, statusOf, treeDir, treeTriggersOn, writeTreeWiring } from './applied/applied.store.ts';
import { rewired, wiringRefusal, type WiringChange } from './wiring/wiring.ts';
import { factoryKey, generationWritten } from './door/index.ts';

/**
 * Where the factories' own folders are in the store `home`: `<home>/factories`, beside `runs/` and `inbox/`: a factory's tree, its
 * applied base, its rules and its instruction, where it has them. The default factory has no folder there.
 * @param home The store's root.
 */
export const factoriesDirAt = (home: string) => path.join(home, 'factories');

/** A factory's record as the store holds it: its text, and the revision of the record, which a write back expects. */
type FactoryText = { readonly text: string; readonly revision: number };

/**
 * What the store holds of its factories, at one read: each factory's record by name, and the controller's status of each templated one
 * by name, as the text it was written in. The snapshot every judgement of this file reads, so none reads the keyspace itself.
 */
export type FactoryHeld = {
  /** The store's root, which a templated factory's tree is under. */
  readonly home: string;
  /** Each factory's record, by name. */
  readonly texts: ReadonlyMap<string, FactoryText>;
  /** The controller's status of each templated factory, by name, as its text. */
  readonly statuses: ReadonlyMap<string, string>;
};

/** A schedule as a factory's file holds it (`Schedule`), a key a later `nemia` writes beside its own kept. */
const ScheduleSchema = Schema.StructWithRest(
  Schema.Struct({
    cron: Schema.String,
    brief: Schema.String,
    repo: Schema.optionalKey(Schema.String),
    tz: Schema.optionalKey(Schema.String),
    since: Schema.String,
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

/**
 * A volume as a factory's file holds it (`Volume`): its path, its mark, its name where it stores one, the git URL it was cloned from where
 * it is a clone, and a key a later `nemia` writes.
 */
const VolumeEntrySchema = Schema.StructWithRest(
  Schema.Struct({
    path: Schema.String,
    readOnly: Schema.Boolean,
    name: Schema.optionalKey(Schema.String),
    origin: Schema.optionalKey(Schema.String),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

/**
 * A factory's file: its volumes, none or several, the folders and repositories it reaches (`volumes`), each `{ path, readOnly }`, a name
 * and the git URL it was cloned from where it has them, kept in this file whether or not it is made from a template, since they are the
 * person's and never the template's; the workflows attached to it, each by its folder's name, its hires, a step's
 * `<workflow>/<step>` to an agent's name, and its schedules, by workflow, when it has any, and where its instruction is kept, a path or the
 * store, when it says; whether its runs follow merged revisions, `follow` or `pinned`, when it says (a templated factory says it in its
 * tree's wiring, and this key is not read); the settings of a harness its
 * runs' sessions are given (`harnessSettings`), kept here for the same reason and judged by the model at the door, not on read; the cost
 * line it sets for each workflow it offers (`costLines`), kept here for the same reason; the repository each workflow works on, by folder
 * name (`workflowRepos`), where it is made from no
 * template (one made from a template keeps it in its tree's wiring, as an attach writes it); and the template it was made from, when it was
 * (`nemia factory apply`): its folder, its version and the parameters given; its `generation`, the count of changes to its spec, absent on
 * a file written before the counter; a volume's `name`; its own card triggers, by name (`triggers`), kept here as its schedules are; and
 * the values each label key it names takes (`labelValues`), where it is made from no template (one made from a template keeps them in
 * its tree's wiring, rendered from its manifest). A key a later `nemia` writes is kept.
 */
const FactoryFileSchema = Schema.StructWithRest(
  Schema.Struct({
    volumes: Schema.Array(VolumeEntrySchema),
    workflows: Schema.optionalKey(Schema.Array(Schema.String)),
    hires: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    schedules: Schema.optionalKey(Schema.Record(Schema.String, ScheduleSchema)),
    instruction: Schema.optionalKey(Schema.Union([Schema.Struct({ path: Schema.String }), Schema.Struct({ store: Schema.Literal(true) })])),
    revisions: Schema.optionalKey(Schema.Literals(REVISIONS_POLICIES)),
    harnessSettings: Schema.optionalKey(Schema.Record(Schema.String, Schema.Unknown)),
    costLines: Schema.optionalKey(Schema.Record(Schema.String, Schema.Number)),
    workflowRepos: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    triggers: Schema.optionalKey(Schema.Record(Schema.String, CardTriggerSchema)),
    labelValues: Schema.optionalKey(Schema.Record(Schema.String, Schema.Array(Schema.String))),
    generation: Schema.optionalKey(Schema.Number),
    template: Schema.optionalKey(
      Schema.StructWithRest(
        Schema.Struct({
          source: Schema.String,
          version: Schema.String,
          params: Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
        }),
        [Schema.Record(Schema.String, Schema.Unknown)],
      ),
    ),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

/** A factory's file as it reads, every key it holds kept, so a verb that writes it back drops none. */
type FactoryFile = typeof FactoryFileSchema.Type;

/** A factory's record where it is: what it holds, or why it does not read as a factory (`error`); `absent` where there is none. */
type FileRead = { file: string } & ({ content: FactoryFile } | { error: string } | { absent: true });

/** The keys of a factory's file an earlier release wrote, before one list of volumes: `volumesMovedAt` moves them at the daemon's start. */
const FORMER_KEYS = ['repos', 'origins'] as const;

/** Whether `raw`, a factory's file as JSON, is in the shape an earlier release wrote: a key `volumesMovedAt` moves. */
const isFormer = (raw: unknown): raw is Record<string, unknown> =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw) && FORMER_KEYS.some((k) => k in raw);

/**
 * The record of the factory `name`, read — or why it does not read as one: not JSON, or a record an earlier release wrote, which the
 * daemon moves at its start; `absent` where the store holds none.
 */
function factoryFile(held: FactoryHeld, name: string) {
  const file = factoryKey(name);
  const there = held.texts.get(name);
  if (there === undefined) return { file, absent: true } satisfies FileRead as FileRead;
  let raw: unknown;
  try {
    raw = JSON.parse(there.text);
  } catch (err) {
    return {
      file,
      error: `is not JSON (${(err as Error).message}): nemia factory rm ${name}, then add it again.`,
    } satisfies FileRead as FileRead;
  }
  if (isFormer(raw))
    return {
      file,
      error: `is in the shape an earlier release wrote, its repositories under repos: start the daemon, nemia up, which moves it into one list of volumes once.`,
    } satisfies FileRead as FileRead;
  const decoded = Schema.decodeUnknownResult(FactoryFileSchema)(raw);
  if (Result.isSuccess(decoded)) return { file, content: decoded.success } satisfies FileRead as FileRead;
  const { path: where, words } = firstRefusal(FactoryFileSchema, raw);
  const field = where.length ? `\`${where.map(String).join('.')}\`` : 'the whole';
  return {
    file,
    error: `does not read as a factory: ${field} ${words}. nemia factory rm ${name}, then add it again.`,
  } satisfies FileRead as FileRead;
}

/**
 * The workflows, hires, revisions policy, workflows' repositories and label values of a templated factory `name`: its tree's, none while
 * the tree is not rendered, or why they do not read.
 */
function treeWiringOf(home: string, name: string) {
  const read = readTreeWiring(home, name);
  if ('absent' in read) return { workflows: [], hires: {} };
  if ('error' in read) return read;
  const { workflows, hires, revisions, workflowRepos, labelValues } = read.wiring;
  return {
    workflows,
    hires,
    ...(revisions === undefined ? {} : { revisions }),
    ...(workflowRepos === undefined ? {} : { workflowRepos }),
    ...(labelValues === undefined ? {} : { labelValues }),
  };
}

/**
 * The factory `name` its file's `content` says: none attached, hired or scheduled when the file names none, and where its instruction is
 * kept and whether its runs follow merged revisions only when the file says. A factory made from a template reads its workflows, hires,
 * revisions policy and label values from its tree (`tree`), or why they do not read; its schedules, from its file.
 */
function factoryOf(home: string, name: string, content: FactoryFile) {
  const template = content.template;
  const own = {
    ...(content.revisions === undefined ? {} : { revisions: content.revisions }),
    ...(content.workflowRepos === undefined ? {} : { workflowRepos: content.workflowRepos }),
    ...(content.labelValues === undefined ? {} : { labelValues: content.labelValues }),
  };
  const wiring =
    template === undefined ? { workflows: content.workflows ?? [], hires: content.hires ?? {}, ...own } : treeWiringOf(home, name);
  if ('error' in wiring) return wiring satisfies Factory | { error: string } as Factory | { error: string };
  return {
    name,
    volumes: content.volumes.map(volumeEntry),
    ...wiring,
    schedules: content.schedules ?? {},
    ...(content.instruction === undefined ? {} : { instruction: content.instruction }),
    ...(template === undefined ? {} : { template, tree: treeDir(home, name) }),
    ...(content.harnessSettings === undefined ? {} : { harnessSettings: content.harnessSettings }),
    ...(content.costLines === undefined ? {} : { costLines: content.costLines }),
    ...(content.triggers === undefined ? {} : { triggers: content.triggers }),
    ...(content.generation === undefined ? {} : { generation: content.generation }),
  } satisfies Factory | { error: string } as Factory | { error: string };
}

/**
 * One entry of the list as `nemia factory ls` lists it: the factory its record says, with what the controller last observed of it where
 * it is made from a template (`statusOf`), or why the record does not read as one.
 */
function factoryAt(held: FactoryHeld, name: string) {
  const read = factoryFile(held, name);
  const factory = 'content' in read ? factoryOf(held.home, name, read.content) : { error: 'error' in read ? read.error : '' };
  if ('error' in factory) return { name, file: read.file, error: factory.error } satisfies FactoryListing;
  if (factory.template === undefined) return { ...factory, file: read.file } satisfies FactoryListing;
  const status = statusOf(held.statuses.get(name));
  return {
    ...factory,
    file: read.file,
    status: { applied: status?.version ?? null, conditions: status?.conditions ?? [] },
  } satisfies FactoryListing;
}

/**
 * `nemia factory ls`: every factory in the store, by name — each read as a factory or listed with why, so one bad record hides no other.
 * None when the store holds none.
 * @param held What the store holds of its factories.
 */
export const readFactoriesAt = (held: FactoryHeld) =>
  [...held.texts.keys()].sort().map((name) => factoryAt(held, name)) satisfies FactoryListing[] as FactoryListing[];

/**
 * The clones of `volumes`: each folder kept as a clone, to the URL it is cloned from (`origin`), as `cloned` makes them.
 * @param volumes The volumes, each with its origin where it is a clone.
 */
export const clonesOf = (volumes: readonly Volume[]) =>
  Object.fromEntries(volumes.flatMap((v) => (v.origin === undefined ? [] : [[v.path, v.origin]])));

/**
 * The volumes a factory is given in the store `home`, as `nemia factory add --volume` and `apply --volume` spell them, each
 * `<path|url>:ro|:rw` (`volumeOf`): a path resolved from `cwd`, a git URL the folder its clone is kept in, `<home>/clones/<host>/<path>`,
 * which need not be there yet, with its URL as its origin; in the order given, a path given twice once, the later mark kept, each named
 * as `nemia factory volume add` names one (`withVolume`). None is a factory with no volume. Refused, `Invalid`, every volume named: a
 * spelling `volumeOf` refuses, and a volume `volumeRefusal` refuses among those before it. Git is never asked: the clone, and whether a
 * writable one is a repository, are the caller's.
 * @param home The store's root, under whose `clones/` a URL's clone is kept.
 * @param name The factory's name, said in a refusal.
 * @param given Each `--volume` as typed: `<path|url>:ro` or `<path|url>:rw`.
 * @param cwd The folder a relative path is resolved from.
 */
export function volumesGiven(home: string, name: string, given: readonly string[], cwd: string) {
  let volumes: Volume[] = [];
  const refusals: string[] = [];
  for (const spelled of given) {
    const volume = volumeOf(spelled, cwd, home);
    const refused = typeof volume === 'string' ? volume : volumeRefusal({ name, volumes }, volume, home, (at) => isDirectory(at));
    if (refused !== undefined) refusals.push(refused);
    else if (typeof volume !== 'string') volumes = withVolume({ volumes }, volume).volumes;
  }
  if (refusals.length)
    throw new Invalid({ message: refusals.map((r) => r.replace(' Nothing was changed.', '')).join(' ') + ' Nothing was filed.' });
  return volumes;
}

/**
 * A name a verb that writes a factory refuses: not a slug (`Invalid`), or the default factory (`Conflict`).
 * @param name The factory's name, as typed.
 * @param verb The `nemia factory` verb that writes it, named in the default factory's refusal.
 */
export function refuseName(name: string, verb: FactoryWrite) {
  const bad = factoryNameRefusal(name);
  if (bad) throw new Invalid({ message: bad });
  if (name === DEFAULT_NAMESPACE) throw new Conflict({ message: defaultFactoryRefusal(verb) });
}

/**
 * Whether `volumes` hold no writable one: a factory that works on no repository.
 * @param volumes The factory's volumes.
 */
export const workedOnNone = (volumes: readonly Volume[]) => volumes.every((v) => v.readOnly);

/**
 * The record a filing of `factory` writes into the store `held` holds: its text, a workflow, hire or schedule key only where it names
 * one, filed at generation 1. Refused: a templated factory given workflows, hires or a revisions policy, which its tree holds and is not
 * rendered yet (`Conflict`). A name taken is the keyspace's to refuse, at the create. The name and the factory's invariants are its
 * caller's to check.
 * @param home The store's root, under which a templated factory's tree is.
 * @param factory The factory to file.
 */
export function createdFactory(home: string, factory: Factory) {
  if (factory.template !== undefined && (factory.workflows.length || Object.keys(factory.hires).length || factory.revisions !== undefined))
    throw new Conflict({ message: unrenderedTreeRefusal(factory.name, treeDir(home, factory.name), 'Nothing was filed.') });
  return `${JSON.stringify(fileContentOf(undefined, { ...factory, generation: 1 }), null, 2)}\n`;
}

/**
 * The refusal of a filing under a name the store holds one at already.
 * @param name The factory's name.
 */
export const factoryTaken = (name: string) => new Conflict({ message: takenFactoryRefusal(name, factoryKey(name)) });

/**
 * What the file of `factory` holds, written over `content`, what it held, every key the model does not name kept where it was: its
 * volumes, a key a later `nemia` wrote beside one kept, the list written even where it is empty; its workflows, hires and schedules where
 * the file named the key or the factory names one (made from a template, its
 * workflows, hires, revisions policy and workflows' repositories are its tree's, and the file's are left as they were); where its
 * instruction is kept and its revisions policy where it says, the key gone where it does not; its harness settings where it names any; and
 * its template, the keys a later `nemia` wrote
 * beside it kept.
 */
function fileContentOf(content: FactoryFile | undefined, factory: Factory) {
  const next: Record<string, unknown> = {
    ...content,
    volumes: factory.volumes.map((v) => ({ ...content?.volumes.find((was) => was.path === v.path), ...volumeEntry(v) })),
  };
  const named = (key: string, value: unknown, some: boolean) => {
    if (some || (content !== undefined && key in content)) next[key] = value;
  };
  const kept = (key: string, value: unknown) => {
    if (value === undefined) delete next[key];
    else next[key] = value;
  };
  if ((content?.template ?? factory.template) === undefined) {
    named('workflows', factory.workflows, factory.workflows.length > 0);
    named('hires', factory.hires, Object.keys(factory.hires).length > 0);
    kept('revisions', factory.revisions);
    kept(
      'workflowRepos',
      factory.workflowRepos !== undefined && Object.keys(factory.workflowRepos).length ? factory.workflowRepos : undefined,
    );
  }
  named('schedules', factory.schedules, Object.keys(factory.schedules).length > 0);
  kept('instruction', factory.instruction);
  kept('harnessSettings', factory.harnessSettings);
  kept('costLines', factory.costLines);
  kept('triggers', factory.triggers !== undefined && Object.keys(factory.triggers).length ? factory.triggers : undefined);
  kept('template', factory.template === undefined ? undefined : { ...content?.template, ...factory.template });
  if (factory.generation !== undefined) next.generation = factory.generation;
  return next as FactoryFile;
}

/** That the store has no factory `name`, naming those it has: `Missing`, with what was not done. */
const noFactory = (held: FactoryHeld, name: string, notDone: string) =>
  new Missing({
    message: `${noFactoryLine(
      name,
      readFactoriesAt(held).map((f) => f.name),
    )} ${notDone}`,
  });

/**
 * `nemia factory rm`: the record of the factory `name` to remove, one that does not read included, since removing it is its fix. Refused:
 * the name (`refuseName`), and a name with no factory (`Missing`), naming those there are. Answers the record's key.
 * @param held What the store holds of its factories.
 * @param name The factory's name.
 */
export function removedFactory(held: FactoryHeld, name: string) {
  refuseName(name, 'rm');
  if (!held.texts.has(name)) throw noFactory(held, name, 'Nothing was removed.');
  return factoryKey(name);
}

/**
 * The factory `name`, as a run started in it reads it. Refused: a name that is no slug (`Invalid`), a name with no record (`Missing`,
 * naming the factories there are, then `notDone`, what the caller did not do), and a record that does not read as a factory (`Invalid`,
 * quoting why). The default factory is no record, and is never asked for here.
 * @param held What the store holds of its factories.
 * @param name The factory's name.
 * @param notDone What the caller did not do, said at the end of a refusal; `Nothing was started.` by default.
 */
export function readFactoryAt(held: FactoryHeld, name: string, notDone = 'Nothing was started.') {
  const bad = factoryNameRefusal(name);
  if (bad) throw new Invalid({ message: bad });
  const read = factoryFile(held, name);
  if ('absent' in read) throw noFactory(held, name, notDone);
  if ('error' in read) throw new Invalid({ message: `the factory ${name}: ${read.file} ${read.error}` });
  const factory = factoryOf(held.home, name, read.content);
  if ('error' in factory) throw new Invalid({ message: `the factory ${name}: ${factory.error}` });
  return factory;
}

/**
 * The factory `name`, read as `factory`, with the tree `who` writes into: refused where there is none or it has no tree, made from no
 * template (`Invalid`, naming yours), and where its tree is not rendered yet (`Conflict`, naming the daemon).
 * @param name The factory's name, said in a refusal.
 * @param factory The factory as read, or undefined where none is filed.
 * @param who The command that writes into the tree, named in a refusal.
 */
export function treeChecked<F extends { tree?: string }>(name: string, factory: F | undefined, who: string) {
  const tree = factory?.tree;
  if (factory === undefined || tree === undefined)
    throw new Invalid({
      message: `${who}: the factory ${name} is not made from a template, so it has no tree to write; its workflows are its repositories' and yours. Write yours: \`${who} yours …\`. Nothing was written.`,
    });
  if (!fs.existsSync(tree))
    throw new Conflict({
      message: `${who}: ${name} is made from a template, and its tree is not rendered yet, at ${tree}: start the daemon, nemia up, and try again once nemia factory ls shows it applied. Nothing was written.`,
    });
  return { ...factory, tree };
}

/** The factories of `listing` that read, and the names of those whose record does not. */
function readable(listing: readonly FactoryListing[]) {
  return {
    factories: listing.flatMap((f) => ('error' in f ? [] : [f])),
    unread: listing.flatMap((f) => ('error' in f ? [f.name] : [])),
  } satisfies { factories: Factory[]; unread: string[] };
}

/**
 * The names of the factories of `listing` that read, as a refusal offers them.
 * @param listing The store's factories, each as it reads or with why it does not.
 */
const factoryNamesOf = (listing: readonly FactoryListing[]) => readable(listing).factories.map((f) => f.name) satisfies string[];

/**
 * The refusal of a start that names the default factory, whatever the environment: `Invalid`, naming the factories there are.
 * @param listing The store's factories, each as it reads or with why it does not.
 * @param fix The start's words for naming a factory, `<name>` in them.
 */
export const defaultNamedRefusal = (listing: readonly FactoryListing[], fix: string) =>
  new Invalid({ message: defaultStartRefusal(fix, factoryNamesOf(listing)) });

/**
 * The factory a start of a workflow that names none is made in, found from the folder `at`: the one factory of the store a repository of
 * which holds the folder (`factoriesHolding`), with that repository; none, the default factory, only when none holds it and
 * `defaultStarts` (`StoreConfig`'s `defaultFactoryStarts`). `fix` is the start's words for naming one, `<name>` in them.
 *
 * Refused, `Invalid`, before anything is written: two or more factories holding the folder (`ambiguousFactoryRefusal`); and none holding
 * it (`noFactoryRefusal`). A factory whose record does not read is not looked at, and the refusal of none names it.
 * @param listing The store's factories, each as it reads or with why it does not.
 * @param at The folder the start is made from.
 * @param fix The start's words for naming a factory, `<name>` in them.
 * @param defaultStarts Whether a start that finds no factory goes to the default one.
 */
export function foundFactory(listing: readonly FactoryListing[], at: string, fix: string, defaultStarts: boolean) {
  const { factories, unread } = readable(listing);
  const holding = factoriesHolding(factories, at);
  const [only] = holding;
  if (holding.length === 1 && only !== undefined) return only;
  if (holding.length > 1) throw new Invalid({ message: ambiguousFactoryRefusal(at, holding, fix) });
  if (defaultStarts) return {};
  throw new Invalid({
    message: noFactoryRefusal(
      at,
      factories.map((f) => f.name),
      fix,
      unread,
    ),
  });
}

/** What each verb that changes a factory's file does, as its refusals say it was not done. */
const DONE = {
  attach: 'attached',
  detach: 'detached',
  hire: 'hired',
  fire: 'fired',
  instruction: 'changed',
  instruct: 'written',
  revisions: 'changed',
  schedule: 'scheduled',
  unschedule: 'unscheduled',
  trigger: 'triggered',
  untrigger: 'untriggered',
  upgrade: 'upgraded',
} as const;

/** The wiring a factory's tree holds, as its workflows, hires and revisions policy, for telling whether a rewrite changes it. */
const wiringKey = (wiring: Pick<Factory, 'workflows' | 'hires' | 'revisions' | 'workflowRepos'>) =>
  JSON.stringify([[...wiring.workflows].sort(), wiring.hires, wiring.revisions ?? null, wiring.workflowRepos ?? null]);

/**
 * The wiring of the templated factory `factory` written into its tree's `factory.json` — its workflows, hires, revisions policy and
 * workflows' repositories, every other key kept — where it changes it: the file written, or undefined where it was left as it was.
 * Refused: a tree whose wiring does not read (`Invalid`), and one not rendered yet where the wiring changes (`Conflict`).
 */
function treeRewired(home: string, factory: Factory, notDone: string) {
  const { name } = factory;
  const tree = readTreeWiring(home, name);
  if ('error' in tree) throw new Invalid({ message: `the factory ${name}: ${tree.error} ${notDone}` });
  const was = 'absent' in tree ? { workflows: [], hires: {} } : tree.wiring;
  const { revisions: _was, workflowRepos: _wired, ...rest } = was;
  const wired = factory.workflowRepos !== undefined && Object.keys(factory.workflowRepos).length ? factory.workflowRepos : undefined;
  const next = {
    ...rest,
    workflows: factory.workflows,
    hires: factory.hires,
    ...(factory.revisions === undefined ? {} : { revisions: factory.revisions }),
    ...(wired === undefined ? {} : { workflowRepos: wired }),
  };
  if (wiringKey(was) === wiringKey(next)) return undefined;
  if ('absent' in tree) throw new Conflict({ message: unrenderedTreeRefusal(name, treeDir(home, name), notDone) });
  writeTreeWiring(home, name, next);
  return path.join(treeDir(home, name), 'factory.json');
}

/**
 * What a write back of the factory `factory` into the store `held` writes: its record's text, every key the model does not name kept
 * (`fileContentOf`), and, made from a template, its workflows, hires and revisions policy into its tree's wiring (`factory.json`), every
 * other key of that kept — written here, since a tree is files; its generation one more where the write changes its spec, the tree's
 * wiring included, or `counted` says a change of it was made beside the record, its level (`generationWritten`). A record or a wiring
 * that says what it said already is not written again: `text` is then undefined. Answers the key of what changed — the tree's wiring
 * where that did, else the factory's record — and the text to write. Refused: a factory with no record (`Missing`, then `notDone`), a
 * record or a tree's wiring that does not read (`Invalid`), and a tree's wiring to change before the tree is rendered (`Conflict`). The
 * name and the factory's invariants are its caller's to check.
 * @param held What the store holds of its factories.
 * @param factory The factory to write back.
 * @param notDone What the caller did not do, said at the end of a refusal; `Nothing was written.` by default.
 * @param counted Whether a change of the factory's spec was made beside its record (its level); false by default.
 */
export function rewriteFactoryAt(held: FactoryHeld, factory: Factory, notDone = 'Nothing was written.', counted = false) {
  const { name } = factory;
  const read = factoryFile(held, name);
  if ('absent' in read) throw noFactory(held, name, notDone);
  if ('error' in read)
    throw new Invalid({ message: `the factory ${name}: ${read.file} ${read.error} It was left as it is, and nothing was changed.` });
  const content = read.content;
  const written = generationWritten(factoryOf(held.home, name, content), factory, counted);
  let changed = read.file;
  if ((content.template ?? factory.template) !== undefined) changed = treeRewired(held.home, factory, notDone) ?? changed;
  const after = fileContentOf(content, written);
  const text = JSON.stringify(after) === JSON.stringify(content) ? undefined : `${JSON.stringify(after, null, 2)}\n`;
  return { file: changed, text };
}

/**
 * What a change of the wiring of the factory `name` is refused by before the factory is read, each `Invalid` in the words
 * `wiringRefusal` says it, or the default factory a `Conflict`: a step or an agent that cannot be a hire, a workflow's name that cannot
 * be one, and a factory's name (`refuseName`).
 * @param name The factory's name.
 * @param change The change of its wiring: its verb and what it names.
 */
export function wiringNamesRefused(name: string, change: WiringChange) {
  if (change.verb !== 'fire') {
    const bad =
      change.verb === 'hire'
        ? hireRefusal(change.step, change.agent)
        : workflowNameRefusal(change.verb === 'trigger' || change.verb === 'untrigger' ? change.name : change.workflow);
    if (bad) throw new Invalid({ message: `${bad} Nothing was ${DONE[change.verb]}.` });
  }
  refuseName(name, change.verb);
}

/**
 * `factory` after `change`, refused before anything is written: a templated factory's tree not rendered yet, where the change is to
 * its workflows or hires (`Conflict`); what `wiringRefusal` refuses; and what `onDisk` refuses of it — a fact of the disk or the clock.
 * @param factory The factory as read.
 * @param change The change of its wiring: its verb and what it names.
 * @param onDisk What a fact of the disk or the clock refuses of the factory, or undefined; refuses nothing by default.
 */
export function wiringChecked(factory: Factory, change: WiringChange, onDisk: (factory: Factory) => Error | undefined = () => undefined) {
  const tree = factory.tree;
  const own = ['schedule', 'unschedule', 'trigger', 'untrigger'].includes(change.verb);
  if (tree !== undefined && !own && !fs.existsSync(path.join(tree, 'factory.json')))
    throw new Conflict({ message: unrenderedTreeRefusal(factory.name, tree, `Nothing was ${DONE[change.verb]}.`) });
  const judged = wiringRefusal(factory, change);
  if (judged) throw judged.kind === 'Missing' ? new Missing({ message: judged.message }) : new Invalid({ message: judged.message });
  const templated = tree !== undefined && change.verb === 'detach' ? treeTriggersOn(tree, change.workflow) : [];
  const unowned = templated.filter((t) => factory.triggers === undefined || !Object.hasOwn(factory.triggers, t));
  if (unowned.length && change.verb === 'detach')
    throw new Invalid({ message: templateTriggeredDetachRefusal(factory.name, change.workflow, unowned) });
  const bad = onDisk(factory);
  if (bad) throw bad;
  return rewired(factory, change);
}

/**
 * Why the schedule `opts` cannot be written into `factory`, or undefined, beyond what `wiringRefusal` judges, each ending in what was not
 * done: a cron or zone `Cron` does not read, or a cron that never fires, quoting it (`firesOf`); an empty brief; and what
 * `scheduleRepoRefusal` refuses of its repository — a `repo` set or changed, which is retired, or a workflow the factory's wiring places
 * on none of its repositories (`wiredRepo`) — naming the `nemia factory attach` that places its runs.
 */
function scheduleRefusal(factory: Factory, opts: { workflow: string; cron: string; brief: string; repo?: string; tz?: string }) {
  const notDone = 'Nothing was scheduled.';
  const fires = firesOf(opts, Date.now());
  if ('error' in fires) return `--cron ${JSON.stringify(opts.cron)}${opts.tz ? ` --tz ${opts.tz}` : ''}: ${fires.error}. ${notDone}`;
  if (!opts.brief.trim())
    return `A scheduled run is asked what --brief says, and it is empty: give the brief its runs start with. ${notDone}`;
  const wired = wiredRepo(factory, opts.workflow);
  const repoNow = factory.schedules[opts.workflow]?.repo;
  const refused = scheduleRepoRefusal({
    ...(repoNow === undefined ? {} : { repoNow: path.resolve(repoNow) }),
    ...(opts.repo === undefined ? {} : { repoSent: path.resolve(opts.repo) }),
    wired: 'repo' in wired,
  });
  if (refused === null) return undefined;
  return scheduleRepoRefusalWords(factory, opts.workflow, refused, 'refused' in wired ? wired.refused : undefined);
}

/**
 * The schedule `opts` asks for, stamped with when it was written (`since`); a retired `repo`, which `scheduleRefusal` lets through only
 * as an old schedule's sent back as it is, kept resolved.
 * @param opts The cron, the brief, the retired repository and the time zone, where given.
 */
export const scheduleOf = (opts: { cron: string; brief: string; repo?: string; tz?: string }) => ({
  cron: opts.cron,
  brief: opts.brief,
  ...(opts.repo === undefined ? {} : { repo: path.resolve(opts.repo) }),
  ...(opts.tz === undefined ? {} : { tz: opts.tz }),
  since: new Date().toISOString(),
});

/**
 * What `scheduleRefusal` refuses of the schedule `opts` in `factory`, as the refusal a schedule throws (`Invalid`), or undefined.
 * @param factory The factory the schedule is written into.
 * @param opts The workflow's folder name, the cron, the brief, the retired repository and the time zone, where given.
 */
export function scheduleRefused(factory: Factory, opts: { workflow: string; cron: string; brief: string; repo?: string; tz?: string }) {
  const bad = scheduleRefusal(factory, opts);
  return bad === undefined ? undefined : new Invalid({ message: bad });
}

/** What the move of a store's factory files did: each file it moved, and each it left as it was, with why. */
export type VolumesMoved = { readonly moved: readonly string[]; readonly left: readonly { file: string; why: string }[] };

/** The keys of a factory's file the move reads, as an earlier release wrote them, each of the shape `volumesFromRepos` reads. */
const FormerKeysSchema = Schema.Struct({
  repos: Schema.optionalKey(Schema.Array(Schema.String)),
  origins: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  volumes: Schema.optionalKey(Schema.Array(VolumeEntrySchema)),
});

/** Whether `xs` names each of its strings once: what `volumesFromRepos` asks of a file's repositories and of its volumes' paths. */
const once = (xs: readonly string[]) => new Set(xs).size === xs.length;

/**
 * The factory records of the store `held` an earlier release wrote, each to be moved once into one list of volumes (`volumesFromRepos`):
 * its repositories become writable volumes, first and in their order, each with the URL it was cloned from, its extra folders read-only
 * after them, `repos` and `origins` taken out and every other key kept, its generation as it was, since what the factory reaches is
 * unchanged. A record already in one list is not answered: run at every start of the daemon, it finishes what a start before it began.
 * A record whose keys do not read, or that names a repository twice or a volume at a repository's path (`volumesFromRepos`'
 * `requires`), is left as it is, with why; it then reads as a record in the earlier shape, naming `nemia up`. Answers each record to
 * write, by name, and the keys of those it moves and of those it leaves.
 * @param held What the store holds of its factories.
 */
export function volumesMovedAt(held: FactoryHeld) {
  const moved: string[] = [];
  const left: { file: string; why: string }[] = [];
  const writes: { name: string; text: string }[] = [];
  for (const name of [...held.texts.keys()].sort()) {
    const file = factoryKey(name);
    const json = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))(held.texts.get(name)?.text ?? '');
    if (Option.isNone(json)) continue;
    const raw = json.value;
    if (!isFormer(raw)) continue;
    const keys = Schema.decodeUnknownResult(FormerKeysSchema)(raw);
    if (Result.isFailure(keys)) {
      left.push({ file, why: "its repos, origins or volumes do not read as a factory's: fix them by hand, then start the daemon again" });
      continue;
    }
    const repos = keys.success.repos ?? [];
    const paths = (keys.success.volumes ?? []).map((v) => v.path);
    if (!once(repos) || !once(paths) || paths.some((p) => repos.includes(p))) {
      left.push({
        file,
        why: 'it names a repository twice, a volume twice, or a volume at one of its repositories: take the one out by hand, then start the daemon again',
      });
      continue;
    }
    const kept: Record<string, unknown> = { ...raw };
    for (const key of FORMER_KEYS) delete kept[key];
    const former = keys.success.volumes ?? [];
    const volumes = volumesFromRepos(keys.success).map((v: FileVolume) => ({
      ...former.find((was) => was.path === v.path),
      ...v,
    }));
    writes.push({ name, text: `${JSON.stringify({ ...kept, volumes }, null, 2)}\n` });
    moved.push(file);
  }
  return { moved, left, writes };
}
