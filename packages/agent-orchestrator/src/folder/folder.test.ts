/**
 * A folder's steps read from their text: what a step's name may be (`stepNameRefusal`), and `parseFolder`, which reads steps as
 * `loadWorkflows` reads a folder — in the order of their files, validated, in the order they run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFolder, stepNameRefusal } from './folder.ts';
import { validate } from '../workflow/validate.ts';
import { WorkflowError } from '../step/step.ts';

test("`stepNameRefusal`: a step's name is its file's in the folder", async (t) => {
  const rows: Array<[row: string, name: unknown, naming: string[]]> = [
    ['a name', 'implement', []],
    ['a dash and a digit', 'review-2', []],
    ['a space inside', 'plan review', []],
    ['a dot inside', 'a.b', []],
    ['a letter with an accent', 'étape', []],
    ['252 bytes and .md is 255', 'r'.repeat(252), []],
    ['REFUSED: none', '', ['has no name', 'without .md']],
    ['REFUSED: blank', '  ', ['has no name']],
    ['REFUSED: not a string', undefined, ['has no name']],
    ['REFUSED: a slash', '../review', ['`../review`', 'a slash', 'without .md']],
    ['REFUSED: a backslash', 'ui\\review', ['`ui\\review`', 'a slash']],
    ['REFUSED: a control character', 'review\nharness: codex', ['control character', '"review\\nharness: codex"']],
    ['REFUSED: a dot first', '.review', ['`.review`', 'starts with a dot']],
    ['REFUSED: two dots', '..', ['`..`', 'starts with a dot']],
    ['REFUSED: spaces around', ' review', ['` review`', '`after:` trims', 'without the spaces']],
    ['REFUSED: a comma', 'plan,review', ['`plan,review`', 'split on every comma']],
    ['REFUSED: its .md', 'review.md', ['`review.md`', '`review`']],
    ['REFUSED: the README', 'README', ['`README`', "folder's README"]],
    ['REFUSED: the readme in any case', 'readme', ['`readme`', "folder's README"]],
    ['REFUSED: too long', 'r'.repeat(253), ['255 bytes']],
  ];
  for (const [row, name, naming] of rows)
    await t.test(row, () => {
      const why = stepNameRefusal(name);
      if (!naming.length) return assert.equal(why, undefined);
      assert.ok(why !== undefined, `${JSON.stringify(name)} is taken`);
      for (const word of naming) assert.ok(why.includes(word), `names ${word}: ${why}`);
    });
});

test('`parseFolder` reads steps in the order of their files, validated, in the order they run — refused in the words of `validate`', () => {
  const files: Array<[string, string]> = [
    ['a', '---\nplace: git\n---\nfirst\n'],
    ['a-b', '---\nplace: git\n---\nsecond\n'],
    ['c', '---\nafter: a\nplace: git\n---\nthird\n'],
  ];
  assert.deepEqual(
    parseFolder(files).map((s) => s.name),
    ['a-b', 'a', 'c'],
    "a-b.md sorts before a.md, though a sorts before a-b: the files' order breaks the tie, as a folder lists them",
  );
  assert.deepEqual(parseFolder([...files].reverse()), parseFolder(files), 'whatever order they are given in');

  const cycle: Array<[string, string]> = [
    ['a', '---\nafter: b\nplace: git\n---\nx\n'],
    ['b', '---\nafter: a\nplace: git\n---\ny\n'],
  ];
  const words = (() => {
    try {
      validate([
        { name: 'a', after: ['b'], body: 'x', place: 'git' },
        { name: 'b', after: ['a'], body: 'y', place: 'git' },
      ]);
    } catch (e) {
      return (e as Error).message;
    }
    return assert.fail('validate took a cycle');
  })();
  assert.throws(
    () => parseFolder(cycle),
    (e: Error) => e instanceof WorkflowError && e.exitCode === 2 && e.message === words,
  );
});
