import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAV } from '../src/components/nav.ts';

test('the menu starts with the Inbox, and the rest follow in their order', () => {
  assert.deepEqual(
    NAV.map((item) => item.label),
    ['Inbox', 'Factories', 'Runs', 'Stats', 'Workflows', 'Agents', 'Capabilities', 'Machines'],
  );
  assert.deepEqual(
    NAV.map((item) => item.to),
    ['/inbox', '/', '/runs', '/stats', '/workflows', '/agents', '/capabilities', '/machines'],
  );
});

test("each page lights one place in the menu — a run and its steps lighting Runs, a card's page the Inbox, a factory's floor the Factories, a step's page Workflows, an agent's page Agents — and a page the menu has no place for lights none", () => {
  const lit = (path: string) => NAV.filter((item) => item.active(path)).map((item) => item.label);
  for (const item of NAV) assert.deepEqual(lit(item.to), [item.label], item.to);
  assert.deepEqual(lit('/runs/r-1'), ['Runs']);
  assert.deepEqual(lit('/runs/r-1/steps/implement'), ['Runs']);
  assert.deepEqual(lit('/inbox/card'), ['Inbox']);
  assert.deepEqual(lit('/factories/nemia'), ['Factories']);
  assert.deepEqual(lit('/workflows/repo/dev/review'), ['Workflows']);
  assert.deepEqual(lit('/agents/yours/scribe'), ['Agents']);
  assert.deepEqual(lit('/agents/new'), ['Agents']);
  assert.deepEqual(lit('/nowhere'), []);
  assert.deepEqual(lit('/inboxes'), [], "refused: a path that only begins with a place's name is not under it");
  assert.deepEqual(lit('/workflowsx/repo'), [], "refused: a path that only begins with a place's name is not under it");
  assert.deepEqual(lit('/agentsx'), [], "refused: a path that only begins with a place's name is not under it");
  assert.deepEqual(lit('/factoriesx'), [], "refused: a path that only begins with a place's name is not under it");
  assert.deepEqual(lit('/machinesx'), [], "refused: a path that only begins with a place's name is not under it");
  assert.deepEqual(lit('/statsx'), [], "refused: a path that only begins with a place's name is not under it");
});
