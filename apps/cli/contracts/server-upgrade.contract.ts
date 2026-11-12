/**
 * `nemia server upgrade [<tag> | --back]` (apps/cli, src/server/upgraded.ts): the server a context names upgraded through its api
 * (`POST /api/upgrades`), as the board's Settings and the MCP port's `upgrade` tool upgrade it, never this machine's install, which is
 * `nemia upgrade`'s. Two decisions, each pure, the runner around them doing the reads, the start and the follow.
 *
 * `upgradeTarget`: the release asked for — the tag typed, as typed; with `--back`, the release going back goes to (`GET /api/upgrades`'
 * `previous`), as the board's Back takes it, refused where none older is installed or the store's floor refuses it; with neither, the
 * newer release the server's own release check read (`GET /api/version`'s `latest`), or nothing to do where the server runs the newest,
 * or refused where the server has read no newest release to name (its check off, a checkout), since then the tag has to be typed.
 *
 * `upgradeEnd`: what an upgrade that ended means here — exit 0 exactly where it succeeded — and whether this nemia is now of another
 * release than the server, which a client and a daemon of two releases cannot talk across (`release.contract.ts`), so the runner names
 * the machine verb that brings this machine level (`nemia upgrade <tag>`).
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { UpgradePhase } from 'objects';

/** What was typed: the tag (null where none was) and whether `--back` was. */
export type ServerUpgradeAsked = { readonly tag: string | null; readonly back: boolean };

/**
 * What the server answered of its releases: the newest release its check read (`latest`, null where `GET /api/version` carries none),
 * whether it is newer than the one it runs and its tag (null where it names none); and the release going back goes to (`previous`, null
 * where none older is installed), whether the store's floor refuses it.
 */
export type ServerUpgradeRead = {
  readonly latest: { readonly newer: boolean; readonly tag: string | null } | null;
  readonly previous: { readonly tag: string; readonly refused: boolean } | null;
};

/**
 * Why no release is asked for: a tag typed with `--back`; `--back` with none older installed; `--back` past the store's floor; nothing
 * typed and no newer release the server can name.
 */
export type UpgradeTargetRefusal = 'tag-and-back' | 'none-older' | 'below-floor' | 'unknown-latest';

/** The release to ask the server for, nothing to do (it runs the newest), or a refusal and its reason. */
export type UpgradeTarget =
  | { readonly kind: 'tag'; readonly tag: string }
  | { readonly kind: 'newest' }
  | { readonly kind: 'refused'; readonly reason: UpgradeTargetRefusal };

/** Whether `output` asks for exactly `tag`. */
const asks = (output: UpgradeTarget, tag: string): boolean => output.kind === 'tag' && output.tag === tag;

/** Whether `output` is refused for `reason`. */
const refusedFor = (output: UpgradeTarget, reason: UpgradeTargetRefusal): boolean =>
  output.kind === 'refused' && output.reason === reason;

/** Nothing was typed but the verb: the newest release the server read is the one asked for. */
const bare = (asked: ServerUpgradeAsked): boolean => asked.tag === null && !asked.back;

/** `--back` alone was typed. */
const backAlone = (asked: ServerUpgradeAsked): boolean => asked.tag === null && asked.back;

const upgradeTargetSpec = spec<(asked: ServerUpgradeAsked, read: ServerUpgradeRead) => UpgradeTarget>({
  ensures: {
    aTypedTagIsAskedAsTyped: {
      description: 'A tag typed without --back is the release asked for, exactly as typed, whatever the server reads of its releases',
      condition: ({ input: [asked], output }) => asked.tag === null || asked.back || asks(output, asked.tag),
    },
    aTagAndBackAreRefusedTogether: {
      description: 'A tag typed with --back is refused, naming the two forms: back goes to the release the server says, never a tag',
      condition: ({ input: [asked], output }) => refusedFor(output, 'tag-and-back') === (asked.tag !== null && asked.back),
    },
    backGoesToThePreviousRelease: {
      description: 'Back asks for the release going back goes to where one older is installed and the floor lets the server go to it',
      condition: ({ input: [asked, read], output }) =>
        !backAlone(asked) || read.previous === null || read.previous.refused || asks(output, read.previous.tag),
    },
    backWithNoneOlderIsRefused: {
      description: 'Back is refused where no release older than the one the server runs is installed there',
      condition: ({ input: [asked, read], output }) =>
        refusedFor(output, 'none-older') === (backAlone(asked) && read.previous === null),
    },
    backPastTheFloorIsRefused: {
      description: 'Back is refused where the store has been run by a release the previous one cannot read, as the board shows Back refused',
      condition: ({ input: [asked, read], output }) =>
        refusedFor(output, 'below-floor') === (backAlone(asked) && read.previous !== null && read.previous.refused),
    },
    bareAsksForTheNewerRelease: {
      description: 'With nothing typed, the newer release the server read is asked for, by the tag it names',
      condition: ({ input: [asked, read], output }) =>
        !bare(asked) || read.latest === null || !read.latest.newer || read.latest.tag === null || asks(output, read.latest.tag),
    },
    nothingToDoOnTheNewest: {
      description: 'With nothing typed, there is nothing to do exactly where the server read a newest release and runs it',
      condition: ({ input: [asked, read], output }) =>
        (output.kind === 'newest') === (bare(asked) && read.latest !== null && !read.latest.newer),
    },
    anUnknownNewestIsRefused: {
      description: 'With nothing typed, it is refused where the server names no newer release to go to, so the tag is to be typed',
      condition: ({ input: [asked, read], output }) =>
        refusedFor(output, 'unknown-latest') ===
          (bare(asked) && (read.latest === null || (read.latest.newer && read.latest.tag === null))),
    },
  },
});

/** `upgradeTarget`'s type, which src/server/upgraded.ts takes. */
export type UpgradeTargetOf = Implementation<typeof upgradeTargetSpec>;

/** What an ended upgrade means here: the exit code, and whether this nemia is now of another release than the server. */
export type UpgradeEnd = { readonly code: 0 | 1; readonly behind: boolean };

const upgradeEndSpec = spec<(phase: UpgradePhase, client: string | null, server: string | null) => UpgradeEnd>({
  ensures: {
    zeroExactlyWhenItSucceeded: {
      description: 'The verb exits 0 exactly where the upgrade succeeded: a failed one, or one still at work when the follow gave up, exits 1',
      condition: ({ input: [phase], output }) => (output.code === 0) === (phase === 'succeeded'),
    },
    behindExactlyWhenTheReleasesDiffer: {
      description:
        'This machine is said to be behind exactly where the upgrade succeeded and this nemia and the server both say a release and they differ',
      condition: ({ input: [phase, client, server], output }) =>
        output.behind === (phase === 'succeeded' && client !== null && server !== null && client !== server),
    },
  },
});

/** `upgradeEnd`'s type, which src/server/upgraded.ts takes. */
export type UpgradeEndOf = Implementation<typeof upgradeEndSpec>;
