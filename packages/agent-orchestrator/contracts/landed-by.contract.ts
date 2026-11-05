/**
 * The commit that brought a run's result onto its base (agent-orchestrator, place/git/landed.ts): `cameOnto`, where one result
 * branch's tip came onto the line the base follows by first parents, read off git's walk of that line down to the tip
 * (`git rev-list --first-parent --ancestry-path --parents <tip>..HEAD`), and `landedBy`, the first commit of that line that
 * holds every tip asked of. What the git place's `status` answers as `landedBy`, and what a landing records (`landingDue`):
 * never the base's newest commit once another landing has moved it.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/**
 * One commit of the walk, newest first: its id, then its parents, its first parent first. A row with no parent never comes: the
 * walk lists only commits that descend from the tip, and a root commit descends from none.
 */
export type WalkRow = readonly string[];

/** Where a tip came onto the base's line: the commit that brought it, and how many first parents it is below the line's newest. */
export type OnTheLine = { readonly commit: string; readonly below: number };

/** The walk's oldest row: the commit of the line nearest the tip, whose first parent is the tip itself or the base before it. */
const oldest = (walk: readonly WalkRow[]): WalkRow | undefined => walk.at(-1);

const cameOntoSpec = spec<(tip: string, head: string, walk: readonly WalkRow[]) => OnTheLine | undefined>({
  /**
   * git answers the walk newest first, from `head` down, and lists each commit with at least its first parent (`--parents`; see
   * `WalkRow`).
   */
  requires: ({ input: [, head, walk] }) =>
    walk.every((row) => row.length >= 2) && (walk.length === 0 || walk[0]?.[0] === head),
  ensures: {
    theLinesNewestIsItsOwn: {
      description: 'A tip that is the line’s newest commit came onto it as itself, nothing above it',
      condition: ({ input: [tip, head, walk], output }) =>
        walk.length !== 0 || tip !== head || (output?.commit === tip && output.below === 0),
    },
    notOnTheLine: {
      description: 'A tip no commit of the line descends from, and that is not the line’s newest, never came onto it',
      condition: ({ input: [tip, head, walk], output }) => walk.length !== 0 || tip === head || output === undefined,
    },
    aFastForwardBringsTheTipItself: {
      description:
        'Where the commit of the line nearest the tip has the tip as its first parent, the tip itself is on the line: it came on as itself, a fast-forward, under every commit of the walk',
      condition: ({ input: [tip, , walk], output }) =>
        oldest(walk)?.[1] !== tip || (output?.commit === tip && output.below === walk.length),
    },
    aMergeBringsItIn: {
      description:
        'Where the commit of the line nearest the tip has another first parent, that commit merged it in: the first of the line to hold it, however many landed on top since',
      condition: ({ input: [tip, , walk], output }) => {
        const first = oldest(walk);
        return first === undefined || first[1] === tip || (output !== undefined && output.commit === first[0] && output.below === walk.length - 1);
      },
    },
  },
});

/** `cameOnto`'s type, which the code takes: it then imports nothing of tsverify. */
export type CameOnto = Implementation<typeof cameOntoSpec>;

const landedBySpec = spec<(points: readonly (OnTheLine | undefined)[]) => string | undefined>({
  ensures: {
    nothingAskedNothingLanded: {
      description: 'With no tip asked of, no commit is said to have brought the result in',
      condition: ({ input: [points], output }) => points.length !== 0 || output === undefined,
    },
    aTipOffTheLineLandsNothing: {
      description: 'Where one tip is not on the line, nothing holds the whole result: no commit is said to have landed it',
      condition: ({ input: [points], output }) => points.every((p) => p !== undefined) || output === undefined,
    },
    theFirstToHoldThemAll: {
      description:
        'Where every tip is on the line, the result landed by the newest of the commits that brought them: the first of the line to hold them all',
      condition: ({ input: [points], output }) =>
        points.length === 0 ||
        !points.every((p) => p !== undefined) ||
        points.some((p) => p !== undefined && p.commit === output && points.every((q) => q === undefined || p.below <= q.below)),
    },
  },
});

/** `landedBy`'s type, which the code takes: it then imports nothing of tsverify. */
export type LandedBy = Implementation<typeof landedBySpec>;
