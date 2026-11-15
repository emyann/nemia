/**
 * The store's library as a factory reads it, from the files: what a factory has added (its record, else what its workflows resolve today),
 * what each add is, who uses a library item, and an add written or taken back, judged by `libraryAddRefusal`. Everything is read from disk
 * on each call, and a read writes nothing: a factory with no record keeps its adds derived until its first add or removal writes the record
 * whole.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  API_VERSION,
  type DefinitionOrigin,
  type LibraryAdd,
  type LibraryAddList,
  type McpServer,
  type McpServerList,
  type McpServerWrite,
} from 'objects';
import { AGENTS_FOLDER, SKILLS_FOLDER } from '../step/step.ts';
import { DEFAULT_NAMESPACE, type Factory } from '../factory/factory.ts';
import { readFactoriesAt } from '../factory/factory.store.ts';
import { stepsFilled } from '../roster/fills.store.ts';
import { frontmatterKey } from '../former/former.ts';
import { BUILTIN_SKILLS, REPOSITORY_HOLDER } from '../skills/read.store.ts';
import { builtinServers, BUILTIN_SERVERS } from '../factory/servers/servers.store.ts';
import { Effect } from 'effect';
import { Invalid, Missing, type Refusal } from '../refusal/refusal.ts';
import { objectsListed, versionOf, type ObjectQuery } from '../object/listed.verb.ts';
import { specOf } from '../factory/object/mcp-server.verb.ts';
import { headersKept, writeRefusal } from '../factory/servers/servers.verb.ts';
import { factoryServerRefusal, serverNameRefusal } from '../factory/servers/servers.ts';
import { tried } from '../runtime-client.ts';
import { StoreRoot } from '../config/root.store.ts';
import type { BuiltinServer, FactoryServer, FactoryServers } from '../factory/servers/servers.ts';
import { addName, libraryAddRefusal, libraryAddState, libraryAddsOf, sameAdd, type LibraryKind, type LibraryRef } from './library.ts';
import { libraryAddsFile, libraryDir, libraryServers, readLibraryAdds, writeLibraryAdds, writeLibraryServers } from './library.store.ts';

/** When the factory `name`'s adds were last recorded, or the epoch where they never were. */
const recordedAt = (home: string, name: string): string =>
  (fs.statSync(libraryAddsFile(home, name), { throwIfNoEntry: false })?.mtime ?? new Date(0)).toISOString();

/** A factory's adds, and whether they are its record's (`recorded`) or derived from what its workflows resolve today. */
export type FactoryAdds = { readonly recorded: boolean; readonly adds: readonly LibraryRef[] };

/** The factory `name` as its file reads, or undefined for `default`, which has no file, and for one whose file does not read. */
const factoryNamed = (home: string, name: string): Factory | undefined => {
  const listing = readFactoriesAt(home).find((f) => f.name === name);
  return listing === undefined || 'error' in listing ? undefined : listing;
};

/** Whether `file` is directly in the folder `dir`, by resolved path. */
const inFolder = (file: string, dir: string): boolean => path.dirname(path.resolve(file)) === path.resolve(dir);

/** Whether the library holds a skill of `name`: the person's, or a builtin. */
const librarySkill = (home: string, name: string): DefinitionOrigin | undefined => {
  const holds = (dir: string) => fs.statSync(path.join(dir, name, 'SKILL.md'), { throwIfNoEntry: false })?.isFile() === true;
  if (holds(path.join(libraryDir(home), SKILLS_FOLDER))) return 'user';
  return holds(BUILTIN_SKILLS) ? 'builtin' : undefined;
};

/** The skills the agent file `file` gives, as its `skills:` line lists them; none for a file that cannot be read. */
const givenSkills = (file: string): string[] => {
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

/**
 * The library items the factory `name` resolves today, from the steps it fills: each library agent a step is credited to (`stepsFilled`,
 * the file a start would run), and each skill an agent that fills a step gives that the library holds.
 * @param home The store's root.
 * @param name The factory's name, `default` among them.
 */
export function derivedAdds(home: string, name: string): LibraryRef[] {
  const factory = name === DEFAULT_NAMESPACE ? undefined : factoryNamed(home, name);
  if (name !== DEFAULT_NAMESPACE && factory === undefined) return [];
  const repos: Array<string | undefined> =
    factory === undefined ? [undefined] : factory.repos.length === 0 ? [undefined] : factory.repos.map((r) => path.resolve(r));
  const files = new Set<string>();
  for (const repo of repos) {
    try {
      for (const filled of stepsFilled(repo, home, factory)) files.add(path.resolve(filled.file));
    } catch {
      continue;
    }
  }
  const agentsDir = path.join(libraryDir(home), AGENTS_FOLDER);
  const adds: LibraryRef[] = [];
  const add = (ref: LibraryRef) => {
    if (!adds.some((a) => sameAdd(a, ref))) adds.push(ref);
  };
  for (const file of [...files].sort()) {
    if (inFolder(file, agentsDir)) add({ kind: 'Agent', name: path.basename(file, '.md') });
    for (const skill of givenSkills(file)) if (!skill.includes(':') && librarySkill(home, skill)) add({ kind: 'Skill', name: skill });
  }
  return adds;
}

/**
 * The factory `name`'s adds: its record's where it has one, else those derived from its workflows (`libraryAddsOf`).
 * @param home The store's root.
 * @param name The factory's name, `default` among them.
 */
export function factoryAdds(home: string, name: string): FactoryAdds {
  const recorded = readLibraryAdds(home, name);
  return {
    recorded: recorded !== undefined,
    adds: libraryAddsOf(recorded, recorded === undefined ? derivedAdds(home, name) : []),
  };
}

/**
 * Where the library holds the item `ref`: the person's (`user`), a builtin, or undefined where it holds none.
 * @param home The store's root.
 * @param ref The item, by its kind and its name.
 */
export function libraryOrigin(home: string, ref: LibraryRef): DefinitionOrigin | undefined {
  if (ref.kind === 'Skill') return librarySkill(home, ref.name);
  if (ref.kind === 'Agent')
    return fs.statSync(path.join(libraryDir(home), AGENTS_FOLDER, `${ref.name}.md`), { throwIfNoEntry: false })?.isFile()
      ? 'user'
      : undefined;
  if (libraryServers(home)[ref.name] !== undefined) return 'user';
  return builtinServers(BUILTIN_SERVERS).some((s) => s.name === ref.name) ? 'builtin' : undefined;
}

/**
 * The origins of the factory `name`'s own that hold the item `ref` first: its tree's (`factory`), or its repository's (`repo`).
 * @param home The store's root.
 * @param name The factory's name.
 * @param ref The item.
 */
function ownOrigins(home: string, name: string, ref: LibraryRef): DefinitionOrigin[] {
  const factory = name === DEFAULT_NAMESPACE ? undefined : factoryNamed(home, name);
  if (factory === undefined || ref.kind === 'McpServer') return [];
  const at = (root: string) =>
    ref.kind === 'Agent'
      ? fs.existsSync(path.join(root, AGENTS_FOLDER, `${ref.name}.md`))
      : fs.existsSync(path.join(root, SKILLS_FOLDER, ref.name, 'SKILL.md'));
  const out: DefinitionOrigin[] = [];
  if (factory.tree !== undefined && at(path.join(factory.tree, 'workflows'))) out.push('factory');
  if (factory.repos.some((repo) => at(path.join(path.resolve(repo), REPOSITORY_HOLDER)))) out.push('repo');
  return out;
}

/** What to do about an add the library no longer holds. */
const missingFix = (factory: string, ref: LibraryRef): string =>
  `${ref.kind} ${ref.name} is no longer in the library: make it again there, or take the add off with nemia library rm ${ref.kind} ${ref.name} --factory ${factory}.`;

/**
 * The add `ref` of the factory `name` as an object, with what it is there.
 * @param home The store's root.
 * @param name The factory's name.
 * @param ref The add.
 * @param recorded Whether the factory's adds are its record's.
 */
export function libraryAddObject(home: string, name: string, ref: LibraryRef, recorded: boolean): LibraryAdd {
  const held = libraryOrigin(home, ref);
  const own = ownOrigins(home, name, ref);
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
  };
}

/**
 * The add named `addname`, `<kind>.<name>`, read as a reference; undefined where it names no kind of the library.
 * @param addname The add's object name.
 */
export function refOf(addname: string): LibraryRef | undefined {
  const dot = addname.indexOf('.');
  const kind = addname.slice(0, dot);
  const name = addname.slice(dot + 1);
  if (dot < 1 || !name || (kind !== 'Agent' && kind !== 'Skill' && kind !== 'McpServer')) return undefined;
  return { kind, name };
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
export function writeLibraryAdd(home: string, name: string, does: 'add' | 'remove', ref: LibraryRef): LibraryAdd {
  const { adds } = factoryAdds(home, name);
  const added = adds.some((a) => sameAdd(a, ref));
  const refused = libraryAddRefusal(does, libraryOrigin(home, ref) !== undefined, added);
  if (refused !== null) throw new Missing({ message: refused.message });
  const now = does === 'add' ? (added ? adds : [...adds, ref]) : adds.filter((a) => !sameAdd(a, ref));
  writeLibraryAdds(home, name, now);
  return libraryAddObject(home, name, ref, true);
}

/**
 * The factories that use the library item `ref`: each whose adds hold it (its record, else derived from the steps it fills), `default`
 * among them; and for a workflow (`kind` Workflow), each factory that attaches it. Sorted.
 * @param home The store's root.
 * @param ref The item, or a workflow by its name.
 */
export function libraryUsers(home: string, ref: LibraryRef | { readonly kind: 'Workflow'; readonly name: string }): string[] {
  const factories = readFactoriesAt(home).filter((f): f is Factory & { file: string } => !('error' in f));
  if (ref.kind === 'Workflow')
    return factories
      .filter((f) => f.workflows.includes(ref.name))
      .map((f) => f.name)
      .sort();
  const libraryRef = ref;
  return [DEFAULT_NAMESPACE, ...factories.map((f) => f.name)]
    .filter((name) => {
      try {
        return factoryAdds(home, name).adds.some((a) => sameAdd(a, libraryRef));
      } catch {
        return false;
      }
    })
    .sort();
}

/**
 * The library's MCP servers the factory `name` has added, by name: the person's record of each, else Nemia's builtin of that name. None
 * for a factory with no record of its adds, since the library held no server before adds were recorded.
 * @param home The store's root.
 * @param name The factory's name, `default` among them.
 */
export function addedServers(home: string, name: string): FactoryServers {
  const adds = readLibraryAdds(home, name) ?? [];
  const mine = libraryServers(home);
  const builtin = builtinServers(BUILTIN_SERVERS);
  const out: Record<string, FactoryServer> = {};
  for (const ref of adds) {
    if (ref.kind !== 'McpServer') continue;
    const shipped = builtin.find((s) => s.name === ref.name);
    const server = mine[ref.name] ?? (shipped === undefined ? undefined : withoutName(shipped));
    if (server !== undefined) out[ref.name] = server;
  }
  return out;
}

/** A builtin server as a record holds it: its fields but its name. */
const withoutName = ({ name: _name, ...server }: BuiltinServer): FactoryServer => server;

/**
 * Adds to the factory `name`'s record each builtin skill an agent of its tree gives that neither its tree nor the record holds, so a
 * template's apply and upgrade bring the builtins its agents name. Nothing for a factory with no record of its adds: its adds are derived
 * from what it runs, which holds them already.
 * @param home The store's root.
 * @param name The factory's name.
 * @param tree The factory's tree, whose `workflows/agents/` and `workflows/skills/` are read.
 */
export function addTemplateBuiltins(home: string, name: string, tree: string): void {
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
    .map((skill): LibraryRef => ({ kind: 'Skill', name: skill }))
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
export const libraryAddWritten = (
  factory: string,
  does: 'add' | 'remove',
  addname: string,
): Effect.Effect<LibraryAdd, Refusal, StoreRoot> =>
  Effect.gen(function* () {
    const home = yield* StoreRoot;
    const ref = refOf(addname);
    if (ref === undefined)
      return yield* Effect.fail(
        new Missing({ message: `${addname} is no add: name it <kind>.<name>, its kind Agent, Skill or McpServer.` }),
      );
    return yield* tried(() => writeLibraryAdd(home, factory, does, ref));
  });

/**
 * Where the library holds the server `name`: the user library, Nemia's builtins, or none.
 * @param home The store's root.
 * @param name The server's name.
 */
export const libraryServerThere = (home: string, name: string): 'user' | 'builtin' | 'none' => {
  if (libraryServers(home)[name] !== undefined) return 'user';
  return builtinServers(BUILTIN_SERVERS).some((s) => s.name === name) ? 'builtin' : 'none';
};

/**
 * The library's MCP servers as objects, in no namespace: the user library's, each header masked, then each builtin no user server of its
 * name shadows, each with the factories that add it.
 * @param home The store's root.
 */
export function libraryServerObjects(home: string): McpServer[] {
  const mine = libraryServers(home);
  const filedAt = recordedAt(home, DEFAULT_NAMESPACE);
  const own = Object.entries(mine).map(([name, server]) => serverObject(home, name, specOf(server), 'user', filedAt));
  const builtin = builtinServers(BUILTIN_SERVERS)
    .filter((s) => mine[s.name] === undefined)
    .map(({ name, ...server }) => serverObject(home, name, specOf(server, false), 'builtin', filedAt));
  return [...own, ...builtin].sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : a.metadata.name > b.metadata.name ? 1 : 0));
}

/** The object of the library server `name` at `origin`, with the factories that add it. */
const serverObject = (home: string, name: string, spec: McpServer['spec'], origin: 'user' | 'builtin', filedAt: string): McpServer => {
  const status = { origin, factories: libraryUsers(home, { kind: 'McpServer', name }) };
  return {
    apiVersion: API_VERSION,
    kind: 'McpServer',
    metadata: { name, creationTimestamp: filedAt, resourceVersion: versionOf(spec, status) },
    spec,
    status,
  };
};

/**
 * The library's server `name` recorded in the user library from `write`, a header sent as the mask keeping the value held, refused
 * `Invalid` as a factory's server write is.
 * @param home The store's root.
 * @param name The server's name.
 * @param write The server's write as it was sent.
 */
export function libraryServerWritten(home: string, name: string, write: McpServerWrite): void {
  const bad = serverNameRefusal(name) ?? writeRefusal(write);
  if (bad !== undefined) throw new Invalid({ message: bad });
  const { type, ...rest } = write;
  const server = { ...rest, type: type ?? 'http' };
  const refused = factoryServerRefusal(server);
  if (refused !== undefined) throw new Invalid({ message: `${refused} Nothing was recorded.` });
  const mine = libraryServers(home);
  writeLibraryServers(home, { ...mine, [name]: headersKept(server, mine[name]) });
}

/**
 * The user library's server `name` taken off its record; nothing where it holds none.
 * @param home The store's root.
 * @param name The server's name.
 */
export function libraryServerRemoved(home: string, name: string): void {
  const { [name]: _gone, ...rest } = libraryServers(home);
  writeLibraryServers(home, rest);
}

/**
 * A page of the library's MCP servers (`McpServerList`), cut by the list's query as every list is (`objectsListed`).
 * @param home The store's root.
 * @param query The list's query: its selector, limit and token.
 */
export const libraryServerList = Effect.fn('libraryServerList')(function* (home: string, query: ObjectQuery) {
  const listed: McpServerList = yield* objectsListed('McpServer', libraryServerObjects(home), query, 'library server');
  return listed;
});

/**
 * A page of the factory `name`'s adds (`LibraryAddList`), each with its state, cut by the list's query as every list is.
 * @param home The store's root.
 * @param name The factory's name, `default` among them.
 * @param query The list's query: its selector, limit and token.
 */
export const libraryAddList = Effect.fn('libraryAddList')(function* (home: string, name: string, query: ObjectQuery) {
  const { recorded, adds } = factoryAdds(home, name);
  const listed: LibraryAddList = yield* objectsListed(
    'LibraryAdd',
    adds.map((ref) => libraryAddObject(home, name, ref, recorded)),
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
export function libraryAddNamed(home: string, name: string, addname: string): LibraryAdd {
  const ref = refOf(addname);
  const { recorded, adds } = factoryAdds(home, name);
  if (ref === undefined || !adds.some((a) => sameAdd(a, ref)))
    throw new Missing({
      message: `${name} has no add ${addname}: list them with GET /api/namespaces/${name}/libraryadds, or add it with nemia library add.`,
    });
  return libraryAddObject(home, name, ref, recorded);
}
