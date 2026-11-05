/**
 * The skills as the board reads them — the Skill objects of a namespace (`objects.ts`), by place, each seen as a `SkillRow`, and one on its
 * page as a `SkillDetail` — a builtin skill copied into your library, and one of yours written on the board, through the Skill object.
 */
import { queryOptions } from '@tanstack/react-query';
import type { DefinitionOrigin, Skill } from 'objects';
import { skills as served, type Refuse } from './objects.ts';
import { cardEntryOf, originWord, type AgentSkill, type SkillCost, type SkillSource } from './library.ts';
import type { PagePlace } from './workflows.ts';

/** The namespace of the api's repository and your library, where the board writes yours. */
const DEFAULT = 'default';

/** One skill as the picker lists it, off its Skill object: its card entry or why no agent can be given it. */
export type SkillRow = {
  name: string;
  from: SkillSource;
  dir: string;
  entry: AgentSkill | null;
  error: string | null;
  preload: boolean;
  cost: SkillCost | null;
  /** The agents of yours that give it. */
  usedBy: string[];
  /** A builtin skill's name, where an agent of yours already finds a skill of it; null elsewhere. */
  found: 'yours' | 'repo' | null;
};

/** One place, in the order an agent of yours finds a name, the builtin last; its folder, null where it holds no skill to say it. */
export type SkillPlace = { from: SkillSource; dir: string | null; skills: SkillRow[] };

/** A builtin skill copied: the copy as it now reads in your library. */
export type SkillAdded = { skill: SkillRow };

/** The folder a skill's folder is in: its place's. */
const parentOf = (dir: string): string => dir.replace(/[\\/]+$/, '').replace(/[\\/][^\\/]*$/, '');

/** A Skill, as the picker lists it (`SkillRow`). */
export const skillRowOf = (skill: Skill): SkillRow => ({
  name: skill.metadata.name,
  from: skill.status.origin,
  dir: skill.status.dir,
  entry: skill.status.entry ? cardEntryOf(skill.status.entry) : null,
  error: skill.status.error,
  preload: skill.status.preload,
  cost: skill.status.cost ? { ...skill.status.cost } : null,
  usedBy: skill.status.usedBy.filter((u) => u.from === 'yours').map((u) => u.name),
  found: skill.status.found,
});

/**
 * The places a namespace's skills are listed by, in the order an agent of yours finds a name: your library, the repository's and Nemia's;
 * in a factory, its own tree first.
 */
export const skillOrigins = (namespace: string): DefinitionOrigin[] =>
  namespace === DEFAULT ? ['yours', 'repo', 'builtin'] : ['factory', 'yours', 'repo', 'builtin'];

/**
 * Every skill of `namespace`'s places, a list each read by its origin (`?origin=`), shadowed or not, read from disk on each request; keyed
 * `['skills']` in the default namespace, the key every write of a skill reads again by.
 */
export const skillsInQuery = (namespace: string) =>
  queryOptions({
    queryKey: namespace === DEFAULT ? ['skills'] : ['skills', namespace],
    queryFn: (): Promise<SkillPlace[]> =>
      Promise.all(
        skillOrigins(namespace).map(async (from) => {
          const skills = (await served.list(namespace, { origin: from })).map(skillRowOf);
          return { from, dir: skills[0] ? parentOf(skills[0].dir) : null, skills };
        }),
      ),
  });

/** Every skill the picker lists, by place, in the default namespace. */
export const skillsQuery = skillsInQuery(DEFAULT);

/** A copy the api refused: its words, and its status — 404 for a skill Nemia does not ship, 409 for a name your library has already. */
export class SkillRefusal extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.status = status;
  }
}

/** How a skill's write is refused: a `SkillRefusal` in the api's words, with its status. */
const refused: Refuse = (words, status) => new SkillRefusal(words, status);

/** Copy the builtin skill `name` into your library, a write of its own: an agent of yours can then be given it. */
export const copySkill = async (name: string): Promise<SkillAdded> => ({
  skill: skillRowOf(await served.copy(DEFAULT, name, refused)),
});

/**
 * A skill as it is written — its name (its folder), a human title, what it does, its card's tags and examples, whether it is loaded every
 * turn, and its instructions. Left out, `preload` keeps the line the file has.
 */
export type SkillDraft = {
  name: string;
  title?: string | null;
  description?: string | null;
  tags?: string[] | null;
  examples?: string[] | null;
  preload?: boolean;
  body: string;
};

/** An agent that gives a skill, by its place and its name. */
export type SkillUser = { from: 'yours' | 'repo'; name: string };

/**
 * One skill on its page — its row, the version a write carries back, its draft (null where its SKILL.md does not read, `body` its
 * instructions all the same), the agents of either place that give this very folder, and the `cp -r` that moves it to the other place.
 */
export type SkillDetail = {
  skill: SkillRow;
  version: string;
  draft: SkillDraft | null;
  body: string;
  users: SkillUser[];
  copyHint: string | null;
};

/** A skill written, as its page now reads it. */
export type SkillSaved = SkillDetail;

/** The draft keys a Skill's spec may say besides its body: one of them there, it reads as a draft. */
const DRAFT_KEYS = ['title', 'description', 'tags', 'examples', 'preload'] as const;

/** A skill's draft, off its spec: null where its SKILL.md does not read as one (`spec` its body alone, `status.error` saying why). */
const draftOf = (skill: Skill): SkillDraft | null => {
  const { spec } = skill;
  if (skill.status.error !== null && !DRAFT_KEYS.some((key) => Object.hasOwn(spec, key))) return null;
  return {
    name: skill.metadata.name,
    ...(spec.title === undefined ? {} : { title: spec.title }),
    ...(spec.description === undefined ? {} : { description: spec.description }),
    ...(spec.tags === undefined ? {} : { tags: spec.tags && [...spec.tags] }),
    ...(spec.examples === undefined ? {} : { examples: spec.examples && [...spec.examples] }),
    ...(spec.preload === undefined ? {} : { preload: spec.preload }),
    body: spec.body,
  };
};

/** A Skill, as its page reads it (`SkillDetail`). */
export const skillDetailOf = (skill: Skill): SkillDetail => ({
  skill: skillRowOf(skill),
  version: skill.metadata.resourceVersion,
  draft: draftOf(skill),
  body: skill.spec.body,
  users: skill.status.usedBy.map((u) => ({ ...u })),
  copyHint: skill.status.copyHint,
});

/**
 * One skill, read from disk now, in `place`'s factory on its repository (none: the default namespace): its page's read. Under
 * `skillsQuery`'s key, so a write that reads the list again reads it again too.
 */
export const skillQuery = (from: string, name: string, place: PagePlace = {}) =>
  queryOptions({
    queryKey: place.factory ? ['skills', from, name, place.factory, place.repo ?? null] : ['skills', from, name],
    queryFn: async () =>
      skillDetailOf(
        await served.get(place.factory ?? DEFAULT, name, { origin: originWord(from), ...(place.repo ? { repo: place.repo } : {}) }),
      ),
  });

/** A draft as the Skill object's spec says it: every key it sets; one it leaves out stays out. */
const specOfDraft = ({ name: _, ...spec }: SkillDraft) => spec;

/**
 * A new skill of yours, written in your library: refused, in the package's words, for a name it has already or a draft the card reader
 * refuses.
 */
export const createSkill = async (draft: SkillDraft): Promise<SkillSaved> =>
  skillDetailOf(await served.create(DEFAULT, { metadata: { name: draft.name }, spec: specOfDraft(draft) }, refused));

/** A skill of yours written again, whole, at the version it was read at: refused 409 when it has changed since. */
export const saveSkill = async (name: string, version: string, draft: SkillDraft): Promise<SkillSaved> =>
  skillDetailOf(await served.replace(DEFAULT, name, { metadata: { resourceVersion: version }, spec: specOfDraft(draft) }, refused));

/** A skill of yours loaded every turn, or named for a session to load: its `preload:` line alone, at the version it was read at. */
export const switchPreload = async (name: string, version: string, preload: boolean): Promise<SkillSaved> =>
  skillDetailOf(await served.replace(DEFAULT, name, { metadata: { resourceVersion: version }, preload }, refused));
