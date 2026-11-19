/**
 * Which of the board's stories a change touches, and which changed part no story reaches (`storiesTouched`, proved by
 * `contracts/touched-stories.contract.ts`), and which file of the board owes a story (`owesAStory`): what `changed.ts` refuses (a
 * changed part no story reaches), and what `test/stories.test.ts` holds the tree to. Pure: the paths, the reach and what owes are read by the caller.
 */
import type { StoriesTouched } from '../../../contracts/touched-stories.contract.ts';

/**
 * Whether `file`, by its path from the workspace root, owes a story beside it: a component or a page body of the board's
 * `src/components`, never a story itself and never the vendored `ui/` (shadcn's and the ds kit's) and `ai-elements/`.
 * @param file The path from the workspace root.
 */
export const owesAStory = (file: string): boolean =>
  /^apps\/web\/src\/components\/.+\.tsx$/.test(file) &&
  !file.endsWith('.stories.tsx') &&
  !/^apps\/web\/src\/components\/(ui|ai-elements)\//.test(file);

/**
 * The stories `changed` touches, each story of `reach` whose imports reach a changed path, once each in the reach's order; and the
 * paths of `owing` no story reaches, once each in their order.
 * @param changed The paths the change touched, from the workspace root.
 * @param reach Each story file and every file of `src` its imports reach, itself among them.
 * @param owing The changed paths that owe a story.
 */
export const storiesTouched: StoriesTouched = (changed, reach, owing) => ({
  stories: reach.filter((one) => one.reaches.some((file) => changed.includes(file))).map((one) => one.story),
  bare: owing.filter((file) => reach.every((one) => !one.reaches.includes(file))),
});
