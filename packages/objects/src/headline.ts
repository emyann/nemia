/**
 * A body's title: its first line, with a leading ATX heading mark (`#` to `######` and the space after it) taken off, and nothing else
 * changed. A first line with no mark, a `#tag` among them, is returned as it is. What is stored keeps its heading; only the title read
 * from it drops it. Pure.
 */
export const headline = (text: string): string => {
  const at = text.indexOf('\n');
  const first = at === -1 ? text : text.slice(0, at);
  return first.replace(/^#{1,6}\s+/, '');
};
