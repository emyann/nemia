/**
 * A factory's file written by a release before one list, read into one list (agent-orchestrator, src/factory/from-repos/from-repos.ts,
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

/** The repositories the file names, none where it names none. */
const reposOf = (file: FormerKeys) => file.repos ?? [];

/** The former volumes, none where the file names none. */
const formerOf = (file: FormerKeys) => file.volumes ?? [];

/** Whether `xs` names each of its strings once. */
const distinct = (xs: readonly string[]) => xs.every((x, i) => !xs.slice(0, i).includes(x));

const volumesFromReposSpec = spec<(file: FormerKeys) => readonly FileVolume[]>({
  requires: ({ input: [file] }) => {
    const repos = file.repos ?? [];
    const paths = formerOf(file).map((v) => v.path);
    return distinct(repos) && distinct(paths) && !paths.some((p) => repos.includes(p));
  },
  /**
   * Narrowed to what tsverify proves today, as `shared-lines.contract.ts` is. That each repository leads, writable and in its order, with
   * its URL as its origin; that each volume the file held follows, at its path and under its name, read-only in a file written before
   * one list and as it was in one written after: each runs out of the solver's work through the two `map`s the function is and the list
   * they join (tsverify leaves each `bounded`, with no counterexample up to four elements), so they are held whole by
   * `src/factory/from-repos/from-repos.test.ts`, a row per law, until the verifier reads them here.
   */
  ensures: {
    nothingAdded: {
      description: 'The factory reaches no folder it did not reach before: one volume for each repository and each volume it held',
      condition: ({ input: [file], output }) => output.length === reposOf(file).length + formerOf(file).length,
    },
  },
});

/** `volumesFromRepos`'s type, which src/factory/from-repos/from-repos.ts takes. */
export type VolumesFromRepos = Implementation<typeof volumesFromReposSpec>;
