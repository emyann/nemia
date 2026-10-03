import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAV, RAIL } from '../src/components/nav.ts';

test('the menu starts with the Inbox, and the rest follow in their order', () => {
  assert.deepEqual(
    NAV.map((item) => item.label),
    ['Inbox', 'Factories', 'Runs', 'Stats', 'Workflows'],
  );
  assert.deepEqual(
    NAV.map((item) => item.to),
    ['/inbox', '/', '/runs', '/stats', '/workflows'],
  );
});

test("each page lights one place in the menu — a run and its steps lighting Runs, a card's page the Inbox, a factory's floor the Factories, a step's page Workflows — and a page the menu has no place for lights none", () => {
  const lit = (path: string) => NAV.filter((item) => item.active(path)).map((item) => item.label);
  for (const item of NAV) assert.deepEqual(lit(item.to), [item.label], item.to);
  assert.deepEqual(lit('/runs/r-1'), ['Runs']);
  assert.deepEqual(lit('/runs/r-1/steps/implement'), ['Runs']);
  assert.deepEqual(lit('/inbox/card'), ['Inbox']);
  assert.deepEqual(lit('/factories/nemia'), ['Factories']);
  assert.deepEqual(lit('/workflows/repo/dev/review'), ['Workflows']);
  assert.deepEqual(lit('/agents'), [], 'Agents is in the rail, not the menu');
  assert.deepEqual(lit('/machines'), [], 'Machines is in the rail, not the menu');
  assert.deepEqual(lit('/nowhere'), []);
  assert.deepEqual(lit('/inboxes'), [], "refused: a path that only begins with a place's name is not under it");
  assert.deepEqual(lit('/workflowsx/repo'), [], "refused: a path that only begins with a place's name is not under it");
  assert.deepEqual(lit('/factoriesx'), [], "refused: a path that only begins with a place's name is not under it");
  assert.deepEqual(lit('/statsx'), [], "refused: a path that only begins with a place's name is not under it");
});

test('the rail holds Home, Agents, Machines and Capabilities, in that order', () => {
  assert.deepEqual(
    RAIL.map((item) => item.label),
    ['Home', 'Agents', 'Machines', 'Capabilities'],
  );
  assert.deepEqual(
    RAIL.map((item) => item.to),
    ['/', '/agents', '/machines', '/capabilities'],
  );
});

test("each page lights at most one place in the rail — Home on the canvas and a factory's floor only, Agents on an agent's page — and a path that only begins with a place's name lights none", () => {
  const lit = (path: string) => RAIL.filter((item) => item.active(path)).map((item) => item.label);
  for (const item of RAIL) assert.deepEqual(lit(item.to), [item.label], item.to);
  assert.deepEqual(lit('/factories/nemia'), ['Home']);
  assert.deepEqual(lit('/agents/new'), ['Agents']);
  assert.deepEqual(lit('/agents/skills/x/y'), ['Agents']);
  assert.deepEqual(lit('/runs'), [], 'a run is not Home');
  assert.deepEqual(lit('/inbox'), [], 'the Inbox is not Home');
  assert.deepEqual(lit('/nowhere'), []);
  assert.deepEqual(lit('/agentsx'), [], "refused: a path that only begins with a place's name is not under it");
  assert.deepEqual(lit('/machinesx'), [], "refused: a path that only begins with a place's name is not under it");
  assert.deepEqual(lit('/capabilitiesx'), [], "refused: a path that only begins with a place's name is not under it");
  assert.deepEqual(lit('/factoriesx'), [], "refused: a path that only begins with a place's name is not under it");
});

test('the rail and the menu share no route but Home, the factories canvas, until the menu is rebuilt', () => {
  const rail = new Set<string>(RAIL.map((item) => item.to));
  const shared = NAV.map((item) => item.to).filter((to) => rail.has(to));
  assert.deepEqual(shared, ['/']);
});
