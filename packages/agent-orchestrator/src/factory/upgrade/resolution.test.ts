/**
 * What the contract does not hold of an upgrade's resolution (`contracts/resolution.contract.ts` holds `resolvedBy` and
 * `workflowResolution`): a conflict's address read as its path's segments (`segmentsOf`), and the render given a taken workflow's files
 * from the tree (`takenFromTree`), after which the merge has no conflict left in that workflow's folder.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeTrees, segmentsOf, takenFromTree, type TreeFile } from './index.ts';

/** A tree of text files, by path. */
const tree = (files: Record<string, string>): TreeFile[] =>
  Object.entries(files).map(([path, text]) => ({ path, bytes: Buffer.from(text) }));

/** A tree's files by path and text, a file that is no text by its byte count. */
const texts = (files: readonly TreeFile[]): Record<string, string> =>
  Object.fromEntries(files.map((f) => [f.path, f.bytes.includes(0) ? `${f.bytes.length} bytes` : f.bytes.toString()]));

/** Bytes that are no text: a NUL among them. */
const LOGO = Buffer.from([0x89, 0x50, 0x00, 0x47]);

test("an upgrade's resolution, row by row: an address's segments, and a taken workflow's files from the tree", async (t) => {
  await t.test("an address is cut to its file's path and split: a whole file, a key, base lines, the wiring's key", () => {
    assert.deepEqual(segmentsOf('workflows/flow/check.ts'), ['workflows', 'flow', 'check.ts']);
    assert.deepEqual(segmentsOf('workflows/flow/check.ts:3-4'), ['workflows', 'flow', 'check.ts']);
    assert.deepEqual(segmentsOf('workflows/flow/review.md#rounds'), ['workflows', 'flow', 'review.md']);
    assert.deepEqual(segmentsOf('factory.json#hires.flow/review'), ['factory.json']);
  });

  const base = tree({
    'workflows/flow/check.ts': 'one\ntwo\nthree\n',
    'workflows/flow/gone.ts': 'gone\n',
    'workflows/other/check.ts': 'a\n',
    'workflows/agents/dev.md': 'dev\n',
    'workflows/flow/deep/x.ts': 'x\n',
  });
  const ours = [
    ...tree({
      'workflows/flow/check.ts': 'one\nTWO mine\nthree\n',
      'workflows/flow/mine.ts': 'mine\n',
      'workflows/other/check.ts': 'a mine\n',
      'workflows/agents/dev.md': 'dev mine\n',
      'workflows/flow/deep/x.ts': 'x mine\n',
    }),
    { path: 'workflows/flow/logo.png', bytes: LOGO },
  ];
  const theirs = [
    ...tree({
      'workflows/flow/check.ts': 'one\nTWO theirs\nthree\n',
      'workflows/flow/gone.ts': 'gone\n',
      'workflows/other/check.ts': 'a theirs\n',
      'workflows/agents/dev.md': 'dev theirs\n',
      'workflows/flow/deep/x.ts': 'x theirs\n',
    }),
    { path: 'workflows/flow/logo.png', bytes: Buffer.from([0x89, 0x00]) },
  ];

  await t.test(
    "each text file directly in a taken workflow's folder is the tree's, dropped where the tree has none, added where only it has one",
    () => {
      assert.deepEqual(texts(takenFromTree(theirs, ours, ['flow'])), {
        'workflows/agents/dev.md': 'dev theirs\n',
        'workflows/flow/check.ts': 'one\nTWO mine\nthree\n',
        'workflows/flow/deep/x.ts': 'x theirs\n',
        'workflows/flow/logo.png': '2 bytes',
        'workflows/flow/mine.ts': 'mine\n',
        'workflows/other/check.ts': 'a theirs\n',
      });
    },
  );

  await t.test('no workflow taken leaves the render as it is', () => {
    assert.deepEqual(texts(takenFromTree(theirs, ours, [])), texts(theirs));
  });

  await t.test("the merge over the render so given has no conflict in the taken workflow's text files, and keeps the others'", () => {
    const before = mergeTrees(base, ours, theirs).conflicts.map((c) => c.at);
    assert.ok(
      before.some((at) => at.startsWith('workflows/flow/check.ts')),
      `the script conflicts before it is taken: ${before.join(', ')}`,
    );
    const after = mergeTrees(base, ours, takenFromTree(theirs, ours, ['flow'])).conflicts.map((c) => c.at);
    assert.deepEqual(after, [
      'workflows/agents/dev.md:1-1',
      'workflows/flow/deep/x.ts:1-1',
      'workflows/flow/logo.png',
      'workflows/other/check.ts:1-1',
    ]);
  });
});
