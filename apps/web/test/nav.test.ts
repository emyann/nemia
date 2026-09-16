import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAV } from '../src/components/nav.ts';

test('the menu starts with the Inbox, and the rest follow in their order', () => {
  assert.deepEqual(NAV.map((item) => item.label), ['Inbox', 'Factory', 'Runs', 'Workflows', 'Capabilities']);
  assert.deepEqual(NAV.map((item) => item.to), ['/inbox', '/', '/runs', '/workflows', '/capabilities']);
});

test('each page lights one place in the menu, a run and its steps lighting Runs, and a page the menu has no place for lights none', () => {
  const lit = (path: string) => NAV.filter((item) => item.active(path)).map((item) => item.label);
  for (const item of NAV) assert.deepEqual(lit(item.to), [item.label], item.to);
  assert.deepEqual(lit('/runs/r-1'), ['Runs']);
  assert.deepEqual(lit('/runs/r-1/steps/implement'), ['Runs']);
  assert.deepEqual(lit('/inbox/card'), []);
  assert.deepEqual(lit('/nowhere'), []);
});
