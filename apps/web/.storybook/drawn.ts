/** How a story is judged drawn after it is drawn (`afterEach`, `preview.tsx`): what it drew, and whether it did not. */

/** A story as it drew: its id, what it threw or null, and how tall what it drew is, in pixels. */
export type StoryDrawn = { id: string; broken: string | null; height: number };

/**
 * Each story of `stories` that did not draw, a line each: one that threw, by what it threw, and one that drew nothing.
 * @param stories Each story as it drew.
 */
export const undrawn = (stories: readonly StoryDrawn[]) =>
  stories.flatMap((one) => {
    if (one.broken !== null) return [`${one.id} threw: ${one.broken}`];
    return one.height > 0 ? [] : [`${one.id} draws nothing`];
  });
