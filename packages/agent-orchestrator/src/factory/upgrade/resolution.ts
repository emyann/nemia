/**
 * How an upgrade's conflict is resolved (`contracts/resolution.contract.ts`): a conflict in a text file directly in a workflow's folder of
 * the factory's tree by a proposal of that Workflow, any other by the person's choice (`resolvedBy`); what the proposal recorded for a
 * workflow is to the factory controller's pass, by its phase now (`workflowResolution`); a conflict's address as the segments of its
 * path (`segmentsOf`), and each conflict's by it (`conflictOwners`); and the template's render with a taken workflow's files given the
 * tree's, so the merge keeps the tree's copy of what the applied proposal wrote (`takenFromTree`). Pure.
 */
import type { ResolvedBy, WorkflowResolutionOf } from '../../../contracts/resolution.contract.ts';
import { textIn } from '../../folder/folder.ts';
import type { Conflict, TreeFile } from './merge.ts';

/** The folders beside the workflows in a tree's `workflows/` that hold no workflow: its agents, its skills, the carried files. */
const HELD_FOLDERS: readonly string[] = ['agents', 'skills', 'carried'];

/**
 * The workflow whose proposal resolves a conflict at the path `segments`, `text` where each side of its file is text: the folder's name
 * where the file is directly in a workflow's folder (`workflows/<workflow>/<file>`); null, the person's choice, anywhere else.
 */
export const resolvedBy: ResolvedBy = (segments, text) => {
  if (!text || segments.length !== 3 || segments[0] !== 'workflows') return null;
  const workflow = segments[1];
  return workflow === undefined || HELD_FOLDERS.includes(workflow) ? null : workflow;
};

/**
 * What a workflow's conflicts are to the pass, by the proposal recorded for it as it is now: `taken` once it applied; `proposed` while it
 * waits or, approved, is still to apply; `refused` once it ended without applying, or is gone; `unresolved` where none is named.
 */
export const workflowResolution: WorkflowResolutionOf = (proposal) => {
  if (proposal === undefined) return 'unresolved';
  if (proposal.phase === 'applied') return 'taken';
  if (proposal.phase === 'waiting' || proposal.phase === 'approved') return 'proposed';
  return 'refused';
};

/** The segments of the path a conflict's address names: its `#<key>` or `:<a>-<b>` cut off, split at each `/`. */
export const segmentsOf = (at: string): string[] => at.replace(/(#.*|:\d+-\d+)$/, '').split('/');

/** Whether every side of a file that is there holds text (`textIn`). */
export const allText = (...sides: readonly (TreeFile | undefined)[]): boolean =>
  sides.every((side) => side === undefined || textIn(side.bytes) !== null);

/** The workflow a tree path is a file directly in the folder of, or none: its agents', skills' and carried files' folders aside. */
const workflowOfPath = (at: string): string | null => resolvedBy(at.split('/'), true);

/**
 * The template's render `theirs` with each text file directly in a folder of `workflows`, the workflows whose resolution applied, given
 * the tree's file `ours` holds at its path: dropped where the tree has none, added where only the tree has it. A file of another workflow,
 * of the agents, skills or carried files, or one that is not text on either side, is left as the render has it. For the merge alone: the
 * base is still replaced by the true render.
 */
export function takenFromTree(theirs: readonly TreeFile[], ours: readonly TreeFile[], workflows: Iterable<string>): TreeFile[] {
  const taken = new Set(workflows);
  const isTaken = (at: string): boolean => {
    const workflow = workflowOfPath(at);
    return workflow !== null && taken.has(workflow);
  };
  const tree = new Map(ours.map((file) => [file.path, file]));
  const render = new Map(theirs.map((file) => [file.path, file]));
  const out: TreeFile[] = [];
  for (const file of theirs) {
    const mine = tree.get(file.path);
    if (!isTaken(file.path) || !allText(file, mine)) out.push(file);
    else if (mine !== undefined) out.push(mine);
  }
  for (const file of ours) if (!render.has(file.path) && isTaken(file.path) && allText(file)) out.push(file);
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * The workflow whose proposal resolves each of `conflicts` (`resolvedBy`), by its address, read against the three trees its merge was
 * made of, a side being text where every one of them that holds its file holds text; a conflict the person's choice resolves is left out.
 */
export function conflictOwners(conflicts: readonly Conflict[], ...trees: readonly (readonly TreeFile[])[]): ReadonlyMap<string, string> {
  const indexed = trees.map((files) => new Map(files.map((file) => [file.path, file])));
  const owners = new Map<string, string>();
  for (const { at } of conflicts) {
    const segments = segmentsOf(at);
    if (segments.some((segment) => segment.length === 0)) continue;
    const file = segments.join('/');
    const workflow = resolvedBy(segments, allText(...indexed.map((index) => index.get(file))));
    if (workflow !== null) owners.set(at, workflow);
  }
  return owners;
}
