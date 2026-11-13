/**
 * A factory moved to another store, decided before anything is written there: what the target is given of each repository
 * (`repoOnTarget`) and where it mounts each volume (`volumeOnTarget`), both proved by their contract
 * (`contracts/factory-move.contract.ts`); the factory's file as the export carries it (`fileTextOf`) and as the target files it
 * (`factoryOnTarget`); its folder as the target places it (`folderOnTarget`), but what stays with the source's store (`FOLDER_STAYS`);
 * and a card that follows it (`cardMoved`). Pure.
 */
import { folderName, DEFAULT_INSTRUCTION, type Factory, type Volume } from '../factory.ts';
import type { TreeFile } from '../../archive/archive.ts';
import { cardText, parseInboxCard } from '../../inbox/index.ts';
import type { RepoOnTargetOf, VolumeOnTargetOf } from '../../../contracts/factory-move.contract.ts';

export type { MovedVolume, RepoOnTarget, VolumeOnTarget } from '../../../contracts/factory-move.contract.ts';

/** The folders under a factory's own that belong to the store that keeps them and never move with it: its proposals and delegations. */
export const FOLDER_STAYS = ['proposals', 'delegations'] as const;

/**
 * What the target is given of the repository `source`, as `nemia factory add --repo` would be given it: the value the person typed for
 * it, else the URL the source recorded as its origin; a folder with neither is refused, naming the flag that gives it one.
 */
export const repoOnTarget: RepoOnTargetOf = (source, origin, typed) => {
  if (typed !== undefined) return { kind: 'given', repo: typed };
  if (origin !== undefined) return { kind: 'given', repo: origin };
  return {
    kind: 'refused',
    message:
      source +
      " is a folder of the source's machine and names no URL to clone it from: give the target a URL or a folder of its own, --repo " +
      source +
      '=<url|path>.',
  };
};

/**
 * Where the target mounts `volume`: the path the person typed for it, else its path on the source, `refusal` being the target's judgement
 * of the path chosen (`volumeRefusal`); a judged path is refused, saying why and naming the flag that gives another.
 */
export const volumeOnTarget: VolumeOnTargetOf = (volume, typed, refusal) => {
  if (refusal !== undefined)
    return {
      kind: 'refused',
      message: 'the volume ' + volume.name + ': ' + refusal + ' Give it another path: --volume ' + volume.name + '=<path>.',
    };
  return { kind: 'mounted', path: typed ?? volume.path };
};

/**
 * A volume as a move names it — in `--volume <key>=<path>`, a refusal and the import's answer: its name where it has one, else its path
 * on the source.
 */
export const volumeKey = (volume: Pick<Volume, 'name' | 'path'>): string => volume.name ?? volume.path;

/**
 * What the target decided of a factory before it files it: its tree (`treeDir`, for a templated one), each source repository's folder on
 * the target by its path on the source (`repos`), the URL of each folder it clones (`origins`), each volume's path by its key
 * (`volumeKey`; one not named keeps its path), whether the instruction's words the export carried are kept in its store
 * (`instructionKept`), and where it keeps the template it was given (`template`).
 */
export type OnTarget = {
  readonly tree?: string;
  readonly repos: Readonly<Record<string, string>>;
  readonly origins: Readonly<Record<string, string>>;
  readonly volumes: Readonly<Record<string, string>>;
  readonly instructionKept: boolean;
  readonly template?: string;
};

/**
 * The folder names of `source`'s repositories that change on the target, the old to the new (`onTarget.repos`): what a workflow's
 * repository and a schedule's are named by.
 */
export const renamedFolders = (source: Pick<Factory, 'repos'>, repos: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(
    source.repos.flatMap((repo) => {
      const moved = repos[repo];
      return moved === undefined || folderName(moved) === folderName(repo) ? [] : [[folderName(repo), folderName(moved)] as const];
    }),
  );

/** `values`, each a repository's folder name, renamed by `renamed`. */
const renamedIn = (values: Readonly<Record<string, string>>, renamed: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, renamed[value] ?? value]));

/**
 * The factory `source` as the target files it: on its repositories (`onTarget.repos`, each named once) and the origins of those it cloned,
 * from its own tree, its volumes at their decided paths with their names and marks kept, the workflows' repositories and the schedules'
 * renamed where a repository's folder name changed, its instruction kept in the store where the export carried its words, its template
 * read where the target kept it, and no generation, which the door counts again. Everything else as read.
 */
export function factoryOnTarget(source: Factory, onTarget: OnTarget): Factory {
  const { generation: _counted, tree: _tree, origins: _origins, ...kept } = source;
  const renamed = renamedFolders(source, onTarget.repos);
  const repos = [...new Set(source.repos.map((repo) => onTarget.repos[repo] ?? repo))];
  const schedules = Object.fromEntries(
    Object.entries(source.schedules).map(([workflow, schedule]) => [
      workflow,
      schedule.repo === undefined ? schedule : { ...schedule, repo: renamed[schedule.repo] ?? schedule.repo },
    ]),
  );
  return {
    ...kept,
    repos,
    schedules,
    ...(Object.keys(onTarget.origins).length ? { origins: onTarget.origins } : {}),
    ...(source.template !== undefined && onTarget.tree !== undefined ? { tree: onTarget.tree } : {}),
    ...(source.template === undefined ? {} : { template: { ...source.template, source: onTarget.template ?? source.template.source } }),
    ...(source.volumes === undefined
      ? {}
      : { volumes: source.volumes.map((volume) => ({ ...volume, path: onTarget.volumes[volumeKey(volume)] ?? volume.path })) }),
    ...(source.workflowRepos === undefined ? {} : { workflowRepos: renamedIn(source.workflowRepos, renamed) }),
    ...(onTarget.instructionKept ? { instruction: { store: true } } : {}),
  };
}

/**
 * The factory `factory` as its file holds it, as text: every key of its spec but its name, which is its file's, and, made from a template,
 * neither its tree, which is its store's, nor the wiring its tree holds (its workflows, hires, revisions policy and workflows'
 * repositories), which travels in its folder.
 */
export function fileTextOf(factory: Factory): string {
  const { name: _name, tree: _tree, ...file } = factory;
  if (factory.template === undefined) return `${JSON.stringify(file, null, 2)}\n`;
  const { workflows: _workflows, hires: _hires, revisions: _revisions, workflowRepos: _repos, ...own } = file;
  return `${JSON.stringify(own, null, 2)}\n`;
}

/** The file of a templated factory's folder that holds its tree's wiring. */
const TREE_WIRING = 'tree/factory.json';

/** The text of `wiring`, a tree's `factory.json`, its workflows' repositories renamed by `renamed`; as it was where it holds none. */
function wiringRenamed(text: string, renamed: Readonly<Record<string, string>>): string {
  let wiring: unknown;
  try {
    wiring = JSON.parse(text);
  } catch {
    return text;
  }
  if (typeof wiring !== 'object' || wiring === null || !('workflowRepos' in wiring)) return text;
  const repos = wiring.workflowRepos;
  if (typeof repos !== 'object' || repos === null) return text;
  const named = Object.fromEntries(
    Object.entries(repos).map(([key, value]) => [key, typeof value === 'string' ? (renamed[value] ?? value) : value]),
  );
  return `${JSON.stringify({ ...wiring, workflowRepos: named }, null, 2)}\n`;
}

/**
 * The files of a factory's folder as the target places them: its tree's wiring with its workflows' repositories renamed where a
 * repository's folder name changed (`renamed`), and the instruction's words the export carried, where it did, as the file the store keeps
 * them in; every other file as it was.
 */
export function folderOnTarget(
  files: readonly TreeFile[],
  how: { readonly renamed: Readonly<Record<string, string>>; readonly instruction?: string },
): TreeFile[] {
  const placed = files
    .filter((file) => how.instruction === undefined || file.path !== DEFAULT_INSTRUCTION)
    .map((file) =>
      file.path === TREE_WIRING && Object.keys(how.renamed).length
        ? { ...file, bytes: new TextEncoder().encode(wiringRenamed(new TextDecoder().decode(file.bytes), how.renamed)) }
        : file,
    );
  return how.instruction === undefined
    ? placed
    : [...placed, { path: DEFAULT_INSTRUCTION, mode: 0o644, bytes: new TextEncoder().encode(how.instruction) }];
}

/** The line a moved card's body ends with: where it came from, its name there and its factory's. */
export const movedLine = (moved: { readonly from: string; readonly name: string; readonly factory: string }): string =>
  `Moved from ${moved.from}: the card ${moved.name} of the factory ${moved.factory}.`;

/**
 * The card `text`, named `name` on the source, as it follows its factory to the target: its `repo:` (retired), `from:` (the source's runs)
 * and `queued:` (nothing starts before the person trusts the factory there) taken off, every other key kept, and its body ending with the
 * line that says where it came from (`movedLine`). Read and written by the inbox's own readers (`parseInboxCard`, `cardText`); refused as
 * they refuse a card that does not read.
 */
export function cardMoved(text: string, moved: { readonly name: string; readonly factory: string; readonly from: string }): string {
  const card = parseInboxCard(`${moved.name}.md`, text);
  return cardText(
    { ...card, body: `${card.body.trimEnd()}\n\n${movedLine(moved)}` },
    { repo: undefined, from: undefined, queued: undefined },
  );
}
