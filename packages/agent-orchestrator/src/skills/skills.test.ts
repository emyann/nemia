/**
 * The paths a skill says its work is on (`applies:` in its SKILL.md's frontmatter, `appliesOf`), and whether a file is one of them
 * (`appliesMatch`): a glob matches a path whole, `*` and `?` within one folder, `**` across folders.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appliesMatch, appliesOf } from './skills.ts';

const skill = (applies?: string) =>
  `---\nname: a\ndescription: Do it.\n${applies === undefined ? '' : `applies: ${applies}\n`}---\nDo it.\n`;

test("a skill's paths are read as a list, one glob written alone or quoted as one, and as none where it declares none", () => {
  assert.deepEqual(appliesOf(skill('["apps/web/**", "src/**/*.verb.ts"]')), ['apps/web/**', 'src/**/*.verb.ts']);
  assert.deepEqual(appliesOf(skill('apps/web/x.ts')), ['apps/web/x.ts']);
  assert.deepEqual(appliesOf(skill('"apps/web/**"')), ['apps/web/**']);
  assert.deepEqual(appliesOf(skill()), []);
  assert.deepEqual(appliesOf(skill('["apps/web/**", [x]]')), [], 'a list holding anything but a glob declares none');
  assert.deepEqual(appliesOf(skill('["apps/web/**", ""]')), [], 'an empty item too');
  assert.deepEqual(appliesOf(skill('\n  - apps/web/**\n  - src/**')), ['apps/web/**', 'src/**'], 'a block sequence reads as its list');
  assert.deepEqual(appliesOf(skill('["apps/web/**"')), [], 'a list that does not read declares none');
});

test('a glob matches a path whole: `**` across folders or none, `*` and `?` within one, every other character as written', () => {
  const web = ['apps/web/**'];
  assert.ok(appliesMatch('apps/web/src/routes/a.tsx', web));
  assert.ok(!appliesMatch('apps/website/a.tsx', web), 'a folder is matched by its whole name');
  assert.ok(!appliesMatch('apps/web', web), 'a folder is not a file under it');
  assert.ok(!appliesMatch('x/apps/web/a.tsx', web), 'a glob matches from the checkout');
  const verbs = ['src/**/*.verb.ts'];
  assert.ok(appliesMatch('src/a.verb.ts', verbs), '`**/` matches no folder');
  assert.ok(appliesMatch('src/stats/deep/a.verb.ts', verbs));
  assert.ok(!appliesMatch('src/a.verb.tsx', verbs));
  assert.ok(!appliesMatch('src/stats/a.store.ts', verbs));
  assert.ok(!appliesMatch('src/a/b.ts', ['src/*.ts']), '`*` stays within one folder');
  assert.ok(appliesMatch('a.b', ['a?b']));
  assert.ok(!appliesMatch('axb', ['a.b']), 'a dot is a dot');
  assert.ok(appliesMatch('b.ts', ['a.ts', 'b.ts']), 'a path matches where one glob of the list does');
  assert.ok(!appliesMatch('b.ts', []));
});
