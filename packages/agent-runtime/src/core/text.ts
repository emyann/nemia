/**
 * What `text` holds before the first `separator`, or the whole of it where there is none: `text.split(separator)[0]`, which is never
 * absent, typed as the string it is.
 */
export const firstPiece = (text: string, separator: string | RegExp): string => {
  const at = typeof separator === 'string' ? text.indexOf(separator) : text.search(separator);
  return at === -1 ? text : text.slice(0, at);
};
