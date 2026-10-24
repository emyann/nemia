/**
 * The skills an agent of yours can be given, a skill Nemia ships copied into your library, one skill on its page, and one of yours written
 * on the board (apps/api/src/agents/skills.ts).
 */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { decodes } from './decodes.ts';
import { get, send, type SendHow } from './read.ts';
import { AgentSkillSchema, SkillCostSchema, SkillSourceSchema, type AgentSkill, type SkillCost, type SkillSource } from './library.ts';

/** A list of strings, as a decoded answer holds it: mutable, as the plain types say. */
const Strings = Schema.mutable(Schema.Array(Schema.String));

/**
 * Mirrors `SkillRow` in apps/api/src/agents/skills.ts: one skill as the picker lists it, its card entry or why no agent can be given it.
 */
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
  /** A shipped skill's name, where an agent of yours already finds a skill of it; null elsewhere. */
  found: 'yours' | 'repo' | null;
};

/** Decodes a `SkillRow`. */
const SkillRowSchema = decodes<SkillRow>()(
  Schema.Struct({
    name: Schema.String,
    from: SkillSourceSchema,
    dir: Schema.String,
    entry: Schema.NullOr(AgentSkillSchema),
    error: Schema.NullOr(Schema.String),
    preload: Schema.Boolean,
    cost: Schema.NullOr(SkillCostSchema),
    usedBy: Strings,
    found: Schema.NullOr(Schema.Literals(['yours', 'repo'])),
  }),
);

/** Mirrors `SkillPlace`: one place, in the order an agent of yours finds a name, the shipped last. */
export type SkillPlace = { from: SkillSource; dir: string; skills: SkillRow[] };

/** Decodes a `SkillPlace`. */
const SkillPlaceSchema = decodes<SkillPlace>()(
  Schema.Struct({
    from: SkillSourceSchema,
    dir: Schema.String,
    skills: Schema.mutable(Schema.Array(SkillRowSchema)),
  }),
);

/** Mirrors `SkillAdded`: the copied skill as it now reads in your library, and its files. */
export type SkillAdded = { skill: SkillRow; written: string[] };

/** Decodes a `SkillAdded`. */
const SkillAddedSchema = decodes<SkillAdded>()(Schema.Struct({ skill: SkillRowSchema, written: Strings }));

/** Every skill the picker lists, by place, read from disk on each request. */
export const skillsQuery = queryOptions({
  queryKey: ['skills'],
  queryFn: () => get('/api/skills', Schema.mutable(Schema.Array(SkillPlaceSchema))),
});

/** A copy the api refused: its words, and its status — 404 for a skill Nemia does not ship, 409 for a name your library has already. */
export class SkillRefusal extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.status = status;
  }
}

/** How a skill's write is refused: a `SkillRefusal` in the api's words, with its status. */
const refused: SendHow['refused'] = (words, status) => new SkillRefusal(words, status);

/** What a skill's write may have done, and what to look at before writing it again. */
const WRITTEN = 'The skill may be written: read the skills again before writing it again.';

/** Copy the skill Nemia ships under `name` into your library, a write of its own: an agent of yours can then be given it. */
export const copySkill = (name: string): Promise<SkillAdded> =>
  send('POST', '/api/skills/yours', SkillAddedSchema, { body: { copy: name }, may: WRITTEN, refused });

/**
 * Mirrors `SkillDraft` in the package: a skill as it is written — its name (its folder), a human title, what it does, its card's tags and
 * examples, whether it is loaded every turn, and its instructions. Left out, `preload` keeps the line the file has.
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

/** Decodes a `SkillDraft`: a key it leaves out stays out. */
const SkillDraftSchema = decodes<SkillDraft>()(
  Schema.Struct({
    name: Schema.String,
    title: Schema.optionalKey(Schema.NullOr(Schema.String)),
    description: Schema.optionalKey(Schema.NullOr(Schema.String)),
    tags: Schema.optionalKey(Schema.NullOr(Strings)),
    examples: Schema.optionalKey(Schema.NullOr(Strings)),
    preload: Schema.optionalKey(Schema.Boolean),
    body: Schema.String,
  }),
);

/** Mirrors `SkillUser`: an agent that gives a skill, by its place and its name. */
export type SkillUser = { from: 'yours' | 'repo'; name: string };

/** Decodes a `SkillUser`. */
const SkillUserSchema = decodes<SkillUser>()(Schema.Struct({ from: Schema.Literals(['yours', 'repo']), name: Schema.String }));

/**
 * Mirrors `SkillDetail`: one skill on its page — its row, the version a write carries back, its draft (null where its SKILL.md does not
 * read, `body` its instructions all the same), the agents of either place that give this very folder, and the `cp -r` that moves it to the
 * other place.
 */
export type SkillDetail = {
  skill: SkillRow;
  version: string;
  draft: SkillDraft | null;
  body: string;
  users: SkillUser[];
  copyHint: string | null;
};

/** Decodes a `SkillDetail`. */
const SkillDetailSchema = decodes<SkillDetail>()(
  Schema.Struct({
    skill: SkillRowSchema,
    version: Schema.String,
    draft: Schema.NullOr(SkillDraftSchema),
    body: Schema.String,
    users: Schema.mutable(Schema.Array(SkillUserSchema)),
    copyHint: Schema.NullOr(Schema.String),
  }),
);

/** Mirrors `SkillSaved`: a skill written, as its page now reads it. */
export type SkillSaved = SkillDetail & { written: string[] };

/** Decodes a `SkillSaved`. */
const SkillSavedSchema = decodes<SkillSaved>()(Schema.Struct({ ...SkillDetailSchema.fields, written: Strings }));

/** One skill, read from disk now: its page's read. Under `skillsQuery`'s key, so a write that reads the list again reads it again too. */
export const skillQuery = (from: string, name: string) =>
  queryOptions({
    queryKey: ['skills', from, name],
    queryFn: () => get(`/api/skills/${encodeURIComponent(from)}/${encodeURIComponent(name)}`, SkillDetailSchema),
  });

/** A skill written by `method` to `url`, sent as `application/json`: rejected with a `SkillRefusal`, or an `UnreadAnswer`. */
const written = (method: 'POST' | 'PUT', url: string, body: unknown): Promise<SkillSaved> =>
  send(method, url, SkillSavedSchema, { body, may: WRITTEN, refused });

/**
 * A new skill of yours, written in your library: refused, in the package's words, for a name it has already or a draft the card reader
 * refuses.
 */
export const createSkill = (draft: SkillDraft): Promise<SkillSaved> => written('POST', '/api/skills/yours', { skill: draft });

/** A skill of yours written again, whole, at the version it was read at: refused 409 when it has changed since. */
export const saveSkill = (name: string, version: string, draft: SkillDraft): Promise<SkillSaved> =>
  written('PUT', `/api/skills/yours/${encodeURIComponent(name)}`, { version, skill: draft });

/** A skill of yours loaded every turn, or named for a session to load: its `preload:` line alone, at the version it was read at. */
export const switchPreload = (name: string, version: string, preload: boolean): Promise<SkillSaved> =>
  written('PUT', `/api/skills/yours/${encodeURIComponent(name)}`, { version, preload });
