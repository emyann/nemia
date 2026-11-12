/** `skillSpecOf`: a skill's SKILL.md and its other text files read as the spec a Skill carries. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skillSpecOf } from './skill-spec.ts';

const SKILL_MD = '---\nname: tidy\ntitle: Tidy\ndescription: Tidy a change.\ntags: [notes]\n---\nTidy it.\n';

test("a skill's spec: its frontmatter's words, its preload, its body, and its other files sorted by path", () => {
  const spec = skillSpecOf(
    'tidy',
    SKILL_MD,
    [
      { path: 'run.sh', text: 'echo ok\n' },
      { path: 'notes/deep/how.md', text: 'One fact a line.\n' },
    ],
    true,
  );
  assert.equal(spec.title, 'Tidy');
  assert.equal(spec.description, 'Tidy a change.');
  assert.deepEqual(spec.tags, ['notes']);
  assert.equal('examples' in spec, false, 'a key its SKILL.md does not write is left out');
  assert.equal(spec.preload, true);
  assert.equal(spec.body.trim(), 'Tidy it.');
  assert.deepEqual(
    spec.files?.map((f) => f.path),
    ['notes/deep/how.md', 'run.sh'],
  );
});

test('a folder with no other file carries no `files`', () => {
  assert.equal('files' in skillSpecOf('tidy', SKILL_MD, [], false), false);
});
