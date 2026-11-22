/**
 * What a script must not hold to be inlined in a page: a closing script tag ends the page's script early, and a comment opener sets
 * the page's parser in its script-data-escaped state. A comment opener in a string, a grammar or a regular expression with no `u` flag
 * reads the same with its `!` escaped, so it is escaped; in a regular expression with the `u` flag, `\!` is a syntax error, so it is
 * refused.
 */

/** A regular expression's literal that holds a comment opener, with its flags. */
const OPENER_IN_A_LITERAL = /\/[^/\n]*<!--[^/\n]*\/([a-z]*)/g;

/**
 * The script with every comment opener escaped; refused when one sits in a regular expression with the `u` flag, or when it holds a
 * closing script tag.
 * @param script the bundled script.
 * @param what the script's name, for the refusal.
 */
export const inlinable = (script: string, what: string) => {
  const unicode = [...script.matchAll(OPENER_IN_A_LITERAL)].some(([, flags]) => (flags ?? '').includes('u'));
  if (unicode)
    throw new Error(
      `${what} holds "<!--" in a regular expression with the u flag, which no escape keeps valid: find the library that writes it, and keep it out of the bundle`,
    );
  const escaped = script.replaceAll('<!--', '<\\!--');
  if (/<\/script/i.test(escaped))
    throw new Error(`${what} holds "</script", which would end the page's script: find the string that writes it, and split it`);
  return escaped;
};

/**
 * Refuses a stylesheet that holds a closing style tag, which would end the page's style early.
 * @param css the stylesheet.
 */
export const inlinableStyle = (css: string) => {
  if (/<\/style/i.test(css)) throw new Error('bundle.css holds "</style": find the rule that writes it, and escape it');
  return css;
};
