/**
 * The definition index: a file a definition lives in stays a file, and the keyspace holds one record for each, so a definition has a
 * revision to be watched from. `/registry/definitions/<scope>/<kind>/<name>` holds `{ digest, path }` — where the definition is and a
 * digest of what it holds — of an agent, a skill or a workflow of a factory's tree (its scope the factory's name), of the person's library
 * (`_library`) or of Nemia's builtin (`_builtin`, where a builtin template and a builtin skill are). The daemon's sweep (`indexSweep`)
 * reads each file and writes a record only where it differs from what the index holds (`recordDue`), a record whose file is gone
 * deleted, so a revision moves exactly when a definition's files do. The name is escaped by `encodeURIComponent`, as the ledger's is.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { StoreRoot } from '../config/root.store.ts';
import { listedAt } from '../factory/door/factories.store.ts';
import { workedOn } from '../factory/factory.ts';
import { agentVersion } from '../agents/read.store.ts';
import { stepFiles } from '../folder/folder.ts';
import { workflowsIn } from '../folder/folder.store.ts';
import { keyspaceAt, keyspaceFile } from '../keyspace/keyspace.store.ts';
import { DEFINITIONS_PREFIX } from '../list-watch/kind-watch.ts';
import { recordDue } from '../observed/observed.ts';
import { AGENTS_FOLDER, SKILLS_FOLDER } from '../step/step.ts';
import { BUILTIN_SKILLS, entriesOf, skillVersion } from '../skills/read.store.ts';
import { BuiltinTemplates, builtinTemplatesIn } from '../template/door/templates.store.ts';

/** The kinds the index holds: the definitions, and the builtin templates. */
export type DefinitionKind = 'agent' | 'skill' | 'workflow' | 'template';

/** A definition found in a file: where it is held (`scope`), what it is, its name, its path and a digest of what it holds. */
export type DefinitionFound = {
  readonly scope: string;
  readonly kind: DefinitionKind;
  readonly name: string;
  readonly path: string;
  readonly digest: string;
};

/** The scope of the person's library, and of Nemia's builtin definitions. */
export const LIBRARY_SCOPE = '_library';
export const BUILTIN_SCOPE = '_builtin';

/**
 * The key of the index's record of a definition.
 * @param scope The factory's name, or `_library` or `_builtin`.
 * @param kind What the definition is.
 * @param name The definition's name.
 */
export const definitionKey = (scope: string, kind: DefinitionKind, name: string) =>
  `${DEFINITIONS_PREFIX}${scope}/${kind}/${encodeURIComponent(name)}`;

/** A digest of every file under `dir`, each by its path and its bytes, in the order of the paths; one of what cannot be read as it says. */
const treeDigest = (dir: string) => {
  const hash = createHash('sha256');
  const walk = (at: string, rel: string) => {
    for (const entry of entriesOf(at).sort()) {
      if (entry === '.git') continue;
      const full = path.join(at, entry);
      const stat = fs.lstatSync(full, { throwIfNoEntry: false });
      if (stat === undefined) continue;
      if (stat.isDirectory()) walk(full, path.join(rel, entry));
      else {
        hash.update(path.join(rel, entry));
        try {
          hash.update(stat.isSymbolicLink() ? `link:${fs.readlinkSync(full)}` : fs.readFileSync(full));
        } catch (err) {
          hash.update(`unreadable:${(err as Error).message}`);
        }
      }
    }
  };
  walk(dir, '');
  return hash.digest('hex').slice(0, 16);
};

/** The digest of one definition, or of why it cannot be read. */
const digestOf = (read: () => string | null) => {
  try {
    return read();
  } catch (err) {
    return `unreadable:${(err as Error).message}`;
  }
};

/**
 * The definitions a folder of workflows holds (`<folder>/agents`, `<folder>/skills` and a folder for each workflow), found in `scope`.
 * @param scope Where they are held.
 * @param folder The folder of workflows: a tree's `workflows`, the library's, or the builtin's.
 */
export const definitionsIn = (scope: string, folder: string) => {
  const found: DefinitionFound[] = [];
  const agents = path.join(folder, AGENTS_FOLDER);
  for (const file of stepFiles(entriesOf(agents))) {
    const name = path.basename(file, '.md');
    const digest = digestOf(() => agentVersion(agents, name));
    if (digest !== null) found.push({ scope, kind: 'agent', name, path: path.join(agents, file), digest });
  }
  const skills = path.join(folder, SKILLS_FOLDER);
  for (const name of entriesOf(skills)) {
    const dir = path.join(skills, name);
    const digest = digestOf(() => skillVersion(dir));
    if (digest !== null) found.push({ scope, kind: 'skill', name, path: dir, digest });
  }
  for (const name of workflowsIn(folder)) {
    const dir = path.join(folder, name);
    found.push({ scope, kind: 'workflow', name, path: dir, digest: digestOf(() => treeDigest(dir)) ?? '' });
  }
  return found;
};

/** The record's text: the JSON of its keys in order. */
const textOf = (found: DefinitionFound) => JSON.stringify({ digest: found.digest, path: found.path });

/**
 * Every definition of the store `home` and where it is held: each factory's tree and the repositories it works on, the person's library,
 * and what Nemia ships (its skills and its builtin templates).
 * @param home The store's root.
 * @param factories Each factory with the folder of its tree, and the repositories it works on.
 * @param templates The folder of builtin templates.
 */
export const definitionsFound = (
  home: string,
  factories: readonly { readonly name: string; readonly tree?: string | undefined; readonly repos: readonly string[] }[],
  templates: string,
) => {
  const found: DefinitionFound[] = [];
  for (const f of factories) {
    if (f.tree !== undefined) found.push(...definitionsIn(f.name, path.join(f.tree, 'workflows')));
    for (const repo of f.repos) found.push(...definitionsIn(f.name, path.join(repo, 'workflows')));
  }
  found.push(...definitionsIn(LIBRARY_SCOPE, path.join(path.resolve(home), 'workflows')));
  for (const name of entriesOf(BUILTIN_SKILLS)) {
    const dir = path.join(BUILTIN_SKILLS, name);
    const digest = digestOf(() => skillVersion(dir));
    if (digest !== null) found.push({ scope: BUILTIN_SCOPE, kind: 'skill', name, path: dir, digest });
  }
  for (const name of builtinTemplatesIn(templates)) {
    const dir = path.join(templates, name);
    found.push({ scope: BUILTIN_SCOPE, kind: 'template', name, path: dir, digest: treeDigest(dir) });
  }
  const seen = new Set<string>();
  return found.filter((d) => {
    const key = definitionKey(d.scope, d.kind, d.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * One pass of the index of the store `StoreRoot` names: each definition found read, and its record written where it differs from the
 * record the index holds (`recordDue`), each record whose definition is gone deleted, all in one transaction of the keyspace. A pass
 * that finds nothing new writes nothing, so the head stands. A write another hand raced is left to the next pass.
 */
export const indexSweep = Effect.fn('indexSweep')(function* () {
  const home = yield* StoreRoot;
  const templates = yield* BuiltinTemplates;
  const listings = yield* listedAt(home);
  const factories = listings.flatMap((f) => ('error' in f ? [] : [{ name: f.name, tree: f.tree, repos: workedOn(f) }]));
  const wanted = new Map(definitionsFound(home, factories, templates).map((d) => [definitionKey(d.scope, d.kind, d.name), textOf(d)]));
  const keyspace = yield* keyspaceAt(keyspaceFile(home));
  return yield* keyspace
    .within((tx) =>
      Effect.gen(function* () {
        const held = new Map((yield* tx.list(DEFINITIONS_PREFIX)).map((r) => [r.key, r] as const));
        let written = 0;
        for (const key of new Set([...held.keys(), ...wanted.keys()])) {
          const record = held.get(key);
          const due = recordDue(record?.value ?? null, wanted.get(key) ?? null);
          if ('keep' in due) continue;
          yield* tx.write(key, { verb: due.write, expected: record?.revision ?? null, value: wanted.get(key) ?? '' });
          written += 1;
        }
        return written;
      }),
    )
    .pipe(Effect.catchTag('KeyRefused', () => Effect.succeed(0)));
});

/**
 * The revision the index holds a definition at once its files are read again: what a write of the definition compares the revision its
 * writer read to. None where it holds no such definition.
 * @param scope The factory's name, `_library` or `_builtin`.
 * @param kind What the definition is.
 * @param name The definition's name.
 */
export const definitionRevisionNow = Effect.fn('definitionRevisionNow')(function* (scope: string, kind: DefinitionKind, name: string) {
  const home = yield* StoreRoot;
  yield* indexSweep();
  const keyspace = yield* keyspaceAt(keyspaceFile(home));
  const record = yield* keyspace.get(definitionKey(scope, kind, name));
  return record?.revision;
});
