/**
 * The store's library as the board reads it (`src/lib/api/storeLibrary.ts`): every kind's items in one list, each with its origin and
 * the factories that use it, what a factory may still add from it, its count in words, and the agents a harness keeps that it may import.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { AgentSource, LibraryAdd, McpServer } from 'objects';
import { addable, importablesOf, libraryCount, libraryItemsOf, type LibraryItem } from '../src/lib/api/storeLibrary.ts';
import { agentObject, consistentSkill, listedAgent, skillObject, skillRow, workflow, workflowObject } from './library-fixtures.ts';

const server = (name: string, origin?: 'user' | 'builtin', factories?: string[]): McpServer => ({
  apiVersion: 'nemia/v1',
  kind: 'McpServer',
  metadata: { name, creationTimestamp: '2026-11-15T00:00:00Z', resourceVersion: 'v1' },
  spec: { type: 'http', url: `https://${name}.example` },
  status: { ...(origin ? { origin } : {}), ...(factories ? { factories } : {}) },
});

const add = (name: string): LibraryAdd => ({
  apiVersion: 'nemia/v1',
  kind: 'LibraryAdd',
  metadata: { name, namespace: 'shop', creationTimestamp: '2026-11-15T00:00:00Z', resourceVersion: 'v1' },
  spec: { kind: name.startsWith('Skill') ? 'Skill' : 'Agent', name: name.split('.')[1] ?? '' },
  status: { state: 'resolved', recorded: true },
});

test("the library's items, each kind in its order and each by name, with their origin, the factories that use them, and a changed builtin", () => {
  const skill = skillObject(consistentSkill({ skill: skillRow({ name: 'tidy', from: 'user', found: null }) }));
  const items = libraryItemsOf(
    [{ ...skill, status: { ...skill.status, origin: 'user', factories: ['shop'], builtinChanged: true } }],
    [agentObject(listedAgent({ name: 'implementer', from: 'builtin' }, ['acme']))],
    [server('zeta', 'builtin', ['mill']), server('alpha')],
    [workflowObject(workflow({ name: 'dev', from: 'user' }))],
  );
  assert.deepEqual(
    items.map((one) => `${one.kind}.${one.name}`),
    ['Skill.tidy', 'Agent.implementer', 'McpServer.alpha', 'McpServer.zeta', 'Workflow.dev'],
  );
  assert.deepEqual(
    items.map((one) => [one.origin, [...one.factories], one.builtinChanged]),
    [
      ['user', ['shop'], true],
      ['builtin', ['acme'], false],
      ['user', [], false],
      ['builtin', ['mill'], false],
      ['user', [], false],
    ],
    'a server that says no origin is the user library’s',
  );
  assert.deepEqual(
    items.map((one) => one.description),
    ['Read a diff.', 'Reviews a change.', null, null, 'An intent to main.'],
    'each says what it is for as its object does; a server says nothing',
  );
});

test('a factory may add each agent, skill or MCP server it has not added; a workflow is attached, never added', () => {
  const items = libraryItemsOf(
    [skillObject(consistentSkill({ skill: skillRow({ name: 'tidy', from: 'user', found: null }) }))],
    [agentObject(listedAgent({ name: 'implementer' }))],
    [server('github')],
    [workflowObject(workflow({ name: 'dev' }))],
  );
  assert.deepEqual(
    addable(items, [add('Skill.tidy')]).map((one) => `${one.kind}.${one.name}`),
    ['Agent.implementer', 'McpServer.github'],
  );
});

const item = (kind: LibraryItem['kind'], name: string): LibraryItem => ({
  kind,
  name,
  description: null,
  origin: 'user',
  factories: [],
  builtinChanged: false,
});

const source = (place: AgentSource['place'], name: string, error: string | null = null): AgentSource => ({
  place,
  repo: place === 'repository' ? '/code/app' : null,
  dir: '/srv/agents',
  file: `/srv/agents/${name}.md`,
  name,
  description: error === null ? `${name} things` : null,
  version: error === null ? 'v1' : null,
  error,
});

test("a harness's own agents to import: its place alone, each said held where the library has its name, one that does not read with why", () => {
  const offered = importablesOf(
    [
      source('repository', 'theirs'),
      source('library', 'drafter'),
      source('path', 'named'),
      source('harness', 'drafter'),
      source('harness', 'scout'),
      source('harness', 'odd', 'no name'),
    ],
    [item('Agent', 'drafter'), item('Skill', 'scout')],
  );
  assert.deepEqual(
    offered.map((one) => [one.name, one.held, one.error]),
    [
      ['drafter', true, null],
      ['scout', false, null],
      ['odd', false, 'no name'],
    ],
    'a skill of the same name holds no agent',
  );
  assert.equal(offered[1]?.file, '/srv/agents/scout.md', 'imported by its file, as the copy takes it');
});

test('the library counted in words, each kind it holds in its order, one and several', () => {
  assert.equal(libraryCount([]), 'nothing yet');
  assert.equal(
    libraryCount([item('Workflow', 'w'), item('Agent', 'a'), item('Skill', 's'), item('Skill', 't'), item('McpServer', 'm')]),
    '2 skills, 1 agent, 1 MCP server, 1 workflow',
  );
});
