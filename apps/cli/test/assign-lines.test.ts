/**
 * What `nemia assign` prints (`assignLines`): who has the run — the name said, else the caller who put it, as `nemia ls` and the board
 * say it, else nobody in particular — and how to give it back.
 */
import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { RunAssigned } from 'objects';
import { assignLines } from '../src/commands/runs/assign.ts';

const at = '2026-11-03T10:00:00.000Z';

test('the assignee is named by its name, else by the caller who put it, else as someone', () => {
  const put = (assignee: Partial<RunAssigned['assignee']>) =>
    assignLines({ id: 'r-1', ended: false, assignee: { at, forMs: 3_600_000, ...assignee } })[0];
  assert.match(put({ name: 'ann', actor: { kind: 'person', token: 'laptop' } }), /^r-1 {2}assigned to ann /);
  assert.match(put({ actor: { kind: 'agent', agent: 'operator', token: 'ops' } }), /^r-1 {2}assigned to operator, by its token ops /);
  assert.match(put({}), /^r-1 {2}assigned to someone /);
  assert.match(put({ name: 'ann' }), /nemia assign r-1 --off gives it back/);
});
