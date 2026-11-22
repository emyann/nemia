/**
 * What the design system's producer (`tools/design-system`) decides from what it is handed: whether a story of the board makes a card,
 * whether a card it drew is in trouble, whether a build passed a cap of the artifact, and which files changed against the last build,
 * so a person's session publishes only those. Each decision is a pure function over facts the build gathered; the browser and the
 * files are the build's.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import { FILES_CAP, LEAST_DRAWN, MOST_COVERED, SCRIPT_CAP, STYLESHEET_CAP } from '../src/limits.ts';

/**
 * What the producer does with a story, read from the story's module before anything is drawn: drawn in a card (`card`), left out
 * because it reads the api (`network`) or opens a layer over the whole window at rest (`overlay`), each said by a Storybook tag of
 * the same word, or refused (`undeclared`) because it answers the api through MSW handlers and does not say so.
 */
export type StoryFate = 'card' | 'network' | 'overlay' | 'undeclared';

/**
 * A story as its module declares it: its tags, the story's and its meta's merged as Storybook merges them, and whether its parameters
 * name MSW handlers.
 */
export type StoryDeclared = { readonly tags: readonly string[]; readonly msw: boolean };

/** The tag a story that reads the api carries. */
const NETWORK = 'network';

/** The tag a story that opens a layer over the whole window at rest carries. */
const OVERLAY = 'overlay';

/** Whether `tags` holds `tag`. */
const tagged = (tags: readonly string[], tag: string) => tags.includes(tag);

const storyFateSpec = spec<(story: StoryDeclared) => StoryFate>({
  ensures: {
    networkLeftOut: {
      description: 'A story tagged network is left out of the cards, whatever else it says',
      condition: ({ input: [story], output }) => (tagged(story.tags, NETWORK) ? output === 'network' : true),
    },
    overlayLeftOut: {
      description: 'A story tagged overlay and not network is left out as an overlay',
      condition: ({ input: [story], output }) =>
        !tagged(story.tags, NETWORK) && tagged(story.tags, OVERLAY) ? output === 'overlay' : true,
    },
    handlersMustBeSaid: {
      description: 'A story that names MSW handlers and carries neither tag is refused, so the network is said in one place, the tag',
      condition: ({ input: [story], output }) =>
        story.msw && !tagged(story.tags, NETWORK) && !tagged(story.tags, OVERLAY) ? output === 'undeclared' : true,
    },
    plainStoryDrawn: {
      description: 'A story with neither tag and no MSW handlers is drawn in a card',
      condition: ({ input: [story], output }) =>
        !story.msw && !tagged(story.tags, NETWORK) && !tagged(story.tags, OVERLAY) ? output === 'card' : true,
    },
  },
});
export type StoryFateOf = Implementation<typeof storyFateSpec>;

/** Why a story drawn in a card fails the build, the first that holds in this order. */
export type CellFault = 'threw' | 'draws-nothing' | 'covers-card' | 'waits-on-network' | 'api-picture';

/**
 * A story as its cell drew it in a card, in the first theme, after the faces loaded: what it threw (null for nothing), how tall what it
 * drew is in pixels, the share of the card's frame a fixed layer covers (0 to 1), how many requests it made (the runner answers none),
 * whether it shows a waiting state (the kit's skeleton, or the words `Reading…` or `reading`), and whether a picture of it has an
 * address of the api as its source.
 */
export type CellDrawn = {
  readonly threw: string | null;
  readonly height: number;
  readonly covered: number;
  readonly asked: number;
  readonly waiting: boolean;
  readonly apiPicture: boolean;
};

/** Whether a cell that did not throw drew something. */
const drew = (cell: CellDrawn) => cell.threw === null && cell.height >= LEAST_DRAWN;

/** Whether a cell that drew something lies within the share a fixed layer may cover. */
const uncovered = (cell: CellDrawn) => drew(cell) && cell.covered <= MOST_COVERED;

const cellFaultSpec = spec<(cell: CellDrawn) => CellFault | null>({
  requires: ({ input: [cell] }) =>
    Number.isFinite(cell.height) &&
    cell.height >= 0 &&
    cell.covered >= 0 &&
    cell.covered <= 1 &&
    Number.isInteger(cell.asked) &&
    cell.asked >= 0,
  ensures: {
    throwingFails: {
      description: 'A story that threw fails the build as one that threw',
      condition: ({ input: [cell], output }) => (cell.threw !== null ? output === 'threw' : true),
    },
    emptyFails: {
      description: 'A story that threw nothing and drew under the least height fails as one that draws nothing',
      condition: ({ input: [cell], output }) => (cell.threw === null && cell.height < LEAST_DRAWN ? output === 'draws-nothing' : true),
    },
    coveringFails: {
      description: 'A story that drew and covers more of the card than the share allowed fails as one that covers the card',
      condition: ({ input: [cell], output }) => (drew(cell) && cell.covered > MOST_COVERED ? output === 'covers-card' : true),
    },
    waitingOnTheApiFails: {
      description: 'A story that drew, asked the api, and shows a waiting state fails as one that waits on the network',
      condition: ({ input: [cell], output }) => (uncovered(cell) && cell.asked > 0 && cell.waiting ? output === 'waits-on-network' : true),
    },
    apiPictureFails: {
      description: 'A story that drew no waiting state for a request but shows a picture the api serves fails as one that needs the api',
      condition: ({ input: [cell], output }) =>
        uncovered(cell) && !(cell.asked > 0 && cell.waiting) && cell.apiPicture ? output === 'api-picture' : true,
    },
    askedButDrawnPasses: {
      description: 'A story that drew its state, asked the api in passing, waits on nothing and shows no picture of the api passes',
      condition: ({ input: [cell], output }) => (uncovered(cell) && !cell.waiting && !cell.apiPicture ? output === null : true),
    },
    ownSkeletonPasses: {
      description: 'A story that asked nothing passes though it draws a skeleton: the look draws one on purpose',
      condition: ({ input: [cell], output }) => (uncovered(cell) && cell.asked === 0 && !cell.apiPicture ? output === null : true),
    },
  },
});
export type CellFaultOf = Implementation<typeof cellFaultSpec>;

/** A cap of the artifact type a build may pass. */
export type Cap = 'script' | 'stylesheet' | 'files';

/** What a build measures against the caps: the script's bytes, the stylesheet's bytes and how many files it holds. */
export type Measured = { readonly scriptBytes: number; readonly stylesheetBytes: number; readonly files: number };

const capsPassedSpec = spec<(measured: Measured) => readonly Cap[]>({
  requires: ({ input: [m] }) =>
    Number.isInteger(m.scriptBytes) &&
    m.scriptBytes >= 0 &&
    Number.isInteger(m.stylesheetBytes) &&
    m.stylesheetBytes >= 0 &&
    Number.isInteger(m.files) &&
    m.files >= 0,
  ensures: {
    scriptOverExactly: {
      description: "The script's cap is named exactly when the script holds more bytes than it",
      condition: ({ input: [m], output }) => output.includes('script') === m.scriptBytes > SCRIPT_CAP,
    },
    stylesheetOverExactly: {
      description: "The stylesheet's cap is named exactly when the stylesheet holds more bytes than it",
      condition: ({ input: [m], output }) => output.includes('stylesheet') === m.stylesheetBytes > STYLESHEET_CAP,
    },
    filesOverExactly: {
      description: 'The count of files is named exactly when the build holds more files than the type takes',
      condition: ({ input: [m], output }) => output.includes('files') === m.files > FILES_CAP,
    },
  },
});
export type CapsPassed = Implementation<typeof capsPassedSpec>;

/** What became of one path between the last build and this one. */
export type FileChange = 'added' | 'changed' | 'removed' | 'same';

/**
 * One path's content hash in the last build and in this one, each undefined where that build holds no file at the path; the fold over
 * every path of both manifests (`changesSince`) is held by the producer's tests, a law over a fold being one the solver runs out of
 * work on (`apps/web/contracts/baseline-shard.contract.ts`).
 */
const fileChangeSpec = spec<(before: string | undefined, after: string | undefined) => FileChange>({
  requires: ({ input: [before, after] }) => before !== undefined || after !== undefined,
  ensures: {
    newIsAdded: {
      description: 'A path only this build holds is added',
      condition: ({ input: [before, after], output }) => (before === undefined && after !== undefined ? output === 'added' : true),
    },
    goneIsRemoved: {
      description: 'A path only the last build held is removed',
      condition: ({ input: [before, after], output }) => (before !== undefined && after === undefined ? output === 'removed' : true),
    },
    otherBytesChanged: {
      description: 'A path both builds hold with other content is changed',
      condition: ({ input: [before, after], output }) =>
        before !== undefined && after !== undefined && before !== after ? output === 'changed' : true,
    },
    sameBytesUnsent: {
      description: 'A path both builds hold with the same content is the same, and a session sends it not',
      condition: ({ input: [before, after], output }) => (before !== undefined && before === after ? output === 'same' : true),
    },
  },
});
export type FileChangeOf = Implementation<typeof fileChangeSpec>;
