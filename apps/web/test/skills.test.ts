import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GivenSkill, SkillDetail, SkillPlace, SkillRow } from '../src/lib/api.ts';
import {
  costWords,
  draftOfForm,
  drawnSkill,
  EMPTY_SKILL_FORM,
  givenRows,
  offerOf,
  PLACE_LABELS,
  preloadWords,
  reachWords,
  skillEdited,
  skillFormOf,
} from '../src/lib/skills.ts';

const row = (fields: Partial<SkillRow> = {}): SkillRow => ({
  name: 'write-a-note',
  from: 'yours',
  dir: '/store/workflows/skills/write-a-note',
  entry: { id: 'write-a-note', name: 'Write a note', description: 'Writes the notes of a change.', tags: ['note'] },
  error: null,
  preload: false,
  cost: { preload: false, listed: 10, body: 200, perTurn: 10 },
  usedBy: [],
  found: null,
  ...fields,
});

const places = (yours: SkillRow[], repo: SkillRow[] = [], shipped: SkillRow[] = []): SkillPlace[] => [
  { from: 'yours', dir: '/store/workflows/skills', skills: yours },
  { from: 'repo', dir: '/repo/.claude/skills', skills: repo },
  { from: 'shipped', dir: '/hkb/workflows/skills', skills: shipped },
];

test('the places are named as the picker groups them', () => {
  assert.deepEqual(PLACE_LABELS, { yours: 'Your library', repo: 'This repository', shipped: 'Shipped with Nemia' });
});

test("a turn's cost is said in words: named, its listing and the body only when loaded; preloaded, all of it every turn", () => {
  assert.equal(
    costWords({ preload: false, listed: 12, body: 1500, perTurn: 12 }),
    'named — about 12 tokens a turn, and about 1,500 more in a turn that loads it',
  );
  assert.equal(costWords({ preload: true, listed: 12, body: 1500, perTurn: 1512 }), 'loaded every turn — about 1,512 tokens (cached)');
});

test('a skill named with its folder, which no place lists, keeps its read row whole: where it was found, and never said missing', () => {
  const read: GivenSkill[] = [
    {
      name: 'apps/site:lay-out',
      from: null,
      foundIn: 'apps/site/.claude/skills/lay-out',
      entry: null,
      error: null,
      preload: false,
      cost: null,
    },
  ];
  const rows = givenRows(['write-a-note', 'apps/site:lay-out'], read, places([row()]));
  assert.deepEqual(
    rows.map((r) => [r.name, r.from, r.foundIn, r.error]),
    [
      ['write-a-note', 'yours', null, null],
      ['apps/site:lay-out', null, 'apps/site/.claude/skills/lay-out', null],
    ],
  );
});

test('a skill the form gives is shown where an agent of yours finds it now, else as the agent was read, else said missing once the list is read', () => {
  const read: GivenSkill[] = [{ name: 'old', from: 'repo', foundIn: null, entry: null, error: 'as read', preload: false, cost: null }];
  const shipped = row({ name: 'ship-it', from: 'shipped' });
  const rows = givenRows(['write-a-note', 'old', 'ship-it'], read, places([row()], [], [shipped]));
  assert.deepEqual(
    rows.map((r) => [r.name, r.from]),
    [
      ['write-a-note', 'yours'],
      ['old', 'repo'],
      ['ship-it', null],
    ],
    'a shipped skill is not found by an agent of yours',
  );
  assert.equal(rows[1].error, 'as read');
  assert.match(rows[2].error!, /^Neither your library nor this repository has `ship-it`/);
  const copied = givenRows(
    ['gone'],
    [{ name: 'gone', from: null, foundIn: null, entry: null, error: 'No skills folder has `gone`', preload: false, cost: null }],
    places([row({ name: 'gone' })]),
  );
  assert.deepEqual(
    [copied[0].from, copied[0].error],
    ['yours', null],
    'the list read again after a copy has the skill in your library: what it says now wins over the agent that was read missing it',
  );
  assert.deepEqual(
    givenRows(['typed'], [], undefined).map((r) => [r.from, r.error]),
    [[null, null]],
    'before the list is read a new name is not called missing',
  );
});

test('the picker offers Add for a skill of yours or the repository, and copy-and-add for a shipped one found nowhere', () => {
  assert.deepEqual(offerOf(row(), []), { kind: 'add' });
  assert.deepEqual(offerOf(row({ from: 'repo' }), []), { kind: 'add' });
  assert.deepEqual(offerOf(row(), ['write-a-note']), { kind: 'given' });
  assert.deepEqual(offerOf(row({ from: 'shipped' }), []), { kind: 'copy' });
});

test("REFUSED: no offer for a skill that does not read, and no copy of a shipped name an agent of yours already finds — it would write over yours or hide the repository's", () => {
  assert.deepEqual(offerOf(row({ entry: null, error: 'SKILL.md has no frontmatter' }), []), {
    kind: 'refused',
    why: 'SKILL.md has no frontmatter',
  });
  assert.deepEqual(offerOf(row({ from: 'shipped', entry: null, error: 'a link' }), []), { kind: 'refused', why: 'a link' });
  assert.deepEqual(offerOf(row({ from: 'shipped', found: 'yours' }), []), { kind: 'found', where: 'yours' });
  assert.deepEqual(offerOf(row({ from: 'shipped', found: 'repo' }), []), { kind: 'found', where: 'repo' });
});

const detail = (fields: Partial<SkillDetail> = {}): SkillDetail => ({
  skill: row(),
  version: 'v1',
  draft: {
    name: 'write-a-note',
    title: 'Write a note',
    description: 'Writes the notes of a change.',
    tags: ['note', 'docs'],
    examples: null,
    preload: false,
    body: 'Write it.\n',
  },
  body: 'Write it.\n',
  users: [],
  copyHint: null,
  ...fields,
});

test("a skill's form is filled from its draft as written, and a skill that does not read keeps its name and instructions", () => {
  assert.deepEqual(skillFormOf(detail()), {
    name: 'write-a-note',
    title: 'Write a note',
    description: 'Writes the notes of a change.',
    tags: 'note\ndocs',
    examples: '',
    body: 'Write it.\n',
  });
  assert.deepEqual(skillFormOf(detail({ draft: null, body: 'Mend me.\n' })), {
    ...EMPTY_SKILL_FORM,
    name: 'write-a-note',
    body: 'Mend me.\n',
  });
});

test('the form sends a blank title, tags or examples as none, one tag a line, and leaves the switch to the switch', () => {
  const draft = draftOfForm({
    name: ' a-skill ',
    title: '  ',
    description: ' Does a thing. ',
    tags: 'one\n\n  two  \n',
    examples: '\n',
    body: 'Do it.\n',
  });
  assert.deepEqual(draft, {
    name: 'a-skill',
    title: null,
    description: 'Does a thing.',
    tags: ['one', 'two'],
    examples: null,
    body: 'Do it.\n',
  });
  assert.equal('preload' in draft, false);
});

test('a form is edited when what it would write differs, not when only its blank lines do', () => {
  const was = skillFormOf(detail());
  assert.equal(skillEdited({ ...was, tags: 'note\n\ndocs\n' }, was), false);
  assert.equal(skillEdited({ ...was, tags: 'note' }, was), true);
  assert.equal(skillEdited({ ...was, body: 'Write it well.\n' }, was), true);
});

test('the switch says what the other position would carry: on, the body every turn at four characters a token, cached', () => {
  assert.equal(
    preloadWords({ preload: false, listed: 12, body: 1500, perTurn: 12 }),
    'On, its instructions are loaded every turn too — about 1,500 tokens more a turn, cached.',
  );
  assert.equal(
    preloadWords({ preload: true, listed: 12, body: 1500, perTurn: 1512 }),
    'Off, a session is told only its name and what it does, and loads it when it needs it.',
  );
});

test('a change is said to reach every agent that gives the skill, by name, or none', () => {
  assert.equal(reachWords([]), 'No agent gives it yet: a change reaches none.');
  assert.equal(
    reachWords([
      { from: 'yours', name: 'coder' },
      { from: 'repo', name: 'reviewer' },
    ]),
    'A change, this switch included, changes every agent that gives it, from its next run: coder, reviewer (this repository).',
  );
});

test('the form follows the file read again while it holds nothing unsaved, and holds what it was drawn from while it does', () => {
  const was = detail();
  const now = detail({ version: 'v2', body: 'Changed by hand.\n' });
  assert.equal(drawnSkill(was, now, false), now, 'nothing unsaved: the form is drawn again from the file');
  assert.equal(drawnSkill(was, now, true), was, 'unsaved words: the form keeps them, and the page says the file moved');
  const same = detail();
  assert.equal(drawnSkill(was, same, true), same, 'the same version read again is the read, unsaved words or not');
  const other = detail({ skill: row({ name: 'other', dir: '/store/workflows/skills/other' }), version: 'v9' });
  assert.equal(drawnSkill(was, other, true), other, 'another skill is never held for this one');
});
