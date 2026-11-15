/**
 * The store's library as the board reads it (`src/lib/api/storeLibrary.ts`): every kind's items in one list, each with its origin and
 * the factories that use it, and what a factory may still add from it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LibraryAdd, McpServer } from 'objects';
import { addable, libraryItemsOf } from '../src/lib/api/storeLibrary.ts';
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
