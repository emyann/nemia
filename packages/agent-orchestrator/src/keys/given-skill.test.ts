/**
 * The two forms of a name on a `skills:` line (`givenSkillOf`): a bare name, or `folder:name`, the folder a path of the repository with
 * no way out of it. Each spelling that is neither is a fixture that must be refused; and two skills of one bare name are found in a
 * list (`sameBareIn`), the same name twice being another refusal's.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bareSkillOf, givenSkillOf, sameBareIn } from './given-skill.ts';

test('a bare name is a skill of the folders looked in; `folder:name` names the folder it is read from', () => {
  assert.deepEqual(givenSkillOf('y'), { name: 'y' });
  assert.deepEqual(givenSkillOf('review-a-change'), { name: 'review-a-change' });
  assert.deepEqual(givenSkillOf('app:y'), { folder: 'app', name: 'y' });
  assert.deepEqual(givenSkillOf('apps/web:ds-build'), { folder: 'apps/web', name: 'ds-build' });
  assert.deepEqual(givenSkillOf('_tools/a.b-c_d:y'), { folder: '_tools/a.b-c_d', name: 'y' });
});

test("REFUSED: a spelling that is neither a skill's name nor folder:name", () => {
  for (const odd of [
    '',
    ':y',
    '.:y',
    './app:y',
    '/app:y',
    'app/:y',
    'app//x:y',
    '../x:y',
    'app/../x:y',
    '.claude:y',
    'app/.hidden:y',
    '-app:y',
    'app:Y',
    'app:',
    'a:b:y',
    'app\\x:y',
    'app: y',
    'app :y',
    'my app:y',
  ])
    assert.equal(givenSkillOf(odd), undefined, odd);
});

test('the bare name of a given skill is the text after its last colon', () => {
  assert.equal(bareSkillOf('y'), 'y');
  assert.equal(bareSkillOf('apps/web:ds-build'), 'ds-build');
});

test('two skills of one bare name are found in a list, in its order; the same name twice is not two skills', () => {
  assert.deepEqual(sameBareIn(['a', 'x', 'app:x', 'b:x']), ['x', 'app:x']);
  assert.deepEqual(sameBareIn(['a:x', 'look', 'b:x']), ['a:x', 'b:x']);
  assert.equal(sameBareIn(['x', 'app:y', 'x']), undefined);
  assert.equal(sameBareIn([]), undefined);
});
