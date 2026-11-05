/**
 * The Skill (`src/skill.ts`): a skill and a page of them decoded from JSON and encoded back equal; its origin one of the four words; the
 * write taking a whole spec or `preload` alone; and its files by path.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, Skill, SkillFiles, SkillList, SkillWrite } from 'objects';

const skill = {
  apiVersion: API_VERSION,
  kind: 'Skill',
  metadata: { name: 'git', namespace: 'mill', creationTimestamp: '2026-11-05T00:00:00.000Z', resourceVersion: 'sha256:s' },
  spec: { title: 'Git', description: 'Keep your work.', tags: ['git'], examples: null, preload: false, body: 'Commit.' },
  status: {
    origin: 'builtin',
    revision: 2,
    dir: '/pkg/skills/git',
    entry: { id: 'git', name: 'Git', description: 'Keep your work.', tags: ['git'] },
    error: null,
    preload: false,
    cost: { preload: false, listed: 10, body: 100, perTurn: 10 },
    usedBy: [{ from: 'yours', name: 'architect' }],
    found: 'yours',
    copyHint: null,
  },
} as const;

/** A SKILL.md that does not read: its body alone, and why. */
const unread = {
  ...skill,
  spec: { body: 'Commit.' },
  status: { ...skill.status, origin: 'factory', entry: null, error: 'no description' },
};

const roundTrip = <S extends Schema.Codec<unknown, unknown>>(schema: S, value: unknown): unknown =>
  JSON.parse(JSON.stringify(Schema.encodeSync(schema)(Schema.decodeUnknownSync(schema)(JSON.parse(JSON.stringify(value))))));

test('a skill and a page of them decode from JSON and encode back the same, absent keys left absent', () => {
  assert.deepEqual(roundTrip(Skill, skill), skill);
  assert.deepEqual(roundTrip(Skill, unread), unread);
  const page = { apiVersion: API_VERSION, kind: 'SkillList', metadata: {}, items: [skill, unread] };
  assert.deepEqual(roundTrip(SkillList, page), page);
});

test('REFUSED: an origin outside the four words, and a write that is neither a spec nor preload', () => {
  assert.throws(() => Schema.decodeUnknownSync(Skill)({ ...skill, status: { ...skill.status, origin: 'tree' } }));
  assert.throws(() => Schema.decodeUnknownSync(SkillWrite)({ metadata: {} }));
});

test('the write takes a whole spec, or preload alone; the files are paths', () => {
  const whole = { metadata: { resourceVersion: 'sha256:s' }, spec: { description: 'd', body: 'b' } };
  assert.deepEqual(roundTrip(SkillWrite, whole), whole);
  const preload = { metadata: { resourceVersion: 'sha256:s' }, preload: true };
  assert.deepEqual(roundTrip(SkillWrite, preload), preload);
  assert.deepEqual(roundTrip(SkillFiles, { paths: ['SKILL.md', 'ref/a.md'] }), { paths: ['SKILL.md', 'ref/a.md'] });
});
