import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAV } from '../src/components/nav.ts';

test('the menu starts with the Inbox, and the rest follow in their order', () => {
  assert.deepEqual(NAV.map((item) => item.label), ['Inbox', 'Factory', 'Runs', 'Workflows', 'Agents', 'Capabilities']);
  assert.deepEqual(NAV.map((item) => item.to), ['/inbox', '/', '/runs', '/workflows', '/agents', '/capabilities']);
});

test("each page lights one place in the menu — a run and its steps lighting Runs, a card's page the Inbox, a step's page Workflows, an agent's page Agents — and a page the menu has no place for lights none", () => {
  const lit = (path: string) => NAV.filter((item) => item.active(path)).map((item) => item.label);
  for (const item of NAV) assert.deepEqual(lit(item.to), [item.label], item.to);
  assert.deepEqual(lit('/runs/r-1'), ['Runs']);
  assert.deepEqual(lit('/runs/r-1/steps/implement'), ['Runs']);
  assert.deepEqual(lit('/inbox/card'), ['Inbox']);
  assert.deepEqual(lit('/workflows/repo/dev/review'), ['Workflows']);
  assert.deepEqual(lit('/agents/yours/scribe'), ['Agents']);
  assert.deepEqual(lit('/agents/new'), ['Agents']);
  assert.deepEqual(lit('/nowhere'), []);
  // Refused: a path that only begins with a place's name is not under it.
  assert.deepEqual(lit('/inboxes'), []);
  assert.deepEqual(lit('/workflowsx/repo'), []);
  assert.deepEqual(lit('/agentsx'), []);
});
