/**
 * What a script must not hold to be inlined in a page (`src/bundle/guards.ts`): a closing script tag is refused, a comment opener in
 * a string is escaped, and one in a regular expression with the `u` flag, which no escape keeps valid, is refused.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { inlinable, inlinableStyle } from '../src/bundle/guards.ts';

test('a comment opener in a string or a plain regular expression is escaped, and reads the same', () => {
  assert.equal(inlinable('var a="<!--";var b=/<!--/g;', 'x'), 'var a="<\\!--";var b=/<\\!--/g;');
});

test('REFUSED: a closing script tag, a comment opener under the u flag, and a closing style tag', () => {
  assert.throws(() => inlinable('var a="</script>";', 'x'), Error);
  assert.throws(() => inlinable('var a=/<!--x/u;', 'x'), Error);
  assert.throws(() => inlinableStyle('a{content:"</style>"}'), Error);
  assert.equal(inlinableStyle('a{color:red}'), 'a{color:red}');
});
