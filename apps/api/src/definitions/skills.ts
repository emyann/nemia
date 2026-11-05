/**
 * The skills group's handlers (`objects`' `Api`): a namespace's skills as objects, each place read itself so a name two places hold is
 * served once, first origin wins, and `?origin=` reads each: the factory's tree (`<tree>/workflows/skills`), the repository
 * (its own skills folder, `repoSkillsDir`, then `workflows/skills`), yours (`librarySkills`) and Nemia's builtin (`BUILTIN_SKILLS`).
 * Its spec is the SKILL.md as a draft (`skillDraftOf`), or its body alone where it does not read as one (`status.error` says why).
 *
 * Writes are yours, in `default` alone (`writeGoes`), through `skills write`: made, written whole or its `preload:` alone at the
 * `metadata.resourceVersion` it was read at, and a builtin one copied to yours (`copy`). `files` lists a skill's files by their path in it.
 */
import path from 'node:path';
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { BUILTIN_SKILLS, definitionRevision, skillCopyCommand } from 'agent-orchestrator';
import { SKILLS_FOLDER, skillDraftOf, splitFrontmatter, type SkillDraft } from 'agent-orchestrator/workflow';
import { Api, API_VERSION, Invalid, type Skill, type SkillSpec } from 'objects';
import type { Served } from '../layer.ts';
import {
  librarySkills,
  listSkills,
  readAt,
  readsOf,
  repoSkillsDir,
  skillDraftFrom,
  skillVersionAt,
  skillUsers,
  written,
  yourSkillsRead,
  type SkillRow,
} from '../agents/skills.ts';
import { queryOf } from '../factory-parts/index.ts';
import { answeredWrite as answered, statusRefused } from '../objects/refused.ts';
import { filesUnder, skillFoldersIn, skillTextOf } from '../workflows/builder.ts';
import { commandNamed, runPlaced } from '../store.ts';
import { listed, originAsked, servedNamed, servedOf, thereOf, writeGoes, writtenAt, type Held, type Origin } from './served.ts';

const WRITE = commandNamed('skills write');

/** What a write sends, said by its refusals. */
const SHAPE =
  '`{ "metadata": { "name"?, "resourceVersion"? }, "spec": { "body", "title"?, "description"?, "tags"?, "examples"?, "preload"? } }`, or `{ "metadata": { "resourceVersion" }, "preload": true | false }`';

/** A skill as a place holds it: its folder, and what its SKILL.md reads as (`SkillRead`), or why it does not. */
type Row = Pick<SkillRow, 'dir' | 'entry' | 'error' | 'preload' | 'cost'>;

/**
 * Every skill the namespace holds, at each origin: the factory's tree's, read here; yours, the repository's and the builtin as the picker
 * lists them (`listSkills`: where an agent of yours finds each name, a link or a SKILL.md that does not read listed with why).
 */
async function heldIn(s: Served): Promise<Held<Row>[]> {
  const tree = s.factory?.tree === undefined ? undefined : path.join(s.factory.tree, 'workflows', SKILLS_FOLDER);
  const names = tree === undefined ? [] : skillFoldersIn(tree);
  const dirs = names.map((name) => path.join(tree ?? '', name));
  const reads = dirs.length ? await readsOf(s.e, s.placeService, dirs, s.home) : {};
  const places = await listSkills(s.e, s.placeService, s.repo, s.home, await s.inRequest(yourSkillsRead(s.repo, s.home)));
  const theirs = repoSkillsDir(s.repo);
  const listedRepo = new Set(places.flatMap((p) => (p.from === 'repo' ? p.skills.map((row) => row.name) : [])));
  const folded = skillFoldersIn(theirs)
    .filter((name) => !listedRepo.has(name))
    .map((name) => path.join(theirs, name));
  const foldedReads = folded.length ? await readsOf(s.e, s.placeService, folded, s.home) : {};
  return [
    ...dirs.map((dir, i) => ({ name: names[i] ?? '', origin: 'factory' as const, item: { dir, ...readAt(reads, dir) } })),
    ...folded.map((dir) => ({ name: path.basename(dir), origin: 'repo' as const, item: { dir, ...readAt(foldedReads, dir) } })),
    ...places.flatMap((place) => place.skills.map((row) => ({ name: row.name, origin: place.from, item: row }))),
  ];
}

/** A SKILL.md as the object's spec: its draft, or its body alone where it does not read as one; nothing read through a link refused. */
function specOf({ dir, error }: Row, name: string): SkillSpec {
  const file = path.join(dir, 'SKILL.md');
  const text = skillTextOf(dir, error !== null);
  if (text === null) return { body: '' };
  let draft: SkillDraft | null = null;
  try {
    draft = skillDraftOf(file, name, text);
  } catch {}
  if (draft !== null) {
    const { name: _name, ...spec } = draft;
    return spec;
  }
  try {
    return { body: splitFrontmatter(file, text).body };
  } catch {
    return { body: text.trim() };
  }
}

/** The objects of the skills `served`, read now. */
async function objectsOf(s: Served, namespace: string, served: ReturnType<typeof servedOf<Row>>): Promise<Skill[]> {
  const read = served.filter(({ item }) => item.error === null).map(({ item }) => item.dir);
  const versions = new Map(
    await Promise.all(read.map(async (dir) => [dir, await skillVersionAt(s.e, s.placeService, dir, s.home)] as const)),
  );
  return s.inRequest(
    Effect.forEach(served, ({ name, origin, shadowedBy, item: row }) =>
      Effect.gen(function* () {
        const { dir, entry, error, preload, cost } = row;
        const version = versions.get(dir) ?? '';
        const revision = yield* definitionRevision('skill', name, version);
        const usedBy = yield* skillUsers(dir, name, s.repo, s.home);
        const copyHint =
          origin === 'yours'
            ? skillCopyCommand(dir, repoSkillsDir(s.repo))
            : origin === 'repo'
              ? skillCopyCommand(dir, librarySkills(s.home))
              : null;
        return {
          apiVersion: API_VERSION,
          kind: 'Skill' as const,
          metadata: { name, namespace, creationTimestamp: writtenAt(path.join(dir, 'SKILL.md')), resourceVersion: version },
          spec: specOf(row, name),
          status: {
            origin,
            ...(shadowedBy !== null && { shadowedBy }),
            revision,
            dir,
            entry,
            error,
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

/** The skill `name` the namespace serves (from `asked`, where one is), read now. */
async function skillAt(s: Served, namespace: string, name: string, asked?: Origin): Promise<Skill> {
  const [one] = await objectsOf(s, namespace, [servedNamed(await heldIn(s), name, asked, listPath(namespace))]);
  if (one === undefined) throw new Error(`${name} was served and then not read.`);
  return one;
}

/** A spec as the draft the package writes, named `name`; refused as `skillDraftFrom` refuses it. */
const draftOf = (spec: SkillSpec, name: string, route: string): SkillDraft => {
  const draft = skillDraftFrom({ ...spec, name }, route, SHAPE);
  if ('status' in draft) throw statusRefused(draft);
  return draft;
};

export const skillsHandlers = HttpApiBuilder.group(Api, 'skills', (handlers) =>
  handlers
    .handle('list', ({ params: { namespace }, query }) =>
      answered(async (s) => {
        const { origin, ...page } = query;
        return listed('Skill', await objectsOf(s, namespace, servedOf(await heldIn(s), originAsked(origin))), queryOf(page));
      }),
    )
    .handle('get', ({ params: { namespace, name }, query }) => answered((s) => skillAt(s, namespace, name, originAsked(query.origin))))
    .handle('create', ({ params: { namespace }, payload }) =>
      answered(async (s) => {
        const route = `POST /api/namespaces/${namespace}/skills`;
        const name = payload.metadata.name;
        if (name === undefined || !('spec' in payload))
          throw new Invalid({ error: `${route} makes a skill from its name and its spec: ${SHAPE}.` });
        writeGoes(namespace, 'create', thereOf(await heldIn(s), name));
        await written(s.e, s.placeService, s.inRequest, draftOf(payload.spec, name, route), { version: null }, s.repo, s.home);
        return skillAt(s, namespace, name, 'yours');
      }),
    )
    .handle('replace', ({ params: { namespace, name }, payload }) =>
      answered(async (s) => {
        const route = `PUT /api/namespaces/${namespace}/skills/${name}`;
        writeGoes(namespace, 'replace', thereOf(await heldIn(s), name));
        const version = payload.metadata.resourceVersion;
        if (version === undefined)
          throw new Invalid({
            error: `${route} takes the resourceVersion the Skill was read at, so a skill changed since is not written over.`,
          });
        if (payload.metadata.name !== undefined && payload.metadata.name !== name)
          throw new Invalid({
            error: `${route}: a skill's name is its folder, and every agent that gives it names it: write a new skill under the new name, and give it in their place.`,
          });
        const change = 'spec' in payload ? draftOf(payload.spec, name, route) : { name, preload: payload.preload };
        await written(s.e, s.placeService, s.inRequest, change, { version, name }, s.repo, s.home);
        return skillAt(s, namespace, name, 'yours');
      }),
    )
    .handle('copy', ({ params: { namespace, name } }) =>
      answered(async (s) => {
        writeGoes(namespace, 'act', thereOf(await heldIn(s), name));
        await runPlaced(s, s.e, WRITE.handler({ from: 'yours', copy: name, builtin: BUILTIN_SKILLS }, undefined, s.home));
        return skillAt(s, namespace, name, 'yours');
      }),
    )
    .handle('files', ({ params: { namespace, name }, query }) =>
      answered(async (s) => ({
        paths: filesUnder(servedNamed(await heldIn(s), name, originAsked(query.origin), listPath(namespace)).item.dir),
      })),
    ),
);
