/**
 * The Skill (`src/skill.ts`): a skill and a page of them as the Api's endpoints answer them, every key kept; its origin one of the four
 * words; the write the Api takes, a whole spec or `preload` alone; and its files by path.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, Skill, SkillWrite } from 'objects';
import { answered, taken } from './served.ts';

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

test("the Api's get answers a skill and its list a page of them, every key kept, absent keys left absent; another kind refused", () => {
  assert.deepEqual(answered('skills', 'get', skill), skill);
  assert.deepEqual(answered('skills', 'get', unread), unread);
  const page = { apiVersion: API_VERSION, kind: 'SkillList', metadata: {}, items: [skill, unread] };
  assert.deepEqual(answered('skills', 'list', page), page);
  assert.equal(answered('skills', 'get', { ...skill, kind: 'Agent' }), undefined);
  assert.equal(answered('skills', 'list', { ...page, kind: 'AgentList' }), undefined);
});

test('REFUSED: an origin outside the four words, and a write that is neither a spec nor preload', () => {
  assert.throws(() => Schema.decodeUnknownSync(Skill)({ ...skill, status: { ...skill.status, origin: 'tree' } }));
  assert.throws(() => Schema.decodeUnknownSync(SkillWrite)({ metadata: {} }));
});

test('the write takes a whole spec, or preload alone; the files are paths', () => {
  const whole = { metadata: { resourceVersion: 'sha256:s' }, spec: { description: 'd', body: 'b' } };
  assert.deepEqual(taken('skills', 'replace', whole), whole);
  const preload = { metadata: { resourceVersion: 'sha256:s' }, preload: true };
  assert.deepEqual(taken('skills', 'replace', preload), preload);
  assert.deepEqual(answered('skills', 'files', { paths: ['SKILL.md', 'ref/a.md'] }), { paths: ['SKILL.md', 'ref/a.md'] });
  assert.equal(taken('skills', 'replace', { metadata: {} }), undefined);
  assert.equal(answered('skills', 'files', { paths: [1] }), undefined);
});
