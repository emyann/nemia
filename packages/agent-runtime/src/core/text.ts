/**
 * What `text` holds before the first `separator`, or the whole of it where there is none: `text.split(separator)[0]`, which is never
 * absent, typed as the string it is.
 */
export const firstPiece = (text: string, separator: string | RegExp): string => {
  const at = typeof separator === 'string' ? text.indexOf(separator) : text.search(separator);
  return at === -1 ? text : text.slice(0, at);
};

/** Why a verb refuses `taskId`, a task the store holds no record of: every verb's one sentence, which names where to find the others. */
export const unknownTask = (taskId: string): string =>
  `\`${taskId}\` is not a task in this store. \`ae ls\`, or \`list()\`, gives the ones it has.`;
