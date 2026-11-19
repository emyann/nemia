/**
 * A step's folder of files as the folders that hold them: each file under the folders its path names, from the step's folder down. Pure.
 */
import type { StepArtifact } from './api/tries.ts';
import { fileKey } from './stepPart.ts';

/** A file of the folder, at the end of its path: its key (its path under the step's folder) and its own name. */
type FileNode = { readonly kind: 'file'; readonly key: string; readonly name: string; readonly file: StepArtifact };

/** A folder: its path under the step's folder, its own name, what it holds, and how many files are under it at every depth. */
type FolderNode = {
  readonly kind: 'folder';
  readonly key: string;
  readonly name: string;
  readonly children: readonly FolderTreeNode[];
  readonly files: number;
};

/** A row of the tree: a folder, or a file. */
export type FolderTreeNode = FileNode | FolderNode;

/** A folder while it is built, its children in the order they first came. */
type Building = { readonly key: string; readonly name: string; readonly children: Array<Building | FileNode> };

// oxlint-disable-next-line landmines-types/no-explicit-return-types -- it returns its own call, whose type inference cannot give
const built = (node: Building | FileNode): FolderTreeNode => {
  if ('kind' in node) return node;
  const children = node.children.map(built);
  const files = children.reduce((n, c) => n + (c.kind === 'file' ? 1 : c.files), 0);
  return { kind: 'folder', key: node.key, name: node.name, children, files };
};

/**
 * The files `files` under their folders, each folder once, in the order its first file came, and each file where its path puts it
 * (`e2e/bar.png` under the folder `e2e`): a path with no `/` is a file at the top. A folder's key is `<path>/`, which no file's is, so a
 * folder and a file of one name stay apart.
 * @param files the files of a step's folder, as the api lists them
 */
export function folderTreeOf(files: readonly StepArtifact[]) {
  const root: Building = { key: '', name: '', children: [] };
  for (const file of files) {
    const key = fileKey(file);
    const parts = key.split('/').filter((p) => p !== '');
    let at = root;
    for (const part of parts.slice(0, -1)) {
      const folderKey = `${at.key}${part}/`;
      let next = at.children.find((c): c is Building => !('kind' in c) && c.key === folderKey);
      if (!next) {
        next = { key: folderKey, name: part, children: [] };
        at.children.push(next);
      }
      at = next;
    }
    at.children.push({ kind: 'file', key, name: parts.at(-1) ?? key, file });
  }
  return root.children.map(built);
}
