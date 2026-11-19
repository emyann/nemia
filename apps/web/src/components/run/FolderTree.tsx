import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { FileText, Folder, FolderOpen } from 'lucide-react';
import type { StepArtifact } from '../../lib/api/tries.ts';
import { folderTreeOf, type FolderTreeNode } from '../../lib/folderTree.ts';
import { viewOpened } from '../../lib/viewAddress';
import { Tree, TreeItem, type TreeProps } from '../ui/ds';
import { when } from '../step/Facts';
import { bytesWord } from './Artifacts';

/** A row's key, as the kit's Tree hands it back. */
type Key = Parameters<NonNullable<TreeProps<object>['onAction']>>[0];

/** What a file row says after its name: its size where the api serves it, when it went where a prune removed it, nothing else. */
function After({ file }: { file: StepArtifact }) {
  if ('pruned' in file)
    return <span className="text-body-small text-on-surface-variant">removed at {when(file.prunedAt)}, by a prune of its files</span>;
  if (!('url' in file)) return null;
  return <span className="font-mono text-body-small text-on-surface-variant">· {bytesWord(file.size)}</span>;
}

/** A file row's lead: the picture itself, small, where it is one the api serves; else a file's glyph. */
function Lead({ file }: { file: StepArtifact }) {
  if ('url' in file && file.kind === 'image')
    return (
      <img
        src={file.url}
        alt=""
        data-file-preview
        className="aspect-[4/3] w-12 border border-outline-variant bg-surface-container object-cover object-top"
      />
    );
  return <FileText aria-hidden="true" className="size-5" />;
}

/** What a row of the tree says it is, for the page and its tests: a served file's kind, `pruned`, or `path` where nothing is served. */
const artifactOf = (file: StepArtifact) => ('pruned' in file ? 'pruned' : 'url' in file ? file.kind : 'path');

/**
 * The rows of `nodes`: a folder that folds, its name and how many files are under it, then what it holds; a file, its name, its picture
 * where it is one, and its size. A served file with no step to open it in is a link to the file, in a new tab.
 */
function rows(nodes: readonly FolderTreeNode[], step: string | null, open: ReadonlySet<Key>) {
  return nodes.map((node) => {
    if (node.kind === 'folder')
      return (
        <TreeItem
          key={node.key}
          id={node.key}
          data-folder={node.key}
          textValue={node.name}
          icon={
            open.has(node.key) ? <FolderOpen aria-hidden="true" className="size-5" /> : <Folder aria-hidden="true" className="size-5" />
          }
          title={<span className="font-mono">{node.name}/</span>}
          trailingElement={
            <span className="text-body-small text-on-surface-variant">
              {node.files} {node.files === 1 ? 'file' : 'files'}
            </span>
          }
        >
          {rows(node.children, step, open)}
        </TreeItem>
      );
    const { file } = node;
    const served = 'url' in file;
    return (
      <TreeItem
        key={node.key}
        id={node.key}
        data-artifact={artifactOf(file)}
        data-opens-view={served && step !== null ? node.key : undefined}
        textValue={node.name}
        href={served && step === null ? file.url : undefined}
        target={served && step === null ? '_blank' : undefined}
        rel={served && step === null ? 'noreferrer' : undefined}
        aria-label={served ? `Open ${node.key}` : node.key}
        icon={<Lead file={file} />}
        title={<span className={served ? 'font-mono' : 'font-mono text-on-surface-variant'}>{node.name}</span>}
        trailingElement={<After file={file} />}
      />
    );
  });
}

/**
 * A step's whole folder of files as the kit's `Tree`: each folder a row that folds, folded until a person opens it, and each file a row
 * under the folder its path names. A picture's row draws the picture small, and a press on a served file's row opens its viewer's sheet
 * by the address (`?view=<step>/<path>`, a push, so Back closes it) where `step` names the step it is of, else the file in a new tab. A
 * file a prune removed is its name, muted, and when it went; one the api does not serve is its name alone. `none` is said where the
 * folder holds nothing, and `label` names the tree to a screen reader.
 */
export function FolderTree({
  files,
  step = null,
  none = 'the folder is empty',
  label = 'Files in its folder',
}: {
  files: readonly StepArtifact[];
  step?: string | null;
  none?: string;
  label?: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState<ReadonlySet<Key>>(new Set());
  if (!files.length) return <p className="text-body-small text-on-surface-variant">{none}</p>;
  const tree = folderTreeOf(files);
  const opened = (key: Key) => {
    if (typeof key === 'string' && key.endsWith('/')) {
      setOpen((was) => {
        const next = new Set(was);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      return;
    }
    if (step === null) return;
    const path = String(key);
    void navigate({
      to: '.',
      search: (prev: Record<string, unknown>) => viewOpened(prev, { step, path }),
      resetScroll: false,
    });
  };
  return (
    <Tree
      aria-label={label}
      data-folder-tree
      density="dense"
      expandedKeys={open}
      onExpandedChange={setOpen}
      onAction={opened}
      className="mt-1 border border-outline-variant"
    >
      {rows(tree, step, open)}
    </Tree>
  );
}
