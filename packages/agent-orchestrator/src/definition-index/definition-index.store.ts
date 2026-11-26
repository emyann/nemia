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
import { Cause, Effect } from 'effect';
import { StoreRoot } from '../config/root.store.ts';
import { FactoryDoor, listedAt } from '../factory/door/factories.store.ts';
import { FactoryName } from '../factory/factory.model.ts';
import { workedOn } from '../factory/factory.ts';
import { AgentName, SkillName } from '../agents/agents.model.ts';
import { AgentDoor } from '../agents/agent-door.store.ts';
import { SkillDoor } from '../skills/skill-door.store.ts';
import type { DefinitionThere } from '../agents/agents.ts';
import { stepFiles } from '../folder/folder.ts';
import { workflowsIn } from '../folder/folder.store.ts';
import { workflowVersion } from '../folder/version.store.ts';
import { keyspaceAt, keyspaceFile } from '../keyspace/keyspace.store.ts';
import { DEFINITIONS_PREFIX, REPO_SCOPE, revisionTable } from '../list-watch/index.ts';
import { Conflict } from '../refusal/refusal.ts';
import { recordDue } from '../observed/observed.ts';
import { indexedRevision } from './definition-index.ts';
import { AGENTS_FOLDER, SKILLS_FOLDER } from '../step/step.ts';
import { BUILTIN_SKILLS, entriesOf, REPOSITORY_HOLDER } from '../skills/read.store.ts';
import { BuiltinTemplates, builtinTemplatesIn } from '../template/door/templates.store.ts';

/** The kinds the index holds: the definitions, the builtin templates, and what a factory's rules and instruction hold. */
type DefinitionKind = 'agent' | 'skill' | 'workflow' | 'template' | 'factory';

/** A definition found in a file: where it is held (`scope`), what it is, its name, its path and a digest of what it holds. */
type DefinitionFound = {
  readonly scope: string;
  readonly kind: DefinitionKind;
  readonly name: string;
  readonly path: string;
  readonly digest: string;
};

/** The scope of the person's library, and of Nemia's builtin definitions. */
const LIBRARY_SCOPE = '_library';
const BUILTIN_SCOPE = '_builtin';

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

/** The digest of one definition read through a door, or of why it cannot be read: unreadable files are a digest of what they say. */
const digestOf = (read: Effect.Effect<string | null, unknown>) =>
  read.pipe(Effect.catchCause((cause) => Effect.succeed(`unreadable:${Cause.pretty(cause)}`)));

/**
 * One digest of the versions a definition has: where the repositories a factory works on hold skills it names, its version counts each
 * repository's, so an edit of such a skill moves it (the version a writer reads it at is read the same way).
 * @param versions The versions, the first read with no repository and each other with one.
 */
const together = (versions: readonly (string | null)[]) => {
  const held = versions.filter((v): v is string => v !== null);
  if (held.length === 0) return null;
  return held.length === 1 ? (held[0] ?? null) : createHash('sha256').update(held.join('\0')).digest('hex').slice(0, 16);
};

/**
 * What `there` of a door says is held: its version, none where nothing is at the name.
 * @param there What the door says is at the name.
 */
export const heldVersion = (there: DefinitionThere) => (there.kind === 'held' ? there.version : null);

/**
 * The skills a folder of skills holds, each digested as the Skill door versions it, found in `scope`.
 * @param scope Where they are held.
 * @param skills The folder of skills.
 */
const skillsIn = Effect.fn('skillsIn')(function* (scope: string, skills: string) {
  const skillsDoor = (yield* SkillDoor).skills;
  const found: DefinitionFound[] = [];
  for (const name of entriesOf(skills)) {
    const dir = path.join(skills, name);
    const digest = yield* digestOf(
      Effect.map(
        Effect.suspend(() => skillsDoor.there(SkillName.read(name), skills)),
        heldVersion,
      ),
    );
    if (digest !== null) found.push({ scope, kind: 'skill', name, path: dir, digest });
  }
  return found;
});

/**
 * The definitions a folder of workflows holds (`<folder>/agents`, `<folder>/skills` and a folder for each workflow), found in `scope`,
 * each digested through the Agent and Skill doors and the workflow's version, once with no repository and once with each of `repos`.
 * @param scope Where they are held.
 * @param folder The folder of workflows: a tree's `workflows`, the library's, or the builtin's.
 * @param repos The repositories whose skills a version counts besides the folder's own.
 */
const definitionsIn = Effect.fn('definitionsIn')(function* (scope: string, folder: string, repos: readonly string[]) {
  const home = yield* StoreRoot;
  const agentsDoor = (yield* AgentDoor).agents;
  const found: DefinitionFound[] = [];
  const places: readonly (string | undefined)[] = [undefined, ...repos];
  const agents = path.join(folder, AGENTS_FOLDER);
  for (const file of stepFiles(entriesOf(agents))) {
    const name = path.basename(file, '.md');
    const digest = yield* digestOf(
      Effect.forEach(places, (repo) =>
        Effect.map(
          Effect.suspend(() => agentsDoor.there(AgentName.read(name), { dir: agents, ...(repo !== undefined && { repo }) })),
          heldVersion,
        ),
      ).pipe(Effect.map(together)),
    );
    if (digest !== null) found.push({ scope, kind: 'agent', name, path: path.join(agents, file), digest });
  }
  found.push(...(yield* skillsIn(scope, path.join(folder, SKILLS_FOLDER))));
  for (const name of workflowsIn(folder)) {
    const dir = path.join(folder, name);
    const digest = yield* digestOf(
      Effect.forEach(places, (repo) => workflowVersion(dir, { home, ...(repo !== undefined && { repo }) })).pipe(Effect.map(together)),
    );
    found.push({ scope, kind: 'workflow', name, path: dir, digest: digest ?? '' });
  }
  return found;
});

/** The record's text: the JSON of its keys in order. */
const textOf = (found: DefinitionFound) => JSON.stringify({ digest: found.digest, path: found.path });

/** What Nemia has built in (its skills, its builtin templates), read once by the process: it changes with a release, which restarts it. */
const BUILTIN = new Map<string, readonly DefinitionFound[]>();

/** The definitions Nemia has built in, found once per folder of builtin templates. */
const builtinFound = Effect.fn('builtinFound')(function* (templates: string) {
  const kept = BUILTIN.get(templates);
  if (kept !== undefined) return kept;
  const found: DefinitionFound[] = [...(yield* skillsIn(BUILTIN_SCOPE, BUILTIN_SKILLS))];
  for (const name of builtinTemplatesIn(templates)) {
    const dir = path.join(templates, name);
    found.push({ scope: BUILTIN_SCOPE, kind: 'template', name, path: dir, digest: treeDigest(dir) });
  }
  BUILTIN.set(templates, found);
  return found;
});

/**
 * What a factory's rules and its instruction hold, as one record of the index (`<factory>/factory/<factory>`): the words they are
 * kept in files for, which no record of the keyspace holds, so a Factory's revision moves when either is edited.
 * @param factory The factory, with the folder of its tree.
 */
const factoryWordsOf = Effect.fn('factoryWordsOf')(function* (factory: { readonly name: string; readonly tree?: string | undefined }) {
  const door = yield* FactoryDoor;
  const named = FactoryName.read(factory.name);
  const words = yield* digestOf(
    Effect.gen(function* () {
      const rules = (yield* door.rules.read(named)).words;
      const instruction = (yield* door.instruction.read(named)).words;
      return createHash('sha256')
        .update(JSON.stringify([rules, instruction]))
        .digest('hex')
        .slice(0, 16);
    }),
  );
  return [
    { scope: factory.name, kind: 'factory', name: factory.name, path: factory.tree ?? '', digest: words ?? '' },
  ] satisfies DefinitionFound[];
});

/**
 * Every definition of the store `home` and where it is held: each factory's tree and the repositories it works on, the person's library,
 * and what Nemia has built in (its skills and its builtin templates).
 * @param home The store's root.
 * @param factories Each factory with the folder of its tree, and the repositories it works on.
 * @param templates The folder of builtin templates.
 */
const definitionsFound = Effect.fn('definitionsFound')(function* (
  home: string,
  factories: readonly { readonly name: string; readonly tree?: string | undefined; readonly repos: readonly string[] }[],
  templates: string,
) {
  const found: DefinitionFound[] = [];
  for (const f of factories) {
    if (f.tree !== undefined) found.push(...(yield* definitionsIn(f.name, path.join(f.tree, 'workflows'), f.repos)));
    for (const repo of f.repos) {
      const scope = `${REPO_SCOPE}${f.name}`;
      found.push(...(yield* definitionsIn(scope, path.join(repo, 'workflows'), [repo])));
      found.push(...(yield* skillsIn(scope, path.join(repo, REPOSITORY_HOLDER, 'skills'))));
    }
  }
  const everyRepo = [...new Set(factories.flatMap((f) => f.repos))];
  found.push(...(yield* definitionsIn(LIBRARY_SCOPE, path.join(path.resolve(home), 'workflows'), everyRepo)));
  found.push(...(yield* builtinFound(templates)));
  const seen = new Set<string>();
  return found.filter((d) => {
    const key = definitionKey(d.scope, d.kind, d.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
});

/**
 * What the files under `roots` look like from outside, by the path, the size and the time of each: the same print as the pass before it
 * means the same digests, so a pass reads no file's bytes. Hidden `.git` and `node_modules` folders are left out.
 * @param roots The folders the definitions are read from.
 */
const rootsPrint = (roots: readonly string[]) => {
  const hash = createHash('sha1');
  const seen = new Set<string>();
  const walk = (at: string) => {
    const link = fs.lstatSync(at, { throwIfNoEntry: false });
    const stat = link?.isSymbolicLink() === true ? fs.statSync(at, { throwIfNoEntry: false }) : link;
    if (link === undefined) return;
    hash.update(`${at}\0${link.mtimeMs}\0${stat?.mtimeMs}\0${stat?.size}\0${stat?.isDirectory() === true ? 'd' : 'f'}\n`);
    if (stat?.isDirectory() !== true || seen.has(fs.realpathSync(at))) return;
    seen.add(fs.realpathSync(at));
    for (const entry of entriesOf(at).sort()) if (entry !== '.git' && entry !== 'node_modules') walk(path.join(at, entry));
  };
  for (const root of roots) walk(root);
  return hash.digest('hex');
};

/** What a pass derived of each store, with the print of the files it read: the next pass reads the files again only where it moved. */
const DERIVED = new Map<string, { readonly print: string; readonly wanted: ReadonlyMap<string, string> }>();

/**
 * The text of each definition the files of the store `StoreRoot` names hold now, by the key of its record: the files read again only
 * where their print moved. It writes nothing, so a read and a sweep see the same definitions.
 */
const definitionsWanted = Effect.fn('definitionsWanted')(function* () {
  const home = yield* StoreRoot;
  const templates = yield* BuiltinTemplates;
  const listings = yield* listedAt(home);
  const factories = listings.flatMap((f) => ('error' in f ? [] : [{ name: f.name, tree: f.tree, repos: workedOn(f) }]));
  const print = rootsPrint([
    path.join(path.resolve(home), 'workflows'),
    ...factories.flatMap((f) => [
      ...(f.tree === undefined ? [] : [f.tree]),
      ...f.repos.flatMap((repo) => [path.join(repo, 'workflows'), path.join(repo, REPOSITORY_HOLDER, 'skills')]),
    ]),
  ]);
  const derived = DERIVED.get(home);
  const wanted: ReadonlyMap<string, string> =
    derived?.print === print
      ? derived.wanted
      : new Map((yield* definitionsFound(home, factories, templates)).map((d) => [definitionKey(d.scope, d.kind, d.name), textOf(d)]));
  DERIVED.set(home, { print, wanted });
  const words = new Map(wanted);
  for (const f of factories) for (const d of yield* factoryWordsOf(f)) words.set(definitionKey(d.scope, d.kind, d.name), textOf(d));
  return words;
});

/**
 * The revision each definition the files hold stands at now, worked out with no write (`indexedRevision`): the index's record where it
 * still holds the files, otherwise the revision a sweep would give it, one past the head the records were read at.
 */
export const definitionsNumbered = Effect.fn('definitionsNumbered')(function* () {
  const wanted = yield* definitionsWanted();
  const keyspace = yield* keyspaceAt(keyspaceFile(yield* StoreRoot)).pipe(Effect.orDie);
  const { records, revision: head } = yield* keyspace.list(DEFINITIONS_PREFIX);
  const held = new Map(records.map((r) => [r.key, r] as const));
  const numbered = new Map<string, number>();
  for (const [key, text] of wanted) {
    const record = held.get(key);
    const at = indexedRevision(record === undefined ? null : { value: record.value, revision: record.revision }, text, head);
    if (at !== null) numbered.set(key, at);
  }
  return { head, held: numbered };
});

/**
 * One pass of the index of the store `StoreRoot` names: each definition found read, and its record written where it differs from the
 * record the index holds (`recordDue`), each record whose definition is gone deleted, all in one transaction of the keyspace. A pass
 * that finds nothing new writes nothing, so the head stands. A write another hand raced is left to the next pass. Only a sweep writes
 * the index: the daemon's loop, and a writer of a definition after its write.
 */
export const indexSweep = Effect.fn('indexSweep')(function* () {
  const wanted = yield* definitionsWanted();
  const keyspace = yield* keyspaceAt(keyspaceFile(yield* StoreRoot));
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
 * The revision a library definition stands at now, worked out with no write (`definitionsNumbered`): what a write of it compares the
 * revision its writer read to, the revision a reader is served (`revisionTable`), the highest among the records that name it.
 * @param kind What the definition is.
 * @param namespace The namespace it is served in, none for the library's.
 * @param name The definition's name.
 */
export const definitionRevisionNow = Effect.fn('definitionRevisionNow')(function* (
  kind: 'Agent' | 'Skill' | 'Workflow',
  namespace: string | undefined,
  name: string,
) {
  const held = new Map([[DEFINITIONS_PREFIX, (yield* definitionsNumbered()).held]]);
  return revisionTable(kind, held)(namespace, name);
});

/**
 * Refuses `Conflict` a write of a definition whose writer read it at another revision than it stands at now: the revision a reader is
 * served is the one the writer names (`definitionRevisionNow`, worked out with no write), so a hand edit since the read counts and a
 * lost update is never possible. Nothing is judged where no revision is named: a definition made.
 * @param kind What the definition is.
 * @param namespace The namespace it is served in, none for the library's.
 * @param name The definition's name.
 * @param read The `resourceVersion` the writer read it at, none for a definition made.
 * @param what What the writer does, as the refusal says it: `write` or `remove`.
 * @param held The version the definition's door holds at the name now, null where nothing is there (the door's own refusal says so,
 * `Missing`, and none is judged here): a command line whose read serves the door's version names that one, and it is judged by the door.
 */
export const definitionJudged = Effect.fn('definitionJudged')(function* (
  kind: 'Agent' | 'Skill' | 'Workflow',
  namespace: string | undefined,
  name: string,
  read: string | undefined,
  what: 'write' | 'remove',
  held?: string | null,
) {
  if (read === undefined || held === null || read === held) return;
  const now = String(yield* definitionRevisionNow(kind, namespace, name));
  if (now !== read)
    return yield* Effect.fail(
      new Conflict({
        message: `the ${kind} ${name} changed since it was read (it is at revision ${now}, not ${read}), and a ${what} would lose what changed: read it again, make the change on what it holds now, and ${what} that`,
      }),
    );
});

/**
 * The index read again once a writer has changed a definition, so what the writer answers stands at a revision the keyspace holds. A
 * sweep that cannot read leaves the write standing: the daemon's next sweep numbers it.
 */
export const definitionsSwept = () => Effect.ignore(indexSweep());
