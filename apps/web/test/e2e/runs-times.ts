/**
 * The rule of the times in the Runs page's finished table, without a browser: each says how long ago it was in the one form the board
 * writes — `just now`, or one unit and `ago` — never date-fns's `about`, and each has the room of its own cell, the overlap the column
 * had when it wrote a padded date and a time.
 */

/** A column's `how long ago` as the browser draws it: its words, its own width and the room its cell leaves it, in whole pixels. */
export interface DrawnAgo {
  words: string;
  width: number;
  room: number;
}

/** The one form the column writes: `just now` under a minute, else a whole number, one unit, and `ago`. */
export const AGO = /^(?:just now|\d+ (?:seconds?|minutes?|hours?|days?|months?|years?) ago)$/;

/**
 * What is wrong with `times`, or null: words in no form the column writes (an absolute date, a distance of two units, date-fns's
 * `about`), or a time wider than the room its cell leaves it, which is the overlap a reader sees.
 */
export function agosRefused(times: DrawnAgo[]): string | null {
  const said = (time: DrawnAgo) => JSON.stringify(time.words);
  const wrong = times.filter((time) => !AGO.test(time.words.trim()));
  if (wrong.length > 0)
    return `each time of the finished table says how long ago it was, as \`just now\` or one unit and \`ago\` — ${wrong.map(said).join(', ')}`;
  const over = times.filter((time) => time.width > time.room);
  if (over.length > 0)
    return `each time has the room of its own cell — ${over.map((time) => `${said(time)} is ${time.width}px in ${time.room}px`).join(', ')}`;
  return null;
}
