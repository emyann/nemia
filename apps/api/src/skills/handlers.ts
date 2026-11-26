/**
 * The skills group's handlers (`objects`' `Api`): a namespace's skills as objects, each place read itself so a name two places hold is
 * served once, first origin wins, and `?origin=` reads each: the factory's tree (`<tree>/workflows/skills`), the repository
 * (its own skills folder, `repoSkillsDir`, then `workflows/skills`), yours (`librarySkills`) and Nemia's builtin (`BUILTIN_SKILLS`).
 * Its spec is the SKILL.md as a draft, or its body alone where it does not read as one, `status.error` saying why (`skillSpecOf`), and
 * the folder's other text files (`spec.files`, at any depth), left out where it has none.
 *
 * The store's library, in no namespace (`/api/skills`): the person's skills beside the builtins, each with the factories that use it
 * (`libraryUsers`) and, on the person's copy of a builtin, whether the builtin changed since (`builtinChanged`). Writes are the person's,
 * at the library alone (`writeGoes`), through `skills write`: made, written whole or its `preload:` alone at the
 * `metadata.resourceVersion` it was read at — its `spec.files`, where given, the whole set of the folder's other text files, so one left
 * out is removed and a file that is not text left —, a builtin one copied to the person's (`copyLibrary`, a replace of a builtin copying
 * it first), and one removed unless a factory uses it. A write sent to a namespace is refused, naming its way. `files` lists a skill's
 * files by their path in it.
 */
import path from 'node:path';
import { Effect } from 'effect';
import {
  BUILTIN_SKILLS,
  builtinCopies,
  definitionJudged,
  definitionRevisionNow,
  definitionRevisionsNow,
  skillVersion,
  skillRemoved,
  libraryUsers,
  recordBuiltinCopy,
  SKILLS_WRITE,
  skillCopyCommand,
  skillTable,
} from 'agent-orchestrator';
import { frontmatterKey, SKILLS_FOLDER, skillDraftOf, skillNameRefusal, WorkflowError } from 'agent-orchestrator/workflow';
import { Api, API_VERSION, type DefinitionFiles, Invalid, type Skill, type SkillSpec, type SkillWrite } from 'objects';
import type { Served } from '../layer.ts';
import { repoLayer } from '../factory/place.ts';
import {
  librarySkills,
  listSkills,
  readAt,
  readsOf,
  repoSkillsDir,
  skillDraftFrom,
  skillSpecOf,
  skillShownAt,
  skillUsers,
  written,
  yourSkillsRead,
  type SkillRow,
} from './skills.ts';
import { queryOf } from '../factory/parts/index.ts';
import { answered, answeredWriteIn, readerRefused } from '../objects/refused.ts';
import { wantsTable } from '../objects/table.ts';
import { filesUnder, skillFoldersIn, skillTextOf } from '../workflows/builder.ts';
import {
  addsGated,
  listed,
  originIn,
  servedNamed,
  servedOf,
  thereOf,
  namespacedWriteRefused,
  writeGoes,
  writtenAt,
  type Held,
  type Origin,
} from '../definitions/served.ts';
import { readsBounded } from '../objects/answer-bound.ts';

/** What a write sends, said by its refusals. */
const SHAPE =
  '`{ "metadata": { "name"?, "resourceVersion"? }, "spec": { "body", "title"?, "description"?, "tags"?, "examples"?, "preload"?, "files"?: [{ "path", "text" }] } }`, or `{ "metadata": { "resourceVersion" }, "preload": true | false }`';

/** A skill as a place holds it: its folder, and what its SKILL.md reads as (`SkillRead`), or why it does not. */
type Row = Pick<SkillRow, 'dir' | 'entry' | 'error' | 'preload' | 'cost'>;

/**
 * The skills of the factory's tree (`<tree>/workflows/skills`), each held at `origin` — `factory` in a namespace, `builtin` for a
 * template's render — read here; none where the factory has no tree. The one reader of a tree's skills.
 * @param s The request's services, its caller and the place it is answered in.
 * @param origin The origin each skill is held at.
 */
export async function treeSkillsHeld(s: Served, origin: Origin) {
  const tree = s.factory?.tree === undefined ? undefined : path.join(s.factory.tree, 'workflows', SKILLS_FOLDER);
  const names = tree === undefined ? [] : skillFoldersIn(tree);
  const dirs = names.map((name) => path.join(tree ?? '', name));
  const reads = dirs.length ? await readsOf(s, dirs) : {};
  return dirs.map((dir, i) => ({ name: names[i] ?? '', origin, item: { dir, ...readAt(reads, dir) } }));
}

/**
 * Every skill the namespace holds, at each origin: the factory's tree's (`treeSkillsHeld`); yours, the repository's and the builtin as the
 * picker lists them (`listSkills`: where an agent of yours finds each name, a link or a SKILL.md that does not read listed with why). On
 * no repository (the default factory with no `?repo=`), the repository's are none.
 */
async function heldIn(s: Served) {
  const own = await treeSkillsHeld(s, 'factory');
  const repo = repoLayer(s);
  const places = await listSkills((dirs) => readsOf(s, dirs), repo, s.home, await s.inRequest(yourSkillsRead(repo, s.home)));
  const theirs = repo === undefined ? undefined : repoSkillsDir(repo);
  const listedRepo = new Set(places.flatMap((p) => (p.from === 'repo' ? p.skills.map((row) => row.name) : [])));
  const folded =
    theirs === undefined
      ? []
      : skillFoldersIn(theirs)
          .filter((name) => !listedRepo.has(name))
          .map((name) => path.join(theirs, name));
  const foldedReads = folded.length ? await readsOf(s, folded) : {};
  return [
    ...own,
    ...folded.map((dir) => ({ name: path.basename(dir), origin: 'repo' as const, item: { dir, ...readAt(foldedReads, dir) } })),
    ...places.flatMap((place) => place.skills.map((row) => ({ name: row.name, origin: place.from, item: row }))),
  ] satisfies Held<Row>[] as Held<Row>[];
}

/**
 * A SKILL.md as the object's spec and why it does not read (`unread`): its draft, or its body alone and the package's words
 * (`skillSpecOf`); nothing read through a link refused, whose refusal the row says; and an empty body where the file cannot be read, with
 * the disk's words.
 */
function specOf({ dir, error }: Row, name: string) {
  const read = skillTextOf(dir, error !== null);
  if ('unread' in read) return { spec: { body: '' }, unread: read.unread } satisfies { spec: SkillSpec; unread: string | null };
  return skillSpecOf(path.join(dir, 'SKILL.md'), name, read.text) satisfies { spec: SkillSpec; unread: string | null };
}

/**
 * The objects of the skills `served`, read now: in `namespace` where one is given, each at its revision there; with none for a template's
 * documents.
 * @param s The request's services, its caller and the place it is answered in.
 * @param served The skills to answer, each with its origin and what shadows it.
 * @param namespace The namespace the objects are in, which each revision is read in; none for a template's documents.
 */
export async function skillObjectsOf(s: Served, served: ReturnType<typeof servedOf<Row>>, namespace?: string) {
  const read = served.filter(({ item }) => item.error === null).map(({ item }) => item.dir);
  const revisions = await s.inRequest(definitionRevisionsNow());
  const shown = new Map(
    await Promise.all(
      read.map(async (dir) => [dir, await skillShownAt(s, dir, revisions.of('Skill', namespace, path.basename(dir)), namespace)] as const),
    ),
  );
  const repo = repoLayer(s);
  return s.inRequest(
    Effect.forEach(served, ({ name, origin, shadowedBy, item: row }) =>
      Effect.gen(function* () {
        const { dir, entry, error, preload, cost } = row;
        const version = shown.get(dir)?.version ?? '';
        const files = shown.get(dir)?.files ?? [];
        const { spec: read, unread } = specOf(row, name);
        const spec: SkillSpec = files.length > 0 ? { ...read, files } : read;
        const usedBy = yield* skillUsers(dir, name, repo, s.home, s.factory?.tree);
        const copyHint =
          origin === 'user'
            ? repo === undefined
              ? null
              : skillCopyCommand(dir, repoSkillsDir(repo))
            : origin === 'repo'
              ? skillCopyCommand(dir, librarySkills(s.home))
              : null;
        return {
          apiVersion: API_VERSION,
          kind: 'Skill' as const,
          metadata: {
            name,
            ...(namespace !== undefined && { namespace }),
            creationTimestamp: writtenAt(path.join(dir, 'SKILL.md')),
            resourceVersion: version,
          },
          spec,
          status: {
            origin,
            ...(shadowedBy !== null && { shadowedBy }),
            dir,
            entry,
            error: error ?? unread,
            preload,
            cost,
            usedBy,
            found: 'found' in row ? ((row as SkillRow).found ?? null) : null,
            copyHint,
          },
        } satisfies Skill;
      }),
    ),
  );
}

const listPath = (namespace: string) => `GET /api/namespaces/${namespace}/skills`;

/** The namespace the library is read in: the default factory with no repository, whose skills are the person's and the builtins. */
const LIBRARY = 'default';

/** The library's list, as a refusal names it. */
const LIBRARY_PATH = 'GET /api/skills';

/** The skills the library holds: the person's and the builtins, at each origin. */
const libraryHeld = async (s: Served) =>
  (await heldIn(s)).filter((h) => h.origin === 'user' || h.origin === 'builtin') satisfies Held<Row>[];

/**
 * The library's objects of the skills `served`, in no namespace, each with the factories that use it and, on the person's copy of a
 * builtin, whether the builtin changed since the copy (`builtinCopies`).
 */
async function libraryObjectsOf(s: Served, served: ReturnType<typeof servedOf<Row>>) {
  const copies = builtinCopies(s.home);
  const objects = await skillObjectsOf(s, served);
  return Promise.all(
    objects.map(async (one) => {
      const name = one.metadata.name;
      const copiedAt = one.status.origin === 'user' ? copies[`Skill/${name}`] : undefined;
      const builtinNow = copiedAt === undefined ? undefined : builtinVersion(name);
      return {
        ...one,
        status: {
          ...one.status,
          factories: await s.inRequest(libraryUsers(s.home, { kind: 'Skill', name })),
          ...(copiedAt !== undefined && builtinNow !== undefined && { builtinChanged: builtinNow !== copiedAt }),
        },
      };
    }),
  );
}

/** The version of Nemia's builtin skill `name` now, or undefined where Nemia builds in none. */
const builtinVersion = (name: string) =>
  skillFoldersIn(BUILTIN_SKILLS).includes(name) ? (skillVersion(path.join(BUILTIN_SKILLS, name)) ?? undefined) : undefined;

/** The library's skill `name` (from `asked`, where one is), read now. */
async function libraryAt(s: Served, name: string, asked?: Origin) {
  const [one] = await libraryObjectsOf(s, [servedNamed(await libraryHeld(s), name, asked, LIBRARY_PATH)]);
  if (one === undefined) throw new Error(`${name} was served and then not read.`);
  return one satisfies Skill as Skill;
}

/** The builtin skill `name` copied to the person's, its digest at the copy recorded so a later change of it is flagged. */
async function copied(s: Served, name: string) {
  const version = builtinVersion(name);
  await s.inRequest(SKILLS_WRITE.handler({ from: 'user', copy: name, builtin: BUILTIN_SKILLS }));
  if (version !== undefined) recordBuiltinCopy(s.home, `Skill/${name}`, version);
}

/** The skill `name` the namespace serves (from `asked`, where one is), read now. */
async function skillAt(s: Served, namespace: string, name: string, asked?: Origin) {
  const [one] = await skillObjectsOf(
    s,
    [servedNamed(addsGated(s.home, namespace, 'skills', await heldIn(s)), name, asked, listPath(namespace))],
    namespace,
  );
  if (one === undefined) throw new Error(`${name} was served and then not read.`);
  return one satisfies Skill as Skill;
}

/**
 * A spec as the change the package writes, named `name`: its draft, refused as `skillDraftFrom` refuses it, and its `files` where given,
 * which the package judges.
 */
const draftOf = (spec: SkillSpec, name: string, route: string) => {
  const { files, ...lines } = spec;
  const draft = skillDraftFrom({ ...lines, name }, route, SHAPE);
  if ('status' in draft) throw readerRefused(draft);
  return { ...draft, ...(files !== undefined && { files }) };
};

const READ_ROUTE = 'POST /api/skills/read';

/**
 * A skill's files read into its spec, as a GET of the same files written to yours answers it, writing nothing: the first file its
 * SKILL.md, read by the package's reader (`skillDraftOf`), named by its `name:`, else by `name`; the files after it the folder's other
 * text files (`spec.files`), left out where none is sent. Refused `Invalid`, naming the file, for a SKILL.md that does not read, and for
 * one that names no skill where `name` is not sent.
 */
function skillReadOf({ name, files }: DefinitionFiles) {
  const [file, ...others] = files;
  if (file === undefined) throw new Invalid({ error: `${READ_ROUTE} reads a skill's SKILL.md: send it first in \`files\`.` });
  const unread = (err: unknown): never => {
    if (!(err instanceof WorkflowError)) throw err;
    throw new Invalid({ error: `${READ_ROUTE}: ${file.path} does not read: ${err.message}` });
  };
  let skill: string | undefined;
  try {
    skill = frontmatterKey(file.text, 'name') ?? name;
  } catch (err) {
    return unread(err);
  }
  if (skill === undefined)
    throw new Invalid({ error: `${READ_ROUTE}: ${file.path} says no name:, and none was sent: write its name: line, or send \`name\`.` });
  const wrong = skillNameRefusal(skill);
  if (wrong !== undefined) throw new Invalid({ error: `${READ_ROUTE}: ${file.path}: ${wrong}` });
  let read: ReturnType<typeof skillDraftOf>;
  try {
    read = skillDraftOf(file.path, skill, file.text);
  } catch (err) {
    return unread(err);
  }
  const { name: _name, ...spec } = read;
  const rest = [...others].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { metadata: { name: skill }, spec: rest.length > 0 ? { ...spec, files: rest } : spec };
}

/** The skill `payload` names made in the user library, read back. */
async function libraryCreated(s: Served, payload: SkillWrite) {
  const route = 'POST /api/skills';
  const name = payload.metadata.name;
  if (name === undefined || !('spec' in payload))
    throw new Invalid({ error: `${route} makes a skill from its name and its spec: ${SHAPE}.` });
  writeGoes('library', 'create', thereOf(await libraryHeld(s), name));
  await written(s, draftOf(payload.spec, name, route), { version: null });
  return libraryAt(s, name, 'user');
}

/** The library's skill `name` written over from `payload`, a builtin copied to the user library first, read back. */
async function libraryReplaced(s: Served, name: string, payload: SkillWrite) {
  const route = `PUT /api/skills/${name}`;
  const there = thereOf(await libraryHeld(s), name);
  writeGoes('library', 'replace', there);
  const read = payload.metadata.resourceVersion;
  if (read === undefined)
    throw new Invalid({
      error: `${route} takes the resourceVersion the Skill was read at, so a skill changed since is not written over.`,
    });
  if (payload.metadata.name !== undefined && payload.metadata.name !== name)
    throw new Invalid({
      error: `${route}: a skill's name is its folder, and every agent that gives it names it: write a new skill under the new name, and give it in their place.`,
    });
  if (there === 'builtin') {
    await s.inRequest(definitionJudged('Skill', undefined, name, read, 'write'));
    await copied(s, name);
  }
  const version = there === 'builtin' ? String(await s.inRequest(definitionRevisionNow('Skill', undefined, name))) : read;
  const change = 'spec' in payload ? draftOf(payload.spec, name, route) : { name, preload: payload.preload };
  await written(s, change, { version, name });
  return libraryAt(s, name, 'user');
}

export const skillsHandlers = readsBounded(Api, 'skills', (handlers) =>
  handlers
    .handle('list', ({ params: { namespace }, query }) =>
      Effect.flatMap(wantsTable, (table) =>
        answeredWriteIn(namespace, async (s) => {
          const { origin, ...page } = query;
          const list = listed(
            'Skill',
            await skillObjectsOf(s, servedOf(addsGated(s.home, namespace, 'skills', await heldIn(s)), originIn(s, origin)), namespace),
            queryOf(page),
          );
          return table ? skillTable(list) : list;
        }),
      ),
    )
    .handle('get', ({ params: { namespace, name }, query }) =>
      answeredWriteIn(namespace, (s) => skillAt(s, namespace, name, originIn(s, query.origin))),
    )
    .handle('create', ({ params: { namespace }, payload }) =>
      answeredWriteIn(namespace, async (s) => {
        namespacedWriteRefused(namespace, 'create', thereOf(await heldIn(s), payload.metadata.name ?? ''));
      }),
    )
    .handle('replace', ({ params: { namespace, name } }) =>
      answeredWriteIn(namespace, async (s) => {
        namespacedWriteRefused(namespace, 'replace', thereOf(await heldIn(s), name));
      }),
    )
    .handle('listLibrary', ({ query }) =>
      Effect.flatMap(wantsTable, (table) =>
        answeredWriteIn(LIBRARY, async (s) => {
          const { origin, ...page } = query;
          const list = listed('Skill', await libraryObjectsOf(s, servedOf(await libraryHeld(s), originIn(s, origin))), queryOf(page));
          return table ? skillTable(list) : list;
        }),
      ),
    )
    .handle('getLibrary', ({ params: { name }, query }) => answeredWriteIn(LIBRARY, (s) => libraryAt(s, name, originIn(s, query.origin))))
    .handle('createLibrary', ({ payload }) => answeredWriteIn(LIBRARY, (s) => libraryCreated(s, payload)))
    .handle('replaceLibrary', ({ params: { name }, payload }) => answeredWriteIn(LIBRARY, (s) => libraryReplaced(s, name, payload)))
    .handle('deleteLibrary', ({ params: { name }, query }) =>
      answeredWriteIn(LIBRARY, async (s) => {
        const held = await libraryHeld(s);
        writeGoes('library', 'remove', thereOf(held, name), await s.inRequest(libraryUsers(s.home, { kind: 'Skill', name })));
        const gone = await libraryAt(s, name, 'user');
        await s.inRequest(skillRemoved(librarySkills(s.home), name, query.resourceVersion));
        return gone;
      }),
    )
    .handle('copyLibrary', ({ params: { name } }) =>
      answeredWriteIn(LIBRARY, async (s) => {
        writeGoes('library', 'act', thereOf(await libraryHeld(s), name));
        await copied(s, name);
        return libraryAt(s, name, 'user');
      }),
    )
    .handle('filesLibrary', ({ params: { name }, query }) =>
      answeredWriteIn(LIBRARY, async (s) => ({
        paths: filesUnder(servedNamed(await libraryHeld(s), name, originIn(s, query.origin), LIBRARY_PATH).item.dir),
      })),
    )
    .handle('read', ({ payload }) => answered(async () => skillReadOf(payload)))
    .handle('files', ({ params: { namespace, name }, query }) =>
      answeredWriteIn(namespace, async (s) => ({
        paths: filesUnder(
          servedNamed(addsGated(s.home, namespace, 'skills', await heldIn(s)), name, originIn(s, query.origin), listPath(namespace)).item
            .dir,
        ),
      })),
    ),
);
