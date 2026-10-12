/**
 * The rule of the times in the Runs page's finished table, without a browser: each keeps its padding, and the times of one form are
 * each as wide as the next. A table holds two forms once it crosses a new year, a day and a time (`11 Oct  1:11 PM`) and a day and
 * its year (`31 Dec 2025`), and the two are never as wide as each other.
 */

/** A time as the browser draws it: its words with their padding, how its white space is kept, and its width in whole pixels. */
export interface DrawnTime {
  words: string;
  whiteSpace: string;
  width: number;
}

/** The form a time's words are in: `a day and its year` when they end on a year, else `a day and a time`. */
export const formOf = (words: string): string => (/\d{4}\s*$/.test(words) ? 'a day and its year' : 'a day and a time');

/**
 * What is wrong with `times`, or null: a time whose white space is not kept as written (`pre`), which would lose its padding, or
 * two times of one form that are not as wide as each other. Two forms may differ in width.
 */
export function timesRefused(times: DrawnTime[]): string | null {
  const loose = times.filter((time) => time.whiteSpace !== 'pre');
  if (loose.length > 0)
    return `each time of the finished table keeps its padding — ${loose.map((time) => `${JSON.stringify(time.words)} is ${time.whiteSpace}`).join(', ')}`;
  for (const form of new Set(times.map((time) => formOf(time.words)))) {
    const drawn = times.filter((time) => formOf(time.words) === form);
    if (new Set(drawn.map((time) => time.width)).size > 1)
      return `every time written as ${form} is as wide as the next — ${drawn.map((time) => `${JSON.stringify(time.words)} ${time.width}px`).join(', ')}`;
  }
  return null;
}
