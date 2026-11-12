/**
 * How an upgrade's conflict is resolved (`contracts/resolution.contract.ts`): by a proposal of the object that holds its file in the
 * factory's tree, its owner — a Workflow, an Agent, a Skill, a Hire or the Factory itself — or, where no object holds it, by the person's
 * choice (`resolvedBy`); what the proposal recorded for an owner is to the factory controller's pass, by its phase now (`resolutionOf`);
 * an owner as the key `resolutions.json` and the pass's maps name it (`ownerKey`, `ownerOfKey`); a conflict's address as the segments of
 * its path and its key (`segmentsOf`, `keyOf`), and each conflict's owner by it (`conflictOwners`); and the template's render with a taken
 * owner's files given the tree's, so the merge keeps the tree's copy of what the applied proposal wrote (`takenFromTree`). Pure.
 */
import type { ResolutionKind, ResolutionOf, ResolutionOwner, ResolvedBy } from '../../../contracts/resolution.contract.ts';
import { textIn } from '../../folder/folder.ts';
import type { Conflict, TreeFile } from './merge.ts';

/** The folders beside the workflows in a tree's `workflows/` that hold no workflow: its agents, its skills, the carried files. */
const HELD_FOLDERS: readonly string[] = ['agents', 'skills', 'carried'];

/** The wiring's file, at the tree's root. */
export const WIRING_FILE = 'factory.json';

/** The key of the wiring that holds the hires, each `<workflow>/<step>` under it. */
const HIRES = 'hires.';

/** The agent whose file `file`, directly in the agents' folder, is: `<agent>.md` or `<agent>.schema.json`; none for another. */
const agentOfFile = (file: string): string | null => {
  const name = file.endsWith('.schema.json')
    ? file.slice(0, -'.schema.json'.length)
    : file.endsWith('.md')
      ? file.slice(0, -'.md'.length)
      : '';
  return name.length > 0 ? name : null;
};

/** The hire a key of the wiring names, `<workflow>.<step>` for `hires.<workflow>/<step>`; none for another key. */
const hireOfKey = (key: string | null): string | null => {
  if (key === null || !key.startsWith(HIRES)) return null;
  const step = key.slice(HIRES.length);
  const cut = step.indexOf('/');
  return cut > 0 && cut < step.length - 1 ? step.slice(0, cut) + '.' + step.slice(cut).slice(1) : null;
};

/**
 * The object whose proposal resolves a conflict, by its path's segments, the key after its `#` (null where it has none), whether every
 * side of its file is text, and the factory's name: a file directly in a workflow's folder by that Workflow; an agent's file or its
 * result schema by that Agent; a file of a skill's folder at any depth by that Skill; a step's hire of the wiring by that Hire; the rules
 * and the instruction by the Factory. Null, the person's choice, for a file that is not text, a carried file, the wiring's other keys or
 * the wiring whole, a file nested deeper in a workflow's folder, and any other.
 */
export const resolvedBy: ResolvedBy = (segments, key, text, factory) => {
  if (!text) return null;
  return segments.length === 1 ? rootOwner(segments[0] ?? '', key, factory) : workflowsOwner(segments);
};

/**
 * The owner of a file at the tree's root, `top`, its key `key`: the rules and the instruction by the Factory, a hire of the wiring by its
 * Hire.
 */
const rootOwner = (top: string, key: string | null, factory: string): ResolutionOwner | null => {
  if (top === 'RULES.md' || top === 'NEMIA.md') return { kind: 'Factory', name: factory };
  const hire = top === WIRING_FILE ? hireOfKey(key) : null;
  return hire === null ? null : { kind: 'Hire', name: hire };
};

/** The owner of a file under the tree's `workflows/`, by its path's segments: a Workflow, an Agent, a Skill, or none. */
const workflowsOwner = (segments: readonly string[]): ResolutionOwner | null => {
  const [top, folder, file] = segments;
  if (top !== 'workflows' || folder === undefined) return null;
  if (folder === 'skills') return segments.length >= 4 && file !== undefined ? { kind: 'Skill', name: file } : null;
  if (segments.length !== 3 || file === undefined) return null;
  if (folder === 'agents') {
    const agent = agentOfFile(file);
    return agent === null ? null : { kind: 'Agent', name: agent };
  }
  return HELD_FOLDERS.includes(folder) ? null : { kind: 'Workflow', name: folder };
};

/**
 * What an owner's conflicts are to the pass, by the proposal recorded for it as it is now: `taken` once it applied; `proposed` while it
 * waits or, approved, is still to apply; `refused` once it ended without applying, or is gone; `unresolved` where none is named.
 */
export const resolutionOf: ResolutionOf = (proposal) => {
  if (proposal === undefined) return 'unresolved';
  if (proposal.phase === 'applied') return 'taken';
  if (proposal.phase === 'waiting' || proposal.phase === 'approved') return 'proposed';
  return 'refused';
};

/** The kinds an owner is, as a key names them. */
const KINDS: readonly ResolutionKind[] = ['Workflow', 'Agent', 'Skill', 'Hire', 'Factory'];

/** An owner as one string, `<Kind>/<name>`: the key `resolutions.json` names its proposal by, and the pass's maps key it by. */
export const ownerKey = (owner: ResolutionOwner): string => `${owner.kind}/${owner.name}`;

/**
 * The owner a key names: `<Kind>/<name>`; a bare name, as `resolutions.json` named a workflow's before any other kind had one, a
 * Workflow.
 */
export const ownerOfKey = (key: string): ResolutionOwner => {
  const cut = key.indexOf('/');
  const kind = KINDS.find((k) => k === key.slice(0, cut));
  return cut > 0 && kind !== undefined ? { kind, name: key.slice(cut + 1) } : { kind: 'Workflow', name: key };
};

/** The segments of the path a conflict's address names: its `#<key>` or `:<a>-<b>` cut off, split at each `/`. */
export const segmentsOf = (at: string): string[] => at.replace(/(#.*|:\d+-\d+)$/, '').split('/');

/** The key a conflict's address names after its `#`, null where it names none. */
export const keyOf = (at: string): string | null => {
  const cut = at.indexOf('#');
  return cut < 0 ? null : at.slice(cut + 1);
};

/** Whether every side of a file that is there holds text (`textIn`). */
export const allText = (...sides: readonly (TreeFile | undefined)[]): boolean =>
  sides.every((side) => side === undefined || textIn(side.bytes) !== null);

/**
 * The key of the owner of a whole file of the tree, at the path `at`, where one owns it whole; the wiring, which a Hire owns by a key,
 * none.
 */
const fileOwnerKey = (at: string, factory: string): string | null => {
  const owner = resolvedBy(at.split('/'), null, true, factory);
  return owner === null ? null : ownerKey(owner);
};

/** The wiring's text read as JSON, or none where it does not read as an object. */
const wiringOf = (file: TreeFile | undefined): Record<string, unknown> | null => {
  const text = file === undefined ? null : textIn(file.bytes);
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** A record under `key` of `value`, or none. */
const recordAt = (value: Record<string, unknown> | null, key: string): Record<string, unknown> | undefined => {
  const at = value?.[key];
  return typeof at === 'object' && at !== null && !Array.isArray(at) ? (at as Record<string, unknown>) : undefined;
};

/**
 * The render's wiring `theirs` with each taken hire's value given the tree's `ours` holds, `hires.<workflow>/<step>`: removed where the
 * tree has none. The render's file as it was where no hire is taken, or either side does not read as JSON.
 */
function hiresTaken(theirs: TreeFile, ours: TreeFile | undefined, hires: readonly string[]): TreeFile {
  const render = wiringOf(theirs);
  const tree = wiringOf(ours);
  if (hires.length === 0 || render === null || (ours !== undefined && tree === null)) return theirs;
  const given = { ...recordAt(render, 'hires') };
  const mine = recordAt(tree, 'hires') ?? {};
  for (const hire of hires) {
    const cut = hire.indexOf('.');
    const step = `${hire.slice(0, cut)}/${hire.slice(cut + 1)}`;
    if (step in mine) given[step] = mine[step];
    else delete given[step];
  }
  const text = `${JSON.stringify({ ...render, hires: given }, null, 2)}\n`;
  return { ...theirs, bytes: Buffer.from(text) };
}

/**
 * The template's render `theirs` with each text file of the owners `owners` (by `ownerKey`) whose resolution applied given the tree's
 * file `ours` holds at its path: dropped where the tree has none, added where only the tree has it — a Workflow's files directly in its
 * folder, an Agent's `.md` and `.schema.json`, a Skill's folder at any depth, the Factory's rules and instruction — and a Hire's one key
 * of the wiring given the tree's value (`hiresTaken`). A file of another owner, a carried file, or one that is not text on either side,
 * is left as the render has it. For the merge alone: the base is still replaced by the true render.
 */
export function takenFromTree(
  theirs: readonly TreeFile[],
  ours: readonly TreeFile[],
  owners: Iterable<string>,
  factory: string,
): TreeFile[] {
  const taken = new Set(owners);
  const isTaken = (at: string): boolean => {
    const key = fileOwnerKey(at, factory);
    return key !== null && taken.has(key);
  };
  const hires = [...taken].map(ownerOfKey).flatMap((owner) => (owner.kind === 'Hire' ? [owner.name] : []));
  const tree = new Map(ours.map((file) => [file.path, file]));
  const render = new Map(theirs.map((file) => [file.path, file]));
  const out: TreeFile[] = [];
  for (const file of theirs) {
    const mine = tree.get(file.path);
    if (file.path === WIRING_FILE) out.push(hiresTaken(file, mine, hires));
    else if (!isTaken(file.path) || !allText(file, mine)) out.push(file);
    else if (mine !== undefined) out.push(mine);
  }
  for (const file of ours) if (!render.has(file.path) && isTaken(file.path) && allText(file)) out.push(file);
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * The owner whose proposal resolves each of `conflicts` (`resolvedBy`), by its address, as its key (`ownerKey`), read against the three
 * trees its merge was made of, a side being text where every one of them that holds its file holds text, in the factory `factory`; a
 * conflict the person's choice resolves is left out.
 */
export function conflictOwners(
  conflicts: readonly Conflict[],
  factory: string,
  ...trees: readonly (readonly TreeFile[])[]
): ReadonlyMap<string, string> {
  const indexed = trees.map((files) => new Map(files.map((file) => [file.path, file])));
  const owners = new Map<string, string>();
  for (const { at } of conflicts) {
    const segments = segmentsOf(at);
    if (segments.some((segment) => segment.length === 0)) continue;
    const file = segments.join('/');
    const owner = resolvedBy(segments, keyOf(at), allText(...indexed.map((index) => index.get(file))), factory);
    if (owner !== null) owners.set(at, ownerKey(owner));
  }
  return owners;
}
