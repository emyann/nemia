/**
 * What `contracts/session-home.contract.ts` takes on trust of the expansion of `${{ workspace }}` (`expandedPure`), held on the real
 * function: a rule with none, one, two, and one at either end, under an absolute workspace and under one that itself names the
 * expression.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { brokenOn } from '@emyann/tsverify';
import { expandedPure } from '../../../contracts/session-home.contract.ts';
import { expandedIn } from './expression.ts';

const RULES = [
  'Read(./src/**)',
  'Bash(cd ${{ workspace }})',
  '${{ workspace }}',
  'Bash(cp ${{ workspace }}/a ${{ workspace }}/b)',
  'Edit(/${{ workspace }}/x)${{ workspace }}',
  '',
];
const WORKSPACES = ['/wt/run', '/', '/w/${{ workspace }}'];

test("the expansion's laws the contract trusts hold on the real function", () => {
  const inputs = RULES.flatMap((rule) => WORKSPACES.map((ws) => [rule, ws] as [string, string]));
  assert.deepEqual(
    brokenOn(expandedPure, inputs as never).map((b) => b.law),
    [],
  );
});

test('every expression of a rule is the workspace, not the first alone', () => {
  assert.equal(expandedIn('Bash(cp ${{ workspace }}/a ${{ workspace }}/b)', '/wt'), 'Bash(cp /wt/a /wt/b)');
});
