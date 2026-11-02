/**
 * The Skill door's contract (`SkillDoor`, `src/skills/skill-door.store.ts`), as walks (`door-walks.ts`): every method's rows, run on the
 * files by `src/skills/skill-door.store.test.ts` and on the memory stand-in by `src/skills/skill-memory.store.test.ts`. A skill written is
 * listed, there at a version, read back as its card entry and its text, found before a builtin place skill of its name, changed at its
 * version — whole, or its `preload:` alone — and copied whole into the library; and the write check: a stale version, a new skill at a
 * name taken, a name that is no skill's, a version of one gone, no description and one with a line break, a copy onto a name taken and
 * of a skill the source has not, are each refused with nothing written.
 *
 * Each walk is on a side of its own: a fresh store, or a fresh stand-in. A skill planted outside the store's library — a repository's two
 * places, a source to copy from — is written there with `{ anywhere: true }`, as the copy of an agent writes. A link, the staged copy and
 * the default door's root are the files' alone: `skill-door.store.test.ts` holds them.
 */
import path from 'node:path';
import type { DoorSide, DoorWalk } from './door-walks.ts';
import { act, done } from './door-walks.ts';
import type { SkillDoorShape } from '../src/skills/skill-door.store.ts';
import { SkillName } from '../src/agents/agents.model.ts';
import { renderSkill, type SkillDraft } from '../src/skills/skills.ts';
import { PLACE_SKILLS } from '../src/skills/read.store.ts';
import { WorkflowError } from '../src/step/step.ts';

type Walk = DoorWalk<SkillDoorShape>;
type Side = DoorSide<SkillDoorShape>;

/** A skill drafted as the board's form sends one: `tidy-notes` unless named, with a description and instructions. */
export const aSkill = (name = 'tidy-notes', more: Partial<SkillDraft> = {}): SkillDraft => ({
  name,
  title: 'Tidy notes',
  description: 'Rewrites a folder of notes, one fact a line.',
  tags: ['notes'],
  body: '# Tidy notes\n\nRead each note, then write it again.',
  ...more,
});

/** The store's library on a side: `<root>/workflows/skills`, where a skill of yours is written. */
export const libraryOn = ({ root }: Side): string => `${root}/workflows/skills`;

/** `name`, as the door takes it. */
const named = (name: string): SkillName => SkillName.read(name);

/** `draft` made in the library of a side (or in `at`, anywhere), at the version its write answered. */
const made = (side: Side, draft: SkillDraft = aSkill(), at = libraryOn(side)): string =>
  done(side.door.skills.write(named(draft.name), draft, undefined, at, { anywhere: at !== libraryOn(side) })).version;

/** What a refused act leaves of the library: the skills it holds. */
const left = (side: Side): readonly string[] => done(side.door.skills.list(libraryOn(side)));

/** What a refused write of `draft` (`version`, none for a new one) answers, and what it leaves of the library. */
const refusedWrite = (side: Side, draft: SkillDraft, version?: string) => ({
  write: act(side.door.skills.write(named(draft.name), draft, version, libraryOn(side))),
  left: left(side),
});

/** A found skill as a walk compares it: its folder, or `refused` for a name the package refuses to choose for. */
const shown = (at: string | WorkflowError | undefined): unknown => (at instanceof WorkflowError ? { refused: at._tag } : at);

/** What the store's own lookup finds, a workflow of yours being started: `<root>/workflows/dev`, the store its home. */
const foundOn = (side: Side) => done(side.door.skills.found({ dir: `${side.root}/workflows/dev`, places: { home: side.root } }));

/** A source to copy from on a side, outside the store's library: `<root>/source/skills`, holding `tidy-notes`. */
const sourceOn = (side: Side): string => {
  const at = `${side.root}/source/skills`;
  made(side, aSkill(), at);
  return at;
};

export const SKILL_WALKS: Readonly<Record<string, readonly Walk[]>> = {
  'skills.found': [
    {
      name: 'a builtin place skill no root holds, found last; a name none holds is none, where every root was looked in',
      walk: (side) => {
        const found = foundOn(side);
        return { git: shown(found.at.get('git')), nothing: shown(found.at.get('nothing')), looked: found.looked };
      },
      says: {
        git: path.join(PLACE_SKILLS, 'git'),
        nothing: undefined,
        looked: ['<root>/workflows/skills', PLACE_SKILLS],
      },
    },
    {
      name: 'a skill of yours, before the builtin place skill of its name, which is found after every root',
      walk: (side) => {
        made(side, aSkill('zeta'));
        const before = [...foundOn(side).all.keys()];
        made(side, aSkill('git'));
        return { before, git: shown(foundOn(side).at.get('git')) };
      },
      says: { before: ['zeta', 'git'], git: '<root>/workflows/skills/git' },
    },
    {
      name: 'REFUSED: a name in both places of one repository is refused, never chosen',
      walk: (side) => {
        const repo = `${side.root}/repo`;
        made(side, aSkill(), `${repo}/workflows/skills`);
        made(side, aSkill(), `${repo}/.claude/skills`);
        const found = done(side.door.skills.found({ dir: `${repo}/workflows/dev`, places: { repo } }));
        return shown(found.at.get('tidy-notes'));
      },
      says: { refused: 'Invalid' },
    },
  ],
  'skills.list': [
    { name: 'none in an empty store', walk: (side) => left(side), says: [] },
    {
      name: 'each written, by name, sorted',
      walk: (side) => {
        made(side, aSkill('zeta'));
        made(side, aSkill('alpha'));
        return left(side);
      },
      says: ['alpha', 'zeta'],
    },
    {
      name: 'REFUSED: a holder that is no whole path is Invalid',
      walk: (side) => act(side.door.skills.list('workflows/skills')),
      says: { refused: 'Invalid' },
    },
  ],
  'skills.read': [
    {
      name: 'its card entry, its cost, its text as written, at the version it is there at',
      walk: (side) => {
        made(side);
        const { entry, error, preload, cost, text, version } = done(side.door.skills.read(named('tidy-notes'), libraryOn(side)));
        const there = done(side.door.skills.there(named('tidy-notes'), libraryOn(side)));
        return { entry, error, preload, listed: (cost?.listed ?? 0) > 0, text, at: there.kind === 'held' && there.version === version };
      },
      says: {
        entry: { id: 'tidy-notes', name: 'Tidy notes', description: 'Rewrites a folder of notes, one fact a line.', tags: ['notes'] },
        error: null,
        preload: false,
        listed: true,
        text: renderSkill(aSkill()),
        at: true,
      },
    },
    {
      name: 'none there: no entry, no cost, no text nor version, and why',
      walk: (side) => {
        const { entry, error, cost, text, version } = done(side.door.skills.read(named('tidy-notes'), libraryOn(side)));
        return { entry, said: error !== null, cost, text, version };
      },
      says: { entry: null, said: true, cost: null, text: '', version: null },
    },
  ],
  'skills.there': [
    {
      name: 'nothing before it is written',
      walk: (side) => done(side.door.skills.there(named('tidy-notes'), libraryOn(side))),
      says: { kind: 'none' },
    },
    {
      name: 'held at the version its write answered',
      walk: (side) => {
        const version = made(side);
        const there = done(side.door.skills.there(named('tidy-notes'), libraryOn(side)));
        return there.kind === 'held' && there.version === version;
      },
      says: true,
    },
  ],
  'skills.write': [
    {
      name: 'a new skill: made, its SKILL.md as rendered',
      walk: (side) => {
        const { dir, name, written } = done(side.door.skills.write(named('tidy-notes'), aSkill(), undefined, libraryOn(side)));
        return { dir, name, written, text: done(side.door.skills.read(named('tidy-notes'), libraryOn(side))).text };
      },
      says: { dir: '<root>/workflows/skills/tidy-notes', name: 'tidy-notes', written: ['SKILL.md'], text: renderSkill(aSkill()) },
    },
    {
      name: 'changed at its version: its text and its version move',
      walk: (side) => {
        const version = made(side);
        const changed = done(
          side.door.skills.write(named('tidy-notes'), aSkill('tidy-notes', { body: 'New body.' }), version, libraryOn(side)),
        );
        return {
          moved: changed.version !== version,
          text: done(side.door.skills.read(named('tidy-notes'), libraryOn(side))).text,
        };
      },
      says: { moved: true, text: renderSkill(aSkill('tidy-notes', { body: 'New body.' })) },
    },
    {
      name: 'a change of its preload: alone, at its version: that one line written, and read',
      walk: (side) => {
        const version = made(side);
        done(side.door.skills.write(named('tidy-notes'), { name: 'tidy-notes', preload: true }, version, libraryOn(side)));
        const { preload, text } = done(side.door.skills.read(named('tidy-notes'), libraryOn(side)));
        return { preload, text };
      },
      says: { preload: true, text: renderSkill(aSkill('tidy-notes', { preload: true })) },
    },
    {
      name: 'REFUSED: at a version it moved on from is a Conflict, the skill as it was',
      walk: (side) => {
        const version = made(side);
        const now = done(side.door.skills.write(named('tidy-notes'), aSkill('tidy-notes', { body: 'Second.' }), version, libraryOn(side)));
        const write = act(side.door.skills.write(named('tidy-notes'), aSkill('tidy-notes', { body: 'Lost.' }), version, libraryOn(side)));
        const kept = done(side.door.skills.there(named('tidy-notes'), libraryOn(side)));
        return { write, kept: kept.kind === 'held' && kept.version === now.version };
      },
      says: { write: { refused: 'Conflict' }, kept: true },
    },
    {
      name: 'REFUSED: a new skill at a name taken is a Conflict, the skill as it was',
      walk: (side) => {
        made(side);
        return {
          write: act(side.door.skills.write(named('tidy-notes'), aSkill('tidy-notes', { body: 'Other.' }), undefined, libraryOn(side))),
          text: done(side.door.skills.read(named('tidy-notes'), libraryOn(side))).text,
        };
      },
      says: { write: { refused: 'Conflict' }, text: renderSkill(aSkill()) },
    },
    {
      name: 'REFUSED: a name that is no skill’s is Invalid, nothing written',
      walk: (side) => ['../escape', 'Upper', 'two words', ''].map((name) => refusedWrite(side, aSkill(name))),
      says: ['../escape', 'Upper', 'two words', ''].map(() => ({ write: { refused: 'Invalid' }, left: [] })),
    },
    {
      name: 'REFUSED: given a version of one gone, Missing, nothing written',
      walk: (side) => refusedWrite(side, aSkill(), 'v1'),
      says: { write: { refused: 'Missing' }, left: [] },
    },
    {
      name: 'REFUSED: no description is Invalid, nothing written',
      walk: (side) => [
        refusedWrite(side, aSkill('tidy-notes', { description: null })),
        refusedWrite(side, aSkill('tidy-notes', { description: '  ' })),
      ],
      says: [
        { write: { refused: 'Invalid' }, left: [] },
        { write: { refused: 'Invalid' }, left: [] },
      ],
    },
    {
      name: 'REFUSED: a description with a line break is Invalid, nothing written',
      walk: (side) => refusedWrite(side, aSkill('tidy-notes', { description: 'one\npreload: true' })),
      says: { write: { refused: 'Invalid' }, left: [] },
    },
    {
      name: 'REFUSED: a change of preload: alone where no skill is, Invalid, nothing written',
      walk: (side) => ({
        write: act(side.door.skills.write(named('tidy-notes'), { name: 'tidy-notes', preload: true }, undefined, libraryOn(side))),
        left: left(side),
      }),
      says: { write: { refused: 'Invalid' }, left: [] },
    },
    {
      name: 'REFUSED: into a folder that is no skills/ beside the workflows, Invalid, nothing written',
      walk: (side) => ({
        write: act(side.door.skills.write(named('tidy-notes'), aSkill(), undefined, `${side.root}/workflows/elsewhere`)),
        there: done(side.door.skills.there(named('tidy-notes'), `${side.root}/workflows/elsewhere`)),
      }),
      says: { write: { refused: 'Invalid' }, there: { kind: 'none' } },
    },
  ],
  'skills.copy': [
    {
      name: 'copied whole into the library, under its name, as the source holds it',
      walk: (side) => {
        const from = sourceOn(side);
        const copied = done(side.door.skills.copy(named('tidy-notes'), from, libraryOn(side)));
        return { ...copied, text: done(side.door.skills.read(named('tidy-notes'), libraryOn(side))).text };
      },
      says: { dir: '<root>/workflows/skills/tidy-notes', name: 'tidy-notes', written: ['SKILL.md'], text: renderSkill(aSkill()) },
    },
    {
      name: 'REFUSED: onto a name the library has is a Conflict, the library as it was',
      walk: (side) => {
        const from = sourceOn(side);
        made(side, aSkill('tidy-notes', { body: 'Mine.' }));
        return {
          copy: act(side.door.skills.copy(named('tidy-notes'), from, libraryOn(side))),
          text: done(side.door.skills.read(named('tidy-notes'), libraryOn(side))).text,
        };
      },
      says: { copy: { refused: 'Conflict' }, text: renderSkill(aSkill('tidy-notes', { body: 'Mine.' })) },
    },
    {
      name: 'REFUSED: a skill the source does not have is Missing, nothing written',
      walk: (side) => ({ copy: act(side.door.skills.copy(named('no-such-skill'), sourceOn(side), libraryOn(side))), left: left(side) }),
      says: { copy: { refused: 'Missing' }, left: [] },
    },
    {
      name: 'REFUSED: a name that is no skill’s is Invalid, nothing written',
      walk: (side) => ({ copy: act(side.door.skills.copy(named('../agents'), sourceOn(side), libraryOn(side))), left: left(side) }),
      says: { copy: { refused: 'Invalid' }, left: [] },
    },
  ],
};
