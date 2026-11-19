/**
 * Which of the board's stories a change touches, and which changed part has none (apps/web, test/e2e/stories/touched.ts,
 * `storiesTouched`): what a step pictures after a change under `src`, light and dark, and what it is refused for.
 *
 * The facts are read by the caller from the tree and from git, never here: the paths the change touched, from the workspace root; for
 * each story file of the board, every file of `apps/web/src` its imports reach, followed through every import of the board's own, the
 * story file itself among them; and which of the changed paths owe a story, a component or a page body of `src/components` (never the
 * vendored `ui/` and `ai-elements/`, never a story). A story is touched when it reaches a changed path; a changed path that owes a story
 * and that no story reaches is bare, and refused.
 *
 * That each list keeps the order it was handed in is no law here: said as one (the output is the input filtered, value for value, or
 * each value after the one before it), the verifier runs out of work on it at four times its default and proves it for no length, so
 * `test/e2e-stories.test.ts` holds each order on a row of its own instead: the stories' in the order of their files, and the bare
 * parts' in the order they were handed in, each seen failing on a `storiesTouched` that reversed it.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A story file of the board, by its path from the workspace root, and every file of `src` its imports reach, itself among them. */
export type StoryReach = {
  /** The story file, `apps/web/src/components/<…>/<Part>.stories.tsx`. */
  readonly story: string;
  /** Every path of `apps/web/src` the story's imports reach, the story's own path among them. */
  readonly reaches: readonly string[];
};

/** What a change touches of the stories: each story to picture, and each changed part no story reaches. */
export type Touched = {
  /** The story files that reach a changed path, once each, in the order of the reach handed in. */
  readonly stories: readonly string[];
  /** The changed paths that owe a story and that no story reaches, once each, in the order they were handed in. */
  readonly bare: readonly string[];
};

/** Whether `reach` reaches any of `changed`. */
const reachesAny = (reach: StoryReach, changed: readonly string[]) => reach.reaches.some((file) => changed.includes(file));

/** Whether no story of `reach` reaches `file`. */
const unreached = (file: string, reach: readonly StoryReach[]) => reach.every((one) => !one.reaches.includes(file));

/** Whether `list` holds no value twice: none is among those before it. */
const once = (list: readonly string[]) => list.every((one, at) => !list.slice(0, at).includes(one));

const storiesTouchedSpec = spec<(changed: readonly string[], reach: readonly StoryReach[], owing: readonly string[]) => Touched>({
  requires: ({ input: [changed, reach, owing] }) =>
    once(reach.map((one) => one.story)) &&
    reach.every((one) => one.reaches.includes(one.story)) &&
    once(owing) &&
    owing.every((file) => changed.includes(file)),
  ensures: {
    touchedExactlyWhereReached: {
      description: 'A story is pictured exactly when its imports reach a path the change touched, its own file among them',
      condition: ({ input: [changed, reach], output }) =>
        reach.every((one) => output.stories.includes(one.story) === reachesAny(one, changed)) &&
        output.stories.every((story) => reach.some((one) => one.story === story)),
    },
    storiesOnce: {
      description: 'Each touched story is named once',
      condition: ({ output }) => once(output.stories),
    },
    bareExactlyWhereNoStoryReaches: {
      description: 'A changed part that owes a story is refused exactly when no story reaches it',
      condition: ({ input: [, reach, owing], output }) =>
        owing.every((file) => output.bare.includes(file) === unreached(file, reach)) && output.bare.every((file) => owing.includes(file)),
    },
    bareOnce: {
      description: 'Each bare part is named once',
      condition: ({ output }) => once(output.bare),
    },
    nothingChangedNothingOwed: {
      description: 'A change that touched nothing pictures no story and refuses nothing',
      condition: ({ input: [changed], output }) => changed.length > 0 || (output.stories.length === 0 && output.bare.length === 0),
    },
  },
});
export type StoriesTouched = Implementation<typeof storiesTouchedSpec>;
