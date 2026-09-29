/**
 * Files a step leaves for the steps after it and for the person who decides: what its brief says of them (`artifactsContract`), where a
 * file it names is found (`artifactPlace`), and the lines that list them (`artifactLines`). Pure: the root's `artifacts.ts` copies them.
 */
import path from 'node:path';
import { filesPrunedWords, type Pruned } from '../record/record.ts';

/**
 * Where a step's files go, told on its brief beside the closeout contract.
 *
 * A file a step writes into its workspace is committed by the hand-off and rides the branch — a
 * screenshot, under the step's name, into what ships — and a gitignored one never reaches the next
 * step's worktree at all. So the run makes a directory per step, beside the run's record and outside
 * every workspace (`artifactsDir` in record.store.ts), and says where it is. Mechanism, like the closeout: a
 * step does not have to find somewhere, and a workflow author does not have to remember to say where.
 *
 * Both ways are said, because not every step can use the first: Codex in `workspace-write` writes only its
 * worktree, and the engine gives it no other directory. A file named from the workspace root is collected into
 * the directory at hand-off, before the check (`collectArtifacts` in artifacts.ts), so such a step hands it over too.
 *
 * `inMain` for a step that works in the repository's own checkout (`workspace: main`): there the second way is
 * false and does harm. The run hands nothing off in a person's checkout (`handOffDue`), so nothing is collected
 * and nothing is committed — a file left there stays in their checkout for ever, and the next run's ending step
 * reads `git status --porcelain` as dirty and stops. Such a step has no check to be given `WF_ARTIFACTS` either,
 * since `workspace: main` refuses one, and nothing follows it to read what it wrote. So it is told the one way.
 *
 * `inFolder` for a step of a folder run (`workspace: folder`): there the *first* way is the one that does harm. Such a step runs in
 * `dontAsk` (`validateFolderMode` in workflow/validate.ts), fenced to its own folder, and that directory sits beside the folder, outside the
 * fence: told to put a file there, the session is denied. The second way needs nothing outside the fence and hands the file over all
 * the same. So it too is told one way, and neither mentions a branch, since a folder run has none.
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
          "not collected and not committed — it stays in a person's checkout, and `wf decide` reads a path named from",
          'the workspace root as `not collected`. Name each file by its absolute path in that directory; a directory is',
          'not collected, nor a file that is not there.',
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
        ]
  ).join('\n');

/**
 * Where a declared artifact is looked for. Pure: it reads the path, never the disk.
 *
 *   workspace  a path from the workspace root — collected from the workspace into the step's files directory
 *              when the step hands off (`collectArtifacts` in artifacts.ts), and read from there
 *   files      an absolute path inside the step's files directory — on disk, where the run keeps it
 *   escapes    a path from the workspace root that climbs out of it, `../notes.md` — refused, and never read
 *   outside    any other absolute path — refused. A closeout is an agent's text, and the run does not
 *              look at a file on this machine because a step named it. `..` is resolved first, so a path
 *              that climbs out of the directory is outside however it is spelled.
 */
export type ArtifactPlace = 'workspace' | 'files' | 'escapes' | 'outside';

/** Where a declared artifact is looked for (`ArtifactPlace`). Pure. The files directory itself is no file in it, and is `outside`. */
export function artifactPlace(file: string, dir: string): ArtifactPlace {
  if (!path.isAbsolute(file)) {
    const rel = path.normalize(file);
    return rel === '..' || rel.startsWith(`..${path.sep}`) ? 'escapes' : 'workspace';
  }
  const within = path.relative(path.resolve(dir), path.resolve(file));
  return within && within !== '..' && !within.startsWith(`..${path.sep}`) && !path.isAbsolute(within) ? 'files' : 'outside';
}

/** A file in a step's files directory, by absolute path, and its size. */
export type ArtifactFile = { path: string; bytes: number };

/**
 * A declared artifact the run does not have, and why (`missingArtifacts` in artifacts.ts):
 *
 *   not there      a path from the workspace root with nothing at it, nor on the branch
 *   directory      a path from the workspace root that is a directory: not collected, since a step names each file
 *   not collected  a file in the workspace that is not in the step's files directory, and whose copy something in that directory refused
 *                  — or that is on no branch either: git ignores it, and its step has not handed off
 *   missing        an absolute path in the step's files directory that is not a file there
 *   escapes        a path that climbs out of the workspace, as written or through a link in it: refused, and not read
 *   outside        an absolute path outside the step's files directory: refused, and not read
 */
export type MissingArtifact = { path: string; why: 'not there' | 'directory' | 'not collected' | 'missing' | 'escapes' | 'outside' };

/**
 * What `wf decide` prints about a step's files, after its closeout: each declared file the run does not have, told apart by why —
 * a refusal is named as one, never passed over — and then every file in the step's directory, collected or written there, with its size.
 *
 * With its files removed by `wf prune --artifacts`, a file the directory does not have, and one named from a workspace also gone, is
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
    ...(gone.length ? [`!! not kept: ${gone.join(', ')}  — ${filesPrunedWords(filesGone!)}`] : []),
    ...(filesGone
      ? []
      : line('not there', (names) =>
          pruned
            ? `!! declared and not collected: ${names}  — on no branch, and its worktree was removed by wf prune at ${pruned.at}`
            : `!! declared but not in the workspace: ${names}  — nothing to collect`,
        )),
    ...line('directory', (names) => `!! declared a directory, not collected: ${names}  — a step names each file`),
    ...line('not collected', (names) => `!! declared and not collected: ${names}  — in the workspace, and not in ${dir}`),
    ...(filesGone ? [] : line('missing', (names) => `!! declared but not in ${dir}: ${names}`)),
    ...line(
      'escapes',
      (names) => `!! declared outside the workspace, and not read: ${names}  — name a file from the workspace root, or put it in ${dir}`,
    ),
    ...line('outside', (names) => `!! declared outside ${dir}, and not read: ${names}  — a step's files go in its own directory`),
    ...(files.length ? ['files:', ...files.map((f) => `  ${f.path}  ${sizeOf(f.bytes)}`)] : []),
  ];
}

/** Bytes, as a person reads them. */
export const sizeOf = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 ** 2
      ? `${(bytes / 1024).toFixed(1)} KB`
      : bytes < 1024 ** 3
        ? `${(bytes / 1024 ** 2).toFixed(1)} MB`
        : `${(bytes / 1024 ** 3).toFixed(2)} GB`;
