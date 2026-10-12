/** How the stories' page is judged whole: what each story drew, and which did not. */

/** A story as the page drew it: its id, what it threw or null, and how tall what it drew is, in pixels. */
export type StoryDrawn = { id: string; broken: string | null; height: number };

/** Each story of `stories` that did not draw, a line each: one that threw, by what it threw, and one that drew nothing. */
export const undrawn = (stories: readonly StoryDrawn[]): string[] =>
  stories.flatMap((one) => {
    if (one.broken !== null) return [`${one.id} threw: ${one.broken}`];
    return one.height > 0 ? [] : [`${one.id} draws nothing`];
  });
