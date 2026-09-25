import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { GivenSkill, SkillPlace, SkillRow } from '../src/lib/api.ts';
import { costWords, givenRows, offerOf, PLACE_LABELS } from '../src/lib/skills.ts';

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
  assert.deepEqual(PLACE_LABELS, { yours: 'Your library', repo: 'This repository', shipped: 'Shipped with HKB' });
});

test("a turn's cost is said in words: named, its listing and the body only when loaded; preloaded, all of it every turn", () => {
  assert.equal(costWords({ preload: false, listed: 12, body: 1500, perTurn: 12 }), 'named — about 12 tokens a turn, and about 1,500 more in a turn that loads it');
  assert.equal(costWords({ preload: true, listed: 12, body: 1500, perTurn: 1512 }), 'loaded every turn — about 1,512 tokens (cached)');
});

test("a skill the form gives is shown where an agent of yours finds it now, else as the agent was read, else said missing once the list is read", () => {
  const read: GivenSkill[] = [{ name: 'old', from: 'repo', entry: null, error: 'as read', preload: false, cost: null }];
  const shipped = row({ name: 'ship-it', from: 'shipped' });
  const rows = givenRows(['write-a-note', 'old', 'ship-it'], read, places([row()], [], [shipped]));
  assert.deepEqual(rows.map((r) => [r.name, r.from]), [['write-a-note', 'yours'], ['old', 'repo'], ['ship-it', null]], 'a shipped skill is not found by an agent of yours');
  assert.equal(rows[1]!.error, 'as read');
  assert.match(rows[2]!.error!, /^Neither your library nor this repository has `ship-it`/);
  // The list read again after a copy: the agent as read said it was missing, and the list now has it in your library.
  const copied = givenRows(['gone'], [{ name: 'gone', from: null, entry: null, error: 'No skills folder has `gone`', preload: false, cost: null }], places([row({ name: 'gone' })]));
  assert.deepEqual([copied[0]!.from, copied[0]!.error], ['yours', null], 'what the list says now wins over what the agent was read with');
  assert.deepEqual(givenRows(['typed'], [], undefined).map((r) => [r.from, r.error]), [[null, null]], 'before the list is read a new name is not called missing');
});

test('the picker offers Add for a skill of yours or the repository, and copy-and-add for a shipped one found nowhere', () => {
  assert.deepEqual(offerOf(row(), []), { kind: 'add' });
  assert.deepEqual(offerOf(row({ from: 'repo' }), []), { kind: 'add' });
  assert.deepEqual(offerOf(row(), ['write-a-note']), { kind: 'given' });
  assert.deepEqual(offerOf(row({ from: 'shipped' }), []), { kind: 'copy' });
});

test("REFUSED: no offer for a skill that does not read, and no copy of a shipped name an agent of yours already finds — it would write over yours or hide the repository's", () => {
  assert.deepEqual(offerOf(row({ entry: null, error: 'SKILL.md has no frontmatter' }), []), { kind: 'refused', why: 'SKILL.md has no frontmatter' });
  assert.deepEqual(offerOf(row({ from: 'shipped', entry: null, error: 'a link' }), []), { kind: 'refused', why: 'a link' });
  assert.deepEqual(offerOf(row({ from: 'shipped', found: 'yours' }), []), { kind: 'found', where: 'yours' });
  assert.deepEqual(offerOf(row({ from: 'shipped', found: 'repo' }), []), { kind: 'found', where: 'repo' });
});
