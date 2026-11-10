/**
 * The Template (`src/template.ts`): a template whose manifest gives every key, one that gives the least and says its problems, and a
 * page of them, as the Api's endpoints answer them, every key kept; a parameter whose type is none of its words, and another kind,
 * refused.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { API_VERSION, Template } from 'objects';
import { answered } from './served.ts';

const full = {
  apiVersion: API_VERSION,
  kind: 'Template',
  metadata: { name: 'mill', creationTimestamp: '2026-11-05T10:00:00.000Z', resourceVersion: 'sha256:abc' },
  spec: {
    version: '1.2.0',
    description: 'a mill',
    instruction: { path: 'NEMIA.md' },
    rules: { param: 'rules' },
    parameters: {
      rules: { type: 'string', description: 'the rules', default: 'be kind' },
      budget: { type: 'number', description: 'a cap' },
    },
    hires: { 'build/implement': 'maker' },
    revisions: 'follow',
  },
  status: {
    source: '/builtin/mill',
    digest: 'sha256:abc',
    workflows: ['build'],
    agents: ['maker'],
    skills: ['outline'],
  },
} as const;

const broken = {
  apiVersion: API_VERSION,
  kind: 'Template',
  metadata: { name: 'broken', creationTimestamp: '2026-11-05T10:00:00.000Z', resourceVersion: 'r0' },
  spec: { parameters: {}, hires: {} },
  status: { source: '/builtin/broken', workflows: [], agents: [], skills: [], problems: ['nemia.yaml:1:1: does not parse'] },
} as const;

test("the Api's get answers a template and its list a page of them, every key kept, absent keys left absent", () => {
  assert.deepEqual(answered('templates', 'get', full), full);
  assert.deepEqual(answered('templates', 'get', broken), broken);
  const page = { apiVersion: API_VERSION, kind: 'TemplateList', metadata: {}, items: [full, broken] };
  assert.deepEqual(answered('templates', 'listAll', page), page);
  assert.equal(answered('templates', 'get', { ...full, kind: 'Factory' }), undefined);
  assert.equal(answered('templates', 'listAll', { ...page, kind: 'FactoryList' }), undefined);
});

test('REFUSED: a parameter whose type is none of its words', () => {
  const spec = { ...full.spec, parameters: { n: { type: 'date', description: 'when' } } };
  assert.throws(() => Schema.decodeUnknownSync(Template)({ ...full, spec }));
});
