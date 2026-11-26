/**
 * The store's library as a factory reads it, from the files: what a factory has added (its record, else what its workflows resolve today),
 * what each add is, who uses a library item, and an add written or taken back, judged by `libraryAddRefusal`. Everything is read from disk
 * on each call, and a read writes nothing: a factory with no record keeps its adds derived until its first add or removal writes the record
 * whole.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { API_VERSION, type DefinitionOrigin, type LibraryAdd, type LibraryAddList } from 'objects';
import { AGENTS_FOLDER, SKILLS_FOLDER } from '../step/step.ts';
import { DEFAULT_NAMESPACE, type Factory, type FactoryListing, workedOn } from '../factory/factory.ts';
import { listedAt } from '../factory/door/factories.store.ts';
import { fromThrow } from '../door/door.store.ts';
import { stepSkillsNamed, stepsFilled } from '../roster/fills.store.ts';
import { frontmatterKey } from '../former/former.ts';
import { BUILTIN_SKILLS, REPOSITORY_HOLDER } from '../skills/read.store.ts';
import { builtinServers, BUILTIN_SERVERS } from '../factory/servers/servers.store.ts';
import { Effect } from 'effect';
import { Missing, type Refusal } from '../refusal/refusal.ts';
import { objectsListed, type ObjectQuery } from '../object/listed.verb.ts';
import { tried } from '../runtime-client.ts';
import { StoreRoot } from '../config/root.store.ts';
import type { BuiltinServer, FactoryServer } from '../factory/servers/index.ts';
import { addName, libraryAddRefusal, libraryAddState, libraryAddsOf, sameAdd, type LibraryRef } from './library.ts';
import { libraryAddsFile, libraryDir, libraryServers, readLibraryAdds, writeLibraryAdds } from './library.store.ts';

/**
 * When the factory `name`'s adds were last recorded, or the epoch where they never were.
 * @param home The store's root.
 * @param name The factory's name, `default` among them.
 */
export const recordedAt = (home: string, name: string) =>
  (fs.statSync(libraryAddsFile(home, name), { throwIfNoEntry: false })?.mtime ?? new Date(0)).toISOString();

/** A factory's adds, and whether they are its record's (`recorded`) or derived from what its workflows resolve today. */
export type FactoryAdds = { readonly recorded: boolean; readonly adds: readonly LibraryRef[] };

/** The factory `name` as its record reads in `listing`, or undefined for `default`, which has no record, and for one that does not read. */
const factoryNamed = (listing: readonly FactoryListing[], name: string) => {
  const found = listing.find((f) => f.name === name);
  return found === undefined || 'error' in found ? undefined : found;
};

/** Whether `file` is directly in the folder `dir`, by resolved path. */
const inFolder = (file: string, dir: string) => path.dirname(path.resolve(file)) === path.resolve(dir);

/** Whether the library holds a skill of `name`: the person's, or a builtin. */
const librarySkill = (home: string, name: string) => {
  const holds = (dir: string) => fs.statSync(path.join(dir, name, 'SKILL.md'), { throwIfNoEntry: false })?.isFile() === true;
  if (holds(path.join(libraryDir(home), SKILLS_FOLDER))) return 'user';
  return holds(BUILTIN_SKILLS) ? 'builtin' : undefined;
};

/** The skills the agent file `file` gives, as its `skills:` line lists them; none for a file that cannot be read. */
const givenSkills = (file: string) => {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  return (frontmatterKey(text, 'skills') ?? '')
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

/** The repositories the factory `name` is read on, or one undefined for the store's workflows alone; none for a factory with no file. */
function filledPlaces(listing: readonly FactoryListing[], name: string) {
  const factory = name === DEFAULT_NAMESPACE ? undefined : factoryNamed(listing, name);
  if (name !== DEFAULT_NAMESPACE && factory === undefined) return undefined;
  const repos = factory === undefined || workedOn(factory).length === 0 ? [undefined] : workedOn(factory);
  return { factory, repos };
}

/** Each of `read` over the places of the factory `name`, a place that cannot be listed skipped. */
function overPlaces<T>(
  listing: readonly FactoryListing[],
  name: string,
  read: (repo: string | undefined, factory: Factory | undefined) => T[],
) {
  const places = filledPlaces(listing, name);
  if (places === undefined) return [];
  return places.repos.flatMap((repo) => {
    try {
      return read(repo, places.factory);
    } catch {
      return [];
    }
  });
}

/** The files of the agents the steps of the factory `name` are credited to (`stepsFilled`), on each of its repositories. */
const filledFiles = (listing: readonly FactoryListing[], home: string, name: string) =>
  new Set(overPlaces(listing, name, (repo, factory) => stepsFilled(repo, home, factory).map((filled) => path.resolve(filled.file))));

/**
 * The library items the factory `name` resolves today, from the steps it fills: each library agent a step is credited to (`stepsFilled`,
 * the file a start would run), each skill an agent that fills a step gives, and each a step names on its own `skills:` line, that the
 * library holds.
 * @param listing The store's factories, as the Factory door lists them.
 * @param home The store's root.
 * @param name The factory's name, `default` among them.
 */
function derivedAddsIn(listing: readonly FactoryListing[], home: string, name: string) {
  const files = filledFiles(listing, home, name);
  const agentsDir = path.join(libraryDir(home), AGENTS_FOLDER);
  const adds: LibraryRef[] = [];
  const add = (ref: LibraryRef) => {
    if (!adds.some((a) => sameAdd(a, ref))) adds.push(ref);
  };
  for (const file of [...files].sort()) {
    if (inFolder(file, agentsDir)) add({ kind: 'Agent', name: path.basename(file, '.md') });
    for (const skill of givenSkills(file)) if (!skill.includes(':') && librarySkill(home, skill)) add({ kind: 'Skill', name: skill });
  }
  for (const skill of overPlaces(listing, name, (repo, factory) => stepSkillsNamed(repo, home, factory)))
    if (!skill.includes(':') && librarySkill(home, skill)) add({ kind: 'Skill', name: skill });
  return adds;
}

/**
 * The factory `name`'s adds as `listing` reads: its record's where it has one, else those derived from its workflows (`libraryAddsOf`).
 * @param listing The store's factories, as the Factory door lists them.
 * @param home The store's root.
 * @param name The factory's name, `default` among them.
 */
function addsIn(listing: readonly FactoryListing[], home: string, name: string) {
  const recorded = readLibraryAdds(home, name);
  return {
    recorded: recorded !== undefined,
    adds: libraryAddsOf(recorded, recorded === undefined ? derivedAddsIn(listing, home, name) : []),
  };
}

/**
 * The factory `name`'s adds: its record's where it has one, else those derived from its workflows (`libraryAddsOf`), the factories read
 * through the Factory door.
 * @param home The store's root.
 * @param name The factory's name, `default` among them.
 */
export const factoryAdds = (home: string, name: string) =>
  Effect.flatMap(listedAt(home), (listing) => fromThrow(() => addsIn(listing, home, name)));

/**
 * Where the library holds the item `ref`: the person's (`user`), a builtin, or undefined where it holds none.
 * @param home The store's root.
 * @param ref The item, by its kind and its name.
 */
function libraryOrigin(home: string, ref: LibraryRef) {
  if (ref.kind === 'Skill') return librarySkill(home, ref.name) satisfies DefinitionOrigin | undefined as DefinitionOrigin | undefined;
  if (ref.kind === 'Agent')
    return (fs.statSync(path.join(libraryDir(home), AGENTS_FOLDER, `${ref.name}.md`), { throwIfNoEntry: false })?.isFile()
      ? 'user'
      : undefined) satisfies DefinitionOrigin | undefined as DefinitionOrigin | undefined;
  if (libraryServers(home)[ref.name] !== undefined) return 'user' satisfies DefinitionOrigin | undefined as DefinitionOrigin | undefined;
  return (builtinServers(BUILTIN_SERVERS).some((s) => s.name === ref.name) ? 'builtin' : undefined) satisfies
    | DefinitionOrigin
    | undefined as DefinitionOrigin | undefined;
}

/**
 * The origins of the factory `name`'s own that hold the item `ref` first: its tree's (`factory`), or its repository's (`repo`).
 * @param home The store's root.
 * @param name The factory's name.
 * @param ref The item.
 */
function ownOrigins(listing: readonly FactoryListing[], name: string, ref: LibraryRef) {
  const factory = name === DEFAULT_NAMESPACE ? undefined : factoryNamed(listing, name);
  if (factory === undefined || ref.kind === 'McpServer') return [] satisfies DefinitionOrigin[] as DefinitionOrigin[];
  const at = (root: string) =>
    ref.kind === 'Agent'
      ? fs.existsSync(path.join(root, AGENTS_FOLDER, `${ref.name}.md`))
      : fs.existsSync(path.join(root, SKILLS_FOLDER, ref.name, 'SKILL.md'));
  const out: DefinitionOrigin[] = [];
  if (factory.tree !== undefined && at(path.join(factory.tree, 'workflows'))) out.push('factory');
  if (workedOn(factory).some((repo) => at(path.join(path.resolve(repo), REPOSITORY_HOLDER)))) out.push('repo');
  return out satisfies DefinitionOrigin[];
}

/** What to do about an add the library no longer holds. */
const missingFix = (factory: string, ref: LibraryRef) =>
  `${ref.kind} ${ref.name} is no longer in the library: make it again there, or take the add off with nemia library rm ${ref.kind} ${ref.name} --factory ${factory}.`;

/**
 * The add `ref` of the factory `name` as an object, with what it is there, the factories as `listing` reads them.
 * @param listing The store's factories, as the Factory door lists them.
 * @param home The store's root.
 * @param name The factory's name.
 * @param ref The add.
 * @param recorded Whether the factory's adds are its record's.
 */
function addObjectIn(listing: readonly FactoryListing[], home: string, name: string, ref: LibraryRef, recorded: boolean) {
  const held = libraryOrigin(home, ref);
  const own = ownOrigins(listing, name, ref);
  const state = libraryAddState([...own, ...(held === undefined ? [] : [held])]);
  const shadowedBy = state === 'shadowed' ? own[0] : undefined;
  return {
    apiVersion: API_VERSION,
    kind: 'LibraryAdd',
    metadata: {
      name: addName(ref),
      namespace: name,
      creationTimestamp: recordedAt(home, name),
      resourceVersion: `sha256:${createHash('sha256')
        .update(JSON.stringify([ref.kind, ref.name, recorded]))
        .digest('hex')}`,
    },
    spec: { kind: ref.kind, name: ref.name },
    status: {
      state,
      recorded,
      ...(shadowedBy !== undefined && { shadowedBy }),
      ...(held !== undefined && { origin: held }),
      ...(state === 'missing' && { message: missingFix(name, ref) }),
    },
  } satisfies LibraryAdd as LibraryAdd;
}

/**
 * The add `ref` of the factory `name` as an object, with what it is there, the factories read through the Factory door.
 * @param home The store's root.
 * @param name The factory's name.
 * @param ref The add.
 * @param recorded Whether the factory's adds are its record's.
 */
export const libraryAddObject = (home: string, name: string, ref: LibraryRef, recorded: boolean) =>
  Effect.flatMap(listedAt(home), (listing) => fromThrow(() => addObjectIn(listing, home, name, ref, recorded)));

/**
 * The add named `addname`, `<kind>.<name>`, read as a reference; undefined where it names no kind of the library.
 * @param addname The add's object name.
 */
export function refOf(addname: string) {
  const dot = addname.indexOf('.');
  const kind = addname.slice(0, dot);
  const name = addname.slice(dot + 1);
  if (dot < 1 || !name || (kind !== 'Agent' && kind !== 'Skill' && kind !== 'McpServer')) return undefined;
  return { kind, name } satisfies LibraryRef | undefined;
}

/**
 * Adds the item `ref` to the factory `name`, or takes the add off, writing its record whole from what it holds now (derived, where it has
 * no record yet). Refused (`Missing`) as `libraryAddRefusal` refuses: an add of what the library does not hold, a removal of what was
 * never added.
 * @param home The store's root.
 * @param name The factory's name, `default` among them.
 * @param does Whether the item is added or its add taken off.
 * @param ref The item.
 */
export const writeLibraryAdd = Effect.fn('writeLibraryAdd')(function* (
  home: string,
  name: string,
  does: 'add' | 'remove',
  ref: LibraryRef,
) {
  const listing = yield* listedAt(home);
  const { adds } = yield* tried(() => addsIn(listing, home, name));
  const added = adds.some((a) => sameAdd(a, ref));
  const refused = libraryAddRefusal(does, libraryOrigin(home, ref) !== undefined, added);
  if (refused !== null) return yield* Effect.fail(new Missing({ message: refused.message }));
  const now = does === 'add' ? (added ? adds : [...adds, ref]) : adds.filter((a) => !sameAdd(a, ref));
  yield* tried(() => writeLibraryAdds(home, name, now));
  return yield* tried(() => addObjectIn(listing, home, name, ref, true) satisfies LibraryAdd);
});

/**
 * The factories that use the library item `ref`: each whose adds hold it (its record, else derived from the steps it fills), `default`
 * among them; and for a workflow (`kind` Workflow), each factory that attaches it. Sorted.
 * @param home The store's root.
 * @param ref The item, or a workflow by its name.
 */
export const libraryUsers = (home: string, ref: LibraryRef | { readonly kind: 'Workflow'; readonly name: string }) =>
  Effect.map(listedAt(home), (listing) => {
    const factories = listing.filter((f): f is Factory & { file: string } => !('error' in f));
    if (ref.kind === 'Workflow')
      return factories
        .filter((f) => f.workflows.includes(ref.name))
        .map((f) => f.name)
        .sort();
    const libraryRef = ref;
    return [DEFAULT_NAMESPACE, ...factories.map((f) => f.name)]
      .filter((name) => {
        try {
          return addsIn(listing, home, name).adds.some((a) => sameAdd(a, libraryRef));
        } catch {
          return false;
        }
      })
      .sort();
  });

/**
 * Each factory's library adds as the tick's pass reads them, for the feed (`addsLines`): for `default` and every factory that records its
 * adds, whether one is `missing`, and each missing add's fix, joined. A record that does not read is said missing too, its refusal's
 * words the fix, since it gates every name. A factory with no record is left out: its adds are what it runs.
 * @param home The store's root.
 */
export const addsMissingNow = (home: string) =>
  Effect.map(listedAt(home), (listing) => {
    const listed = listing.flatMap((f) => ('error' in f ? [] : [f.name]));
    return [...new Set([DEFAULT_NAMESPACE, ...listed])].flatMap((factory) => {
      let adds: readonly LibraryRef[] | undefined;
      try {
        adds = readLibraryAdds(home, factory);
      } catch (e) {
        return [{ factory, missing: true, message: e instanceof Error ? e.message : String(e) }];
      }
      if (adds === undefined) return [];
      const fixes = adds.flatMap((ref) => addObjectIn(listing, home, factory, ref, true).status.message ?? []);
      return [{ factory, missing: fixes.length > 0, ...(fixes.length > 0 && { message: fixes.join(' ') }) }];
    });
  });

/**
 * The library's MCP servers the factory `name` has added, by name: the person's record of each, else Nemia's builtin of that name. None
 * for a factory with no record of its adds, since the library held no server before adds were recorded.
 * @param home The store's root.
 * @param name The factory's name, `default` among them.
 */
export function addedServers(home: string, name: string) {
  const adds = readLibraryAdds(home, name) ?? [];
  const mine = libraryServers(home);
  const builtin = builtinServers(BUILTIN_SERVERS);
  const out: Record<string, FactoryServer> = {};
  for (const ref of adds) {
    if (ref.kind !== 'McpServer') continue;
    const given = builtin.find((s) => s.name === ref.name);
    const server = mine[ref.name] ?? (given === undefined ? undefined : withoutName(given));
    if (server !== undefined) out[ref.name] = server;
  }
  return out;
}

/** A builtin server as a record holds it: its fields but its name. */
const withoutName = ({ name: _name, ...server }: BuiltinServer) => server;

/**
 * Adds to the factory `name`'s record each builtin skill an agent of its tree gives that neither its tree nor the record holds, so a
 * template's apply and upgrade bring the builtins its agents name. Nothing for a factory with no record of its adds: its adds are derived
 * from what it runs, which holds them already.
 * @param home The store's root.
 * @param name The factory's name.
 * @param tree The factory's tree, whose `workflows/agents/` and `workflows/skills/` are read.
 */
export function addTemplateBuiltins(home: string, name: string, tree: string) {
  const recorded = readLibraryAdds(home, name);
  if (recorded === undefined) return;
  const agents = path.join(tree, 'workflows', AGENTS_FOLDER);
  let files: string[];
  try {
    files = fs.readdirSync(agents).filter((f) => f.endsWith('.md'));
  } catch {
    return;
  }
  const own = (skill: string) => fs.existsSync(path.join(tree, 'workflows', SKILLS_FOLDER, skill, 'SKILL.md'));
  const wanted = files
    .flatMap((file) => givenSkills(path.join(agents, file)))
    .filter((skill) => !skill.includes(':') && !own(skill) && librarySkill(home, skill) === 'builtin')
    .map((skill) => ({ kind: 'Skill', name: skill }) satisfies LibraryRef)
    .filter((ref, i, all) => !recorded.some((a) => sameAdd(a, ref)) && all.findIndex((b) => sameAdd(b, ref)) === i);
  if (wanted.length) writeLibraryAdds(home, name, [...recorded, ...wanted]);
}

/**
 * The add `addname` (`<kind>.<name>`) of the factory `factory` written or taken off, as a program over the store's root: what the api's
 * LibraryAdd put and delete run. Refused (`Missing`) for a name that is no add, and as `writeLibraryAdd` refuses.
 * @param factory The factory's name, `default` among them.
 * @param does Whether the item is added or its add taken off.
 * @param addname The add's object name, `<kind>.<name>`.
 */
export const libraryAddWritten = (factory: string, does: 'add' | 'remove', addname: string) =>
  Effect.gen(function* () {
    const home = yield* StoreRoot;
    const ref = refOf(addname);
    if (ref === undefined)
      return yield* Effect.fail(
        new Missing({ message: `${addname} is no add: name it <kind>.<name>, its kind Agent, Skill or McpServer.` }),
      );
    return yield* writeLibraryAdd(home, factory, does, ref);
  }) satisfies Effect.Effect<LibraryAdd, Refusal, StoreRoot>;

/**
 * A page of the factory `name`'s adds (`LibraryAddList`), each with its state, cut by the list's query as every list is.
 * @param home The store's root.
 * @param name The factory's name, `default` among them.
 * @param query The list's query: its selector, limit and token.
 */
export const libraryAddList = Effect.fn('libraryAddList')(function* (home: string, name: string, query: ObjectQuery) {
  const listing = yield* listedAt(home);
  const { recorded, adds } = addsIn(listing, home, name);
  const listed: LibraryAddList = yield* objectsListed(
    'LibraryAdd',
    adds.map((ref) => addObjectIn(listing, home, name, ref, recorded)),
    query,
    'library add',
  );
  return listed;
});

/**
 * The factory `name`'s add `addname` (`<kind>.<name>`), with its state; `Missing` for a name that is no add of it.
 * @param home The store's root.
 * @param name The factory's name, `default` among them.
 * @param addname The add's object name, `<kind>.<name>`.
 */
export const libraryAddNamed = Effect.fn('libraryAddNamed')(function* (home: string, name: string, addname: string) {
  const ref = refOf(addname);
  const listing = yield* listedAt(home);
  const { recorded, adds } = addsIn(listing, home, name);
  if (ref === undefined || !adds.some((a) => sameAdd(a, ref)))
    return yield* Effect.fail(
      new Missing({
        message: `${name} has no add ${addname}: list them with GET /api/namespaces/${name}/libraryadds, or add it with nemia library add.`,
      }),
    );
  return addObjectIn(listing, home, name, ref, recorded) satisfies LibraryAdd;
});
