/**
 * What `contracts/session-home.contract.ts` takes on trust of the expansion of `${{ workspace }}` (`expandedPure`'s three laws), held
 * on the real function: a rule with none, one, two, and one at either end, under an absolute workspace and under one that itself
 * names the expression.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { expandedIn, WORKSPACE_EXPRESSION } from './spelled.ts';

const RULES = [
  'Read(./src/**)',
  'Bash(cd ${{ workspace }})',
  '${{ workspace }}',
  'Bash(cp ${{ workspace }}/a ${{ workspace }}/b)',
  'Edit(/${{ workspace }}/x)${{ workspace }}',
  '',
];
const WORKSPACES = ['/wt/run', '/', '/w/${{ workspace }}'];
const PAIRS = RULES.flatMap((rule) => WORKSPACES.map((ws) => [rule, ws] as const));

test('a rule that names no expression is as it was', () => {
  for (const [rule, ws] of PAIRS) if (!rule.includes(WORKSPACE_EXPRESSION)) assert.equal(expandedIn(rule, ws), rule, `${rule} ${ws}`);
});

test('no expression is left, where the workspace names none', () => {
  for (const [rule, ws] of PAIRS)
    if (!ws.includes(WORKSPACE_EXPRESSION)) assert.equal(expandedIn(rule, ws).includes(WORKSPACE_EXPRESSION), false, `${rule} ${ws}`);
});

test('the text before the first expression is kept, and the workspace stands where it stood', () => {
  for (const [rule, ws] of PAIRS)
    if (rule.includes(WORKSPACE_EXPRESSION))
      assert.ok(expandedIn(rule, ws).startsWith(rule.slice(0, rule.indexOf(WORKSPACE_EXPRESSION)) + ws), `${rule} ${ws}`);
});

test('every expression of a rule is the workspace, not the first alone', () => {
  assert.equal(expandedIn('Bash(cp ${{ workspace }}/a ${{ workspace }}/b)', '/wt'), 'Bash(cp /wt/a /wt/b)');
});
