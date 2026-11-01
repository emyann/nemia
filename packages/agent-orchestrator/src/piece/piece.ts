/**
 * `text` up to the first `separator`, which is not empty, or the whole of it where there is none: what `text.split(separator)[0]`
 * gives, with a type that says it is always there. Pure.
 */
export const firstPiece = (text: string, separator: string): string => {
  const at = text.indexOf(separator);
  return at === -1 ? text : text.slice(0, at);
};
