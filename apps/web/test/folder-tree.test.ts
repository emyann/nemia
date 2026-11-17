/**
 * A step's folder of files as the folders that hold them (src/lib/folderTree.ts), which the step's detail and an agent's try draw as the
 * kit's Tree.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { StepArtifact } from '../src/lib/api/tries.ts';
import { folderTreeOf, type FolderTreeNode } from '../src/lib/folderTree.ts';

const served = (rel: string): StepArtifact => ({
  path: `/wf/a/${rel}`,
  relativePath: rel,
  name: rel,
  url: `/f/${rel}`,
  kind: 'text',
  size: 1,
});

/** A tree as its keys, a folder's children under it. */
const shape = (nodes: readonly FolderTreeNode[]): unknown[] =>
  nodes.map((n) => (n.kind === 'file' ? n.key : { [n.key]: shape(n.children), files: n.files }));

test('folderTreeOf: each file under the folders its path names, each folder once, in the order its first file came', () => {
  const rows: Array<[string, StepArtifact[], unknown[]]> = [
    ['none', [], []],
    ['a file at the top is a row of the top', [served('stories.json')], ['stories.json']],
    [
      'files of one folder share it, wherever they come',
      [served('e2e/a.png'), served('RESPONSE.md'), served('e2e/b.png')],
      [{ 'e2e/': ['e2e/a.png', 'e2e/b.png'], files: 2 }, 'RESPONSE.md'],
    ],
    [
      'a folder counts the files at every depth beneath it',
      [served('e2e/pages/x.png'), served('e2e/y.png')],
      [{ 'e2e/': [{ 'e2e/pages/': ['e2e/pages/x.png'], files: 1 }, 'e2e/y.png'], files: 2 }],
    ],
    [
      'a folder and a file of one name stay apart',
      [served('notes'), served('notes/a.md')],
      ['notes', { 'notes/': ['notes/a.md'], files: 1 }],
    ],
    ['a path only, with no relative path, is a file at the top by its path', [{ path: 'RESPONSE.md' }], ['RESPONSE.md']],
  ];
  for (const [why, files, want] of rows) assert.deepEqual(shape(folderTreeOf(files)), want, why);
});

test('folderTreeOf: a file row is named by the last part of its path, a folder by its own', () => {
  const [folder] = folderTreeOf([served('e2e/deep/bar.png')]);
  assert.equal(folder?.kind, 'folder');
  assert.equal(folder?.name, 'e2e');
  const deep = folder?.kind === 'folder' ? folder.children[0] : undefined;
  const file = deep?.kind === 'folder' ? deep.children[0] : undefined;
  assert.equal(deep?.name, 'deep');
  assert.equal(file?.name, 'bar.png');
});
