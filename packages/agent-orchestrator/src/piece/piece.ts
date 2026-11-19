/**
 * `text` up to the first `separator`, which is not empty, or the whole of it where there is none: what `text.split(separator)[0]`
 * gives, with a type that says it is always there. Pure.
 * @param text The text cut.
 * @param separator The text it is cut at, not empty.
 */
export const firstPiece = (text: string, separator: string) => {
  const at = text.indexOf(separator);
  return at === -1 ? text : text.slice(0, at);
};
