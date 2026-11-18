/**
 * A factory's file written by a release before one list, read into one list (agent-orchestrator, src/factory/volume/from-repos.ts,
 * `volumesFromRepos`): the repositories it worked on (`repos`), each with the git URL it was cloned from where it was given by one
 * (`origins`, by its path), and its extra folders (`volumes`), each read-only or writable. A factory's record then has `volumes` alone: a
 * repository it worked on is a writable volume, in the order it was filed, so its first repository is still its first writable volume
 * (where its instruction is read) and its only one still its only one; its URL is the volume's `origin`; an extra folder is kept by its
 * path and its name, read-only, since a writable volume is now one a run works on and an extra folder never was.
 *
 * A file already in one list (no `repos`) is answered as it is: the daemon's move at its start runs over every file, and a file it moved
 * before, or one this release wrote, is not moved again. The same reading moves a factory's archive written by an earlier release at an
 * import. Pure: the caller reads the file, hands its three keys, and writes the answer under `volumes` with `repos` and `origins` taken
 * out and every other key kept.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A volume as a factory's file holds it: its path, whether steps only read it, its name where one is stored, its git URL where cloned. */
export type FileVolume = {
  readonly path: string;
  readonly readOnly: boolean;
  readonly name?: string;
  readonly origin?: string;
};

/** The keys of a factory's file the move reads: its repositories and their URLs where it predates one list, and its volumes. */
export type FormerKeys = {
  readonly repos?: readonly string[];
  readonly origins?: Readonly<Record<string, string>>;
  readonly volumes?: readonly FileVolume[];
};

/** The URL `origins` holds for `at`, where it holds one of its own: a prototype's name (`constructor`) is none. */
const originOf = (origins: Readonly<Record<string, string>> | undefined, at: string): string | undefined =>
  origins !== undefined && Object.hasOwn(origins, at) ? origins[at] : undefined;

/** The former volumes, none where the file names none. */
const formerOf = (file: FormerKeys): readonly FileVolume[] => file.volumes ?? [];

/** Whether `xs` names each of its strings once. */
const distinct = (xs: readonly string[]): boolean => xs.every((x, i) => xs.indexOf(x) === i);

const volumesFromReposSpec = spec<(file: FormerKeys) => readonly FileVolume[]>({
  requires: ({ input: [file] }) => {
    const repos = file.repos ?? [];
    const paths = formerOf(file).map((v) => v.path);
    return distinct(repos) && distinct(paths) && !paths.some((p) => repos.includes(p));
  },
  ensures: {
    reposLeadInOrder: {
      description: 'Each repository the factory worked on is a writable volume, first and in the order it was filed',
      condition: ({ input: [file], output }) =>
        (file.repos ?? []).every((r, i) => output[i] !== undefined && output[i].path === r && !output[i].readOnly),
    },
    originCarried: {
      description: "A repository given by a git URL keeps that URL as its volume's origin, and one given by a path has none",
      condition: ({ input: [file], output }) =>
        (file.repos ?? []).every((r, i) => output[i] !== undefined && output[i].origin === originOf(file.origins, r)),
    },
    formerKeptByPathAndName: {
      description: 'Each volume the file held is kept, at its path and under the name it stored',
      condition: ({ input: [file], output }) =>
        formerOf(file).every((v) => output.some((o) => o.path === v.path && o.name === v.name)),
    },
    formerFoldersReadOnly: {
      description: 'In a file written before one list, every extra folder is read-only after the move: none becomes one a run works on',
      condition: ({ input: [file], output }) =>
        file.repos === undefined || formerOf(file).every((v) => output.some((o) => o.path === v.path && o.readOnly)),
    },
    movedFileAsItIs: {
      description: 'A file already in one list is answered as it is, each volume with its path, its mode, its name and its origin',
      condition: ({ input: [file], output }) =>
        file.repos !== undefined ||
        (output.length === formerOf(file).length &&
          formerOf(file).every(
            (v, i) =>
              output[i] !== undefined &&
              output[i].path === v.path &&
              output[i].readOnly === v.readOnly &&
              output[i].name === v.name &&
              output[i].origin === v.origin,
          )),
    },
    nothingAdded: {
      description: 'The factory reaches no folder it did not reach before: one volume for each repository and each volume it held',
      condition: ({ input: [file], output }) =>
        output.length === (file.repos ?? []).length + formerOf(file).length &&
        output.every((o) => (file.repos ?? []).includes(o.path) || formerOf(file).some((v) => v.path === o.path)),
    },
  },
});

/** `volumesFromRepos`'s type, which src/factory/volume/from-repos.ts takes. */
export type VolumesFromRepos = Implementation<typeof volumesFromReposSpec>;
