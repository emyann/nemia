/**
 * A factory moved to another store, decided before anything is written there: what the target is given of each repository
 * (`repoOnTarget`) and where it mounts each volume (`volumeOnTarget`), both proved by their contract
 * (`contracts/factory-move.contract.ts`); the factory's file as the export carries it (`fileTextOf`) and as the target files it
 * (`factoryOnTarget`); its folder as the target places it (`folderOnTarget`), but what stays with the source's store (`FOLDER_STAYS`);
 * and a card that follows it (`cardMoved`). Pure.
 */
import { folderName, DEFAULT_INSTRUCTION, workedOn, type Factory, type Volume } from '../factory.ts';
import type { TreeFile } from '../../archive/archive.ts';
import { cardText, parseInboxCard } from '../../inbox/index.ts';
import type { RepoOnTargetOf, VolumeOnTargetOf } from '../../../contracts/factory-move.contract.ts';

/** The folders under a factory's own that belong to the store that keeps them and never move with it: its proposals and delegations. */
export const FOLDER_STAYS = ['proposals', 'delegations'] as const;

/**
 * What the target is given of the repository `source`, as `nemia factory add --repo` would be given it: the value the person typed for
 * it, else the URL the source recorded as its origin; a folder with neither is refused, naming the flag that gives it one.
 * @param source The repository's folder on the source's machine.
 * @param origin The URL the source recorded as its origin, or undefined where it recorded none.
 * @param typed The value the person typed for it, or undefined where they typed none.
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
 * @param volume The volume on the source, by its name and its path.
 * @param typed The path the person typed for it, or undefined where they typed none.
 * @param refusal The target's judgement of the path chosen, or undefined where it refuses none.
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
 * @param volume The volume, by its name and its path on the source.
 */
export const volumeKey = (volume: Pick<Volume, 'name' | 'path'>) => volume.name ?? volume.path;

/**
 * What the target decided of a factory before it files it: its tree (`treeDir`, for a templated one), each source repository's folder on
 * the target by its path on the source (`repos`, its writable volumes), the URL of each folder it clones (`origins`), each read-only
 * volume's path by its key (`volumeKey`; one not named keeps its path), whether the instruction's words the export carried are kept in its
 * store
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
 * @param source The factory on the source, by its volumes.
 * @param repos Each repository's folder on the target, by its path on the source.
 */
export const renamedFolders = (source: Pick<Factory, 'volumes'>, repos: Readonly<Record<string, string>>) =>
  Object.fromEntries(
    workedOn(source).flatMap((repo) => {
      const moved = repos[repo];
      return moved === undefined || folderName(moved) === folderName(repo) ? [] : [[folderName(repo), folderName(moved)] as const];
    }),
  );

/** `values`, each a repository's folder name, renamed by `renamed`. */
const renamedIn = (values: Readonly<Record<string, string>>, renamed: Readonly<Record<string, string>>) =>
  Object.fromEntries(Object.entries(values).map(([key, value]) => [key, renamed[value] ?? value]));

/**
 * The volume `volume` of a factory on the source as the target files it: a writable one at its repository's folder there
 * (`onTarget.repos`), with the URL it was cloned from where the target cloned it (`onTarget.origins`) and none where it was given a
 * folder; a read-only one at its decided path (`onTarget.volumes`); its name and its mark kept.
 */
const volumeOnTargetOf = (volume: Volume, onTarget: OnTarget) => {
  const { origin: _origin, ...own } = volume;
  if (volume.readOnly) return { ...own, path: onTarget.volumes[volumeKey(volume)] ?? volume.path };
  const at = onTarget.repos[volume.path] ?? volume.path;
  const origin = onTarget.origins[at];
  return { ...own, path: at, ...(origin === undefined ? {} : { origin }) };
};

/**
 * The factory `source` as the target files it: its writable volumes on its repositories there (`onTarget.repos`, each named once) with
 * the origins of those it cloned, from its own tree, its read-only volumes at their decided paths, each with its name and mark kept, the
 * workflows' repositories and the schedules'
 * renamed where a repository's folder name changed, its instruction kept in the store where the export carried its words, its template
 * read where the target kept it, and no generation, which the door counts again. Everything else as read.
 * @param source The factory as the source's file holds it.
 * @param onTarget What the target decided of it.
 */
export function factoryOnTarget(source: Factory, onTarget: OnTarget) {
  const { generation: _counted, tree: _tree, ...kept } = source;
  const renamed = renamedFolders(source, onTarget.repos);
  const moved = source.volumes.map((volume) => volumeOnTargetOf(volume, onTarget));
  const volumes = moved.filter((v, i) => moved.findIndex((w) => w.path === v.path) === i);
  const schedules = Object.fromEntries(
    Object.entries(source.schedules).map(([workflow, schedule]) => [
      workflow,
      schedule.repo === undefined ? schedule : { ...schedule, repo: renamed[schedule.repo] ?? schedule.repo },
    ]),
  );
  return {
    ...kept,
    volumes,
    schedules,
    ...(source.template !== undefined && onTarget.tree !== undefined ? { tree: onTarget.tree } : {}),
    ...(source.template === undefined ? {} : { template: { ...source.template, source: onTarget.template ?? source.template.source } }),
    ...(source.workflowRepos === undefined ? {} : { workflowRepos: renamedIn(source.workflowRepos, renamed) }),
    ...(onTarget.instructionKept ? { instruction: { store: true } } : {}),
  } satisfies Factory;
}

/**
 * The factory `factory` as its file holds it, as text: every key of its spec but its name, which is its file's, and, made from a template,
 * neither its tree, which is its store's, nor the wiring its tree holds (its workflows, hires, revisions policy and workflows'
 * repositories), which travels in its folder.
 * @param factory The factory to write.
 */
export function fileTextOf(factory: Factory) {
  const { name: _name, tree: _tree, ...file } = factory;
  if (factory.template === undefined) return `${JSON.stringify(file, null, 2)}\n`;
  const { workflows: _workflows, hires: _hires, revisions: _revisions, workflowRepos: _repos, ...own } = file;
  return `${JSON.stringify(own, null, 2)}\n`;
}

/** The file of a templated factory's folder that holds its tree's wiring. */
const TREE_WIRING = 'tree/factory.json';

/** The text of `wiring`, a tree's `factory.json`, its workflows' repositories renamed by `renamed`; as it was where it holds none. */
function wiringRenamed(text: string, renamed: Readonly<Record<string, string>>) {
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

/** Where a factory's level and servers travel in an archive: the files they were kept in, at these paths from its folder. */
const RECORD_FILES = { level: 'level.json', servers: 'servers.json' } as const;

/**
 * The files of a factory's folder with its level and servers, which are records of the store and no files of the folder, packed beside
 * them at the paths they were files at, so an archive reads as it always did. Sorted by path.
 * @param files The files of the factory's folder.
 * @param records The text of the factory's level record and of its servers record, each absent where it has none.
 */
export const withRecords = (files: readonly TreeFile[], records: { readonly level?: string; readonly servers?: string }) =>
  [
    ...files,
    ...(['level', 'servers'] as const).flatMap((kind) => {
      const text = records[kind];
      return text === undefined ? [] : [{ path: RECORD_FILES[kind], mode: 0o644, bytes: new TextEncoder().encode(text) }];
    }),
  ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

/**
 * The files an archive carried but for the level and the servers, which the target files as records of its store: the rest to place, and
 * the text of each of the two where the archive held it.
 * @param files The files of the folder sent.
 */
export const withoutRecords = (files: readonly TreeFile[]) => {
  const text = (at: string) => {
    const found = files.find((file) => file.path === at);
    return found === undefined ? undefined : new TextDecoder().decode(found.bytes);
  };
  return {
    files: files.filter((file) => file.path !== RECORD_FILES.level && file.path !== RECORD_FILES.servers),
    level: text(RECORD_FILES.level),
    servers: text(RECORD_FILES.servers),
  };
};

/**
 * The files of a factory's folder as the target places them: its tree's wiring with its workflows' repositories renamed where a
 * repository's folder name changed (`renamed`), and the instruction's words the export carried, where it did, as the file the store keeps
 * them in; every other file as it was.
 * @param files The files of the factory's folder, as the export carried them.
 * @param how The folder names that change, the old to the new (`renamed`), and the instruction's words the export carried, where it did.
 */
export function folderOnTarget(
  files: readonly TreeFile[],
  how: { readonly renamed: Readonly<Record<string, string>>; readonly instruction?: string },
) {
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

/**
 * The line a moved card's body ends with: where it came from, its name there and its factory's.
 * @param moved Where the card came from (the source's name), its name there and its factory's.
 */
const movedLine = (moved: { readonly from: string; readonly name: string; readonly factory: string }) =>
  `Moved from ${moved.from}: the card ${moved.name} of the factory ${moved.factory}.`;

/**
 * The card `text`, named `name` on the source, as it follows its factory to the target: its `repo:` (retired), `from:` (the source's runs)
 * and `queued:` (nothing starts before the person trusts the factory there) taken off, every other key kept, and its body ending with the
 * line that says where it came from (`movedLine`). Read and written by the inbox's own readers (`parseInboxCard`, `cardText`); refused as
 * they refuse a card that does not read.
 * @param text The card's text on the source.
 * @param moved Its name on the source, its factory's, and where it came from (the source's name), said in its last line.
 */
export function cardMoved(text: string, moved: { readonly name: string; readonly factory: string; readonly from: string }) {
  const card = parseInboxCard(`${moved.name}.md`, text);
  return cardText(
    { ...card, body: `${card.body.trimEnd()}\n\n${movedLine(moved)}` },
    { repo: undefined, from: undefined, queued: undefined },
  );
}
