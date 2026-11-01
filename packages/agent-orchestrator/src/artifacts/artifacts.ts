/**
 * Files a step leaves for the steps after it and for the person who decides: what its brief says of them (`artifactsContract`), where a
 * file it names is found (`artifactPlace`), the folders a later step reads them in (`handedMounts`), the lines that list them
 * (`artifactLines`), which steps have the files their closeout named read (`filesDue`), and what a missing one is said as
 * (`lackLines`). Pure: `artifacts.store.ts` copies them.
 */
import path from 'node:path';
import { CONFIG_FOLDERS, configFolderIn } from 'agent-runtime/vocabulary';
import { filesPrunedWords, type Mount, type Pruned, type Run, type TaskPhase } from '../record/record.ts';
import { sandboxed, upstreamOf } from '../workflow/index.ts';
import type { Workflow } from '../step/step.ts';
import { DEFAULT_HARNESS, isRemoteHarness } from '../harness/harness.ts';

/**
 * Where a step's files go, told on its brief beside the closeout contract.
 *
 * A file a step writes into its workspace is committed by the hand-off and rides the branch — a
 * screenshot, under the step's name, into what lands — and a gitignored one never reaches the next
 * step's worktree at all. So the run makes a directory per step, beside the run's record and outside
 * every workspace (`artifactsDir` in record.store.ts), and says where it is. Mechanism, like the closeout: a
 * step does not have to find somewhere, and a workflow author does not have to remember to say where.
 *
 * Both ways are said, because not every step can use the first: Codex in `workspace-write` writes only its
 * worktree, and the engine gives it no other directory. A file named from the workspace root is collected into
 * the directory at hand-off, before the check (`collectArtifacts` in artifacts.store.ts), so such a step hands it over too.
 *
 * `inMain` for a step that works in the repository's own checkout (`workspace: base`): there the second way is
 * false and does harm. The run hands nothing off in a person's checkout (`handOffDue`), so nothing is collected
 * and nothing is committed — a file left there stays in their checkout for ever, and the next run's ending step
 * reads `git status --porcelain` as dirty and stops. Such a step has no check to be given `WF_ARTIFACTS` either,
 * since `workspace: base` refuses one, and nothing follows it to read what it wrote. So it is told the one way.
 *
 * `inFolder` for a step of a folder run (`place: folder`): there the *first* way is the one that does harm. Such a step runs as a
 * job, which asks nobody, fenced to its own folder, and that directory sits beside the folder, outside the fence: told to put a file
 * there, the session is denied. The second way needs nothing outside the fence and hands the file over all the same. So it too is told
 * one way, and neither mentions a branch, since a folder run has none.
 *
 * Both of the ways that hand files to the steps after say that a file through a folder a harness reads as its own configuration
 * (`CONFIG_FOLDERS`) is refused, and why: a later step reads the files directory as a mounted folder, and its harness would take such a
 * file as its own. The checkout's way hands nothing to a later step, and says nothing of it.
 */
export const artifactsContract = (dir: string, inMain = false, inFolder = false): string =>
  (inFolder
    ? [
        '',
        '## Files for the steps after you',
        '',
        'A note, a log or a report reaches the steps after you and the person who decides one way: leave it in this',
        'folder, and name it in `artifacts` by its path from the folder, such as `note.md`. When you finish, the run',
        'copies each such file out and keeps it, before it checks your work.',
        '',
        'Write nowhere else. This folder is yours and everything outside it is denied without asking, since there is',
        'nobody to ask. Refused, and not read: an absolute path, and a path that climbs out of this folder with `..`.',
        'A directory is not collected, nor a file that is not there: name each file.',
        '',
        LACKS_REFUSE,
        '',
        ...configurationRefused('copied out'),
      ]
    : inMain
      ? [
          '',
          '## Files for the person who decides',
          '',
          `A report, a log or a screenshot reaches them one way: put it in \`${dir}\`, and name it in \`artifacts\` by`,
          'absolute path. The run made that directory for this step, outside every workspace, and a file there is the',
          'only one it keeps.',
          '',
          "This workspace is the repository's own checkout, where the run hands nothing off: a file you leave here is",
          "not collected and not committed — it stays in a person's checkout, and `nemia decide` reads a path named from",
          'the workspace root as `not collected`. Name each file by its absolute path in that directory; a directory is',
          'not collected, nor a file that is not there.',
          '',
          LACKS_REFUSE,
        ]
      : [
          '',
          '## Files for the steps after you',
          '',
          'A screenshot, a log or a report reaches the steps after you and the person who decides in either of two ways.',
          '',
          `- Put it in \`${dir}\`, and name it in \`artifacts\` by absolute path. The run made that directory for`,
          '  this step, outside every workspace, so a file there does not ride the branch.',
          '- Or leave it in this workspace, and name it in `artifacts` by its path from the workspace root, such as',
          '  `RESPONSE.md` or `.e2e/shot.png`. When you finish, the run copies each such file into that directory, at the',
          '  same path, before it checks your work, so a step that cannot write outside its workspace hands its files over',
          '  all the same. A file left in the workspace is committed with the rest too, unless git ignores it.',
          '',
          "The run's check of this step is given the same directory as `WF_ARTIFACTS`. Refused, and not read: an absolute",
          'path anywhere else, and a path that climbs out of the workspace with `..`. A directory is not collected, nor a',
          'file that is not there: name each file.',
          '',
          LACKS_REFUSE,
          '',
          ...configurationRefused('handed over'),
        ]
  ).join('\n');

/**
 * The brief's line saying a closeout that names a file the run does not have is refused (`filesLacked` in artifacts.store.ts), and that
 * the step answers it in its next try.
 */
const LACKS_REFUSE =
  'A closeout that names a file the run does not then have is refused: nothing that waits on you starts, and you are asked again, told each such name.';

/** The brief's lines saying a file through a configuration folder (`CONFIG_FOLDERS`) is refused, and not `done` with it, and why. */
const configurationRefused = (done: string): string[] => [
  `A file whose path passes through ${CONFIG_FOLDERS.map((f) => `\`${f}\``).join(' or ')}, a folder a harness reads as its own configuration, is`,
  `refused, and not ${done}: the steps after you read your files in a folder of theirs, and would take it as their own.`,
];

/**
 * Where a declared artifact is looked for. Pure: it reads the path, never the disk.
 *
 *   workspace  a path from the workspace root — collected from the workspace into the step's files directory
 *              when the step hands off (`collectArtifacts` in artifacts.store.ts), and read from there
 *   files      an absolute path inside the step's files directory — on disk, where the run keeps it
 *   escapes    a path from the workspace root that climbs out of it, `../notes.md` — refused, and never read
 *   outside    any other absolute path — refused. A closeout is an agent's text, and the run does not
 *              look at a file on this machine because a step named it. `..` is resolved first, so a path
 *              that climbs out of the directory is outside however it is spelled.
 *   configuration  a path from the workspace root, or one inside the files directory, that passes through a
 *              folder a harness reads as its own configuration (`configFolderIn`) — refused, and never
 *              collected: the steps after read the files directory as a mounted folder, and their harness
 *              would take the file as its own. Asked after `escapes` and `outside`.
 *   reserved   `closeout.json` at the workspace root or at the root of the files directory (`HANDED_CLOSEOUT`): the run's own name
 *              for the step's closeout it writes there — refused, and never collected.
 */
export type ArtifactPlace = 'workspace' | 'files' | 'escapes' | 'outside' | 'configuration' | 'reserved';

/**
 * The file the tick writes in a step's files directory once it signs off (`handCloseout` in artifacts.store.ts): the step's closeout in
 * v1's shape, which the steps after it read there. Its name is the run's: a closeout that names it is refused (`reserved`).
 */
export const HANDED_CLOSEOUT = 'closeout.json';

/** Where a declared artifact is looked for (`ArtifactPlace`). Pure. The files directory itself is no file in it, and is `outside`. */
export function artifactPlace(file: string, dir: string): ArtifactPlace {
  if (!path.isAbsolute(file)) {
    const rel = path.normalize(file);
    if (rel === '..' || rel.startsWith(`..${path.sep}`)) return 'escapes';
    if (rel === HANDED_CLOSEOUT) return 'reserved';
    return configFolderIn(rel) ? 'configuration' : 'workspace';
  }
  const within = path.relative(path.resolve(dir), path.resolve(file));
  if (!within || within === '..' || within.startsWith(`..${path.sep}`) || path.isAbsolute(within)) return 'outside';
  if (within === HANDED_CLOSEOUT) return 'reserved';
  return configFolderIn(within) ? 'configuration' : 'files';
}

/** A file in a step's files directory, by absolute path, and its size. */
export type ArtifactFile = { path: string; bytes: number };

/**
 * A declared artifact the run does not have, and why (`missingArtifacts` in artifacts.store.ts):
 *
 *   not there      a path from the workspace root with nothing at it, nor on the branch
 *   not known      a path from the workspace root the run has not collected, and whose branch's tip the place did not say: `said` is
 *                  what it said instead
 *   directory      a path from the workspace root that is a directory: not collected, since a step names each file
 *   not collected  a file in the workspace that is not in the step's files directory, and whose copy something in that directory refused
 *                  — or that is on no branch either: git ignores it, and its step has not handed off
 *   missing        an absolute path in the step's files directory that is not a file there
 *   escapes        a path that climbs out of the workspace, as written or through a link in it: refused, and not read
 *   outside        an absolute path outside the step's files directory: refused, and not read
 *   configuration  a path through a folder a harness reads as its own configuration (`ArtifactPlace`): refused, and not handed over
 *   reserved       the run's own name for the closeout it writes (`HANDED_CLOSEOUT`): refused, and not handed over
 */
export type MissingArtifact = {
  path: string;
  why: 'not there' | 'not known' | 'directory' | 'not collected' | 'missing' | 'escapes' | 'outside' | 'configuration' | 'reserved';
  said?: string;
};

/**
 * What `nemia decide` prints about a step's files, after its closeout: each declared file the run does not have, told apart by why —
 * a refusal is named as one, never passed over — and then every file in the step's directory, collected or written there, with its size.
 *
 * With its files removed by `nemia prune --artifacts`, a file the directory does not have, and one named from a workspace also gone, is
 * said `not kept`: a step's files are collected at its hand-off, and the marker cannot tell one the step never wrote from one it did.
 */
export function artifactLines(dir: string, missing: readonly MissingArtifact[], files: readonly ArtifactFile[], pruned?: Pruned): string[] {
  const line = (why: MissingArtifact['why'], say: (names: string) => string): string[] => {
    const names = missing.filter((m) => m.why === why).map((m) => m.path);
    return names.length ? [say(names.join(', '))] : [];
  };
  const filesGone = pruned?.artifacts;
  const gone = filesGone ? missing.filter((m) => m.why === 'missing' || m.why === 'not there').map((m) => m.path) : [];
  return [
    ...(filesGone && gone.length ? [`!! not kept: ${gone.join(', ')}  — ${filesPrunedWords(filesGone)}`] : []),
    ...(filesGone
      ? []
      : line('not there', (names) =>
          pruned
            ? `!! declared and not collected: ${names}  — on no branch, and its worktree was removed by nemia prune at ${pruned.at}`
            : `!! declared but not in the workspace: ${names}  — nothing to collect`,
        )),
    ...line(
      'not known',
      (names) =>
        `!! declared and not collected, and whether its branch has it is not known: ${names}  — ${missing.find((m) => m.said)?.said ?? ''}`,
    ),
    ...line('directory', (names) => `!! declared a directory, not collected: ${names}  — a step names each file`),
    ...line('not collected', (names) => `!! declared and not collected: ${names}  — in the workspace, and not in ${dir}`),
    ...(filesGone ? [] : line('missing', (names) => `!! declared but not in ${dir}: ${names}`)),
    ...line(
      'escapes',
      (names) => `!! declared outside the workspace, and not read: ${names}  — name a file from the workspace root, or put it in ${dir}`,
    ),
    ...line('outside', (names) => `!! declared outside ${dir}, and not read: ${names}  — a step's files go in its own directory`),
    ...line(
      'configuration',
      (names) =>
        `!! declared through a folder a harness reads as its own configuration, and not handed over: ${names}` +
        `  — the steps after it would read it as theirs; name it outside ${CONFIG_FOLDERS.map((f) => `\`${f}\``).join(' or ')}`,
    ),
    ...line('reserved', (names) => `!! declared the run's own name, and not handed over: ${names}  — ${HANDED_CLOSEOUT} is the run's`),
    ...(files.length ? ['files:', ...files.map((f) => `  ${f.path}  ${sizeOf(f.bytes)}`)] : []),
  ];
}

/**
 * The reasons a declared file is missing that refuse the closeout that named it (`filesLacked` in artifacts.store.ts): the step chose the
 * name, and can write the file where its brief says or take the name off. Not `not collected`, a copy the run did not make, nor
 * `not known`, where the run's place did not say: those are the run's own, and no refusal of the work.
 */
export const REFUSING: ReadonlySet<MissingArtifact['why']> = new Set([
  'not there',
  'missing',
  'directory',
  'escapes',
  'outside',
  'configuration',
  'reserved',
]);

/** Why the run does not have a file a closeout named, said of that one file to the step that named it: `why` as `REFUSING` holds it. */
export function lackWords(why: string, dir: string): string {
  const words: Record<string, string> = {
    'not there': 'nothing is at that path in the workspace',
    missing: `it is not a file in \`${dir}\``,
    directory: 'it is a directory, and a closeout names each file',
    escapes: 'it leads out of the workspace, so it was not read',
    outside: `it is an absolute path outside \`${dir}\`, so it was not read`,
    reserved: `\`${HANDED_CLOSEOUT}\` is the run's own name for the closeout it writes in \`${dir}\`, so it was not handed over: rename the file`,
    configuration: `it passes through ${CONFIG_FOLDERS.map((f) => `\`${f}\``).join(' or ')}, a folder a harness reads as its own configuration, so it was not handed over`,
  };
  return words[why] ?? `the run does not have it (${why})`;
}

/**
 * A file that is there under a name near the one a closeout gave: among `there`, the files of the step's directory by absolute path, the
 * first with the same last name, letter case aside — in the folder named, spelled in another case, or in another folder. Undefined where
 * none is, and where the file named is itself there.
 */
export function nearName(named: string, there: readonly string[]): string | undefined {
  const last = path.basename(named).toLowerCase();
  if (there.some((file) => file === named)) return undefined;
  return there.find((file) => path.basename(file).toLowerCase() === last);
}

/**
 * The lines that name each file a closeout lacked to whoever answers for it: the name as the closeout gave it, why the run does not have
 * it (`lackWords`), and the near name where the step's directory `dir` holds one among `there` (`nearName`).
 */
export const lackLines = (lacked: readonly { path: string; why: string }[], dir: string, there: readonly string[]): string[] =>
  lacked.map((file) => {
    const near = nearName(path.isAbsolute(file.path) ? file.path : path.join(dir, file.path), there);
    return `- \`${file.path}\`: ${lackWords(file.why, dir)}.${near ? ` There is \`${near}\`.` : ''}`;
  });

/** What a step's brief says of the files a step before it named: those that are there now, by absolute path, and how many are gone. */
export type HandedFiles = { there: string[]; gone: number };

/** Bytes, as a person reads them. */
export const sizeOf = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 ** 2
      ? `${(bytes / 1024).toFixed(1)} KB`
      : bytes < 1024 ** 3
        ? `${(bytes / 1024 ** 2).toFixed(1)} MB`
        : `${(bytes / 1024 ** 3).toFixed(2)} GB`;

/**
 * The folders of the run's artifacts (`runArtifacts`, one folder per step under it) a step is filed with, each read-only: the folder of
 * every step of `steps` it comes after, through `after:` and on (`upstreamOf`), in `steps`' order. It reads what they handed over and
 * writes none of it, whatever its fence. Its own folder is left out, writable as its workspace's mode makes it, and so is every step it
 * does not come after: a sibling, a step after it. None on a harness fenced by a sandbox, which reads the disk already, nor on a remote
 * agent, filed no local field.
 */
export const handedMounts = (step: Pick<Workflow, 'name' | 'harness'>, steps: readonly Workflow[], runArtifacts: string): Mount[] => {
  if (isRemoteHarness(step.harness) || sandboxed(step.harness ?? DEFAULT_HARNESS)) return [];
  const upstream = upstreamOf(steps, step.name);
  return steps.filter((s) => upstream.has(s.name)).map((s) => ({ path: path.join(runArtifacts, s.name), readOnly: true }));
};

/**
 * The steps whose closeout's files a pass reads off the disk now (`filesLacked` in artifacts.store.ts), each task once: a step on a
 * local harness whose task reads `succeeded`, whose closeout names a file, and whose record does not say that task was read
 * (`StepRecord.filesRead`), which the pass that reads it writes whether or not a file lacked. So a file a check, a gate's wait or a
 * later step removes after the closeout was accepted unsigns nothing, of a task held open as of one settled. Nor is a task read that
 * signed under a tick that read no files: one whose settle the run has counted (`Run.settlesCounted`), any of a record that counts no
 * settle, and one whose check is filed already. None of a pruned run, whose files may be gone.
 */
export function filesDue(
  steps: readonly Workflow[],
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => { artifacts: readonly string[] } | undefined,
): string[] {
  const counted = run.settlesCounted;
  if (run.pruned || !counted) return [];
  return steps
    .filter((step) => !isRemoteHarness(step.harness))
    .filter(({ name }) => {
      const record = run.steps[name];
      const taskId = record?.taskId;
      if (!taskId || counted.includes(taskId) || record.check || record.filesRead?.taskId === taskId) return false;
      return phaseOf(taskId) === 'succeeded' && Boolean(closeoutOf(name)?.artifacts.length);
    })
    .map(({ name }) => name);
}
