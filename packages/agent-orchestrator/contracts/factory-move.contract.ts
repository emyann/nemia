/**
 * A factory moved to another store (agent-orchestrator, src/factory/move/move.ts): what the target makes of each repository and each
 * volume the source's factory names, before anything is written there. Runs do not move; the factory's file, its folder and its cards do.
 *
 * A repository (`repoOnTarget`) is given to the target as `nemia factory add --repo` would be given it, a git URL that the target clones
 * under its own store or a folder of the target's machine by its whole path (`factoryRepos` then reads that value): the one the person
 * typed for it (`--repo <source folder>=<url|path>`) over every other, else the URL the source recorded as its origin, so a clone
 * follows its origin. A repository with neither, a folder of the source's machine that names no URL, is refused, naming the flag that
 * gives it one: the source's path means nothing on the target's machine.
 *
 * A volume (`volumeOnTarget`) is a folder of the target's machine: the one the person typed for it (`--volume <name>=<path>`), else the
 * same path as on the source, each judged on the target as `nemia factory volume add` judges one (`volumeRefusal`, handed in as
 * `refusal`, the judgement of the path chosen). A judged path is refused, saying why and naming the flag that gives another: a volume is
 * never mounted where the target refuses it, nor dropped in silence.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What the target is given of one repository of the factory: a `--repo` value, or why none. */
export type RepoOnTarget = { readonly kind: 'given'; readonly repo: string } | { readonly kind: 'refused'; readonly message: string };

/** Where the target mounts one volume of the factory: a path of its machine, or why none. */
export type VolumeOnTarget = { readonly kind: 'mounted'; readonly path: string } | { readonly kind: 'refused'; readonly message: string };

/** A volume of the source's factory as the move reads it: its name, which the person types, and its path on the source. */
export type MovedVolume = { readonly name: string; readonly path: string };

/** The flag that gives the repository `source` its value on the target, as a refusal names it. */
const repoFlag = (source: string): string => '--repo ' + source + '=';

/** The flag that gives the volume `name` its path on the target, as a refusal names it. */
const volumeFlag = (name: string): string => '--volume ' + name + '=';

/** Whether `text`, an optional word, is absent or holds something. */
const absentOrSaid = (text: string | undefined): boolean => text === undefined || text.length > 0;

const repoOnTargetSpec = spec<(source: string, origin: string | undefined, typed: string | undefined) => RepoOnTarget>({
  requires: ({ input: [source, origin, typed] }) => source.length > 0 && absentOrSaid(origin) && absentOrSaid(typed),
  ensures: {
    typedWins: {
      description: 'What the person typed for a repository is what the target is given, over the origin the source recorded',
      condition: ({ input: [, , typed], output }) => typed === undefined || (output.kind === 'given' && output.repo === typed),
    },
    cloneFollowsItsOrigin: {
      description: 'A repository the person typed nothing for is given by the URL the source recorded as its origin',
      condition: ({ input: [, origin, typed], output }) =>
        typed !== undefined || origin === undefined || (output.kind === 'given' && output.repo === origin),
    },
    folderWithoutOriginRefused: {
      description: "A folder of the source's machine that names no URL, and that the person typed nothing for, is refused",
      condition: ({ input: [, origin, typed], output }) => typed !== undefined || origin !== undefined || output.kind === 'refused',
    },
    refusalNamesTheFlag: {
      description: 'A refused repository names the flag that gives it a URL or a path on the target',
      condition: ({ input: [source], output }) => output.kind !== 'refused' || output.message.includes(repoFlag(source)),
    },
  },
});

/** `repoOnTarget`'s type, which `src/factory/move/move.ts` takes. */
export type RepoOnTargetOf = Implementation<typeof repoOnTargetSpec>;

const volumeOnTargetSpec = spec<(volume: MovedVolume, typed: string | undefined, refusal: string | undefined) => VolumeOnTarget>({
  requires: ({ input: [volume, typed, refusal] }) =>
    volume.name.length > 0 && volume.path.length > 0 && absentOrSaid(typed) && absentOrSaid(refusal),
  ensures: {
    typedPathMounted: {
      description: 'A volume the person typed a path for is mounted there, where the target takes that path',
      condition: ({ input: [, typed, refusal], output }) =>
        typed === undefined || refusal !== undefined || (output.kind === 'mounted' && output.path === typed),
    },
    keptWhereItStands: {
      description: 'A volume the person typed nothing for keeps its path, where the target takes the same path',
      condition: ({ input: [volume, typed, refusal], output }) =>
        typed !== undefined || refusal !== undefined || (output.kind === 'mounted' && output.path === volume.path),
    },
    judgedPathRefused: {
      description: 'A volume whose path the target refuses is refused, never mounted there nor dropped',
      condition: ({ input: [, , refusal], output }) => refusal === undefined || output.kind === 'refused',
    },
    refusalSaysWhy: {
      description: "A refused volume says the target's reason",
      condition: ({ input: [, , refusal], output }) => output.kind !== 'refused' || (refusal !== undefined && output.message.includes(refusal)),
    },
    refusalNamesTheFlag: {
      description: 'A refused volume names the flag that gives it another path on the target',
      condition: ({ input: [volume], output }) => output.kind !== 'refused' || output.message.includes(volumeFlag(volume.name)),
    },
  },
});

/** `volumeOnTarget`'s type, which `src/factory/move/move.ts` takes. */
export type VolumeOnTargetOf = Implementation<typeof volumeOnTargetSpec>;
