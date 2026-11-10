/**
 * The import scanners' reading of comments, proven on planted source: every workspace's layout and boundary tests read code through
 * `withoutComments`, so a comment it left would count as code, and code it blanked would pass every rule unread.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importsIn, withoutComments } from 'test-kit/imports';

test('REFUSED: a comment, a line or a block, after code or alone, is blanked with its line breaks kept', () => {
  const text = "/**\n * import { a } from 'quoted';\n */\nimport b from 'real'; // import c from 'tail'\n/* d */ const e = 1;\n";
  const blank = withoutComments(text);
  assert.equal(blank.length, text.length, 'every column still counts');
  assert.equal(blank.split('\n').length, text.split('\n').length, 'every line still counts');
  assert.doesNotMatch(blank, /quoted|tail|\bd\b/);
  assert.deepEqual(
    importsIn(text).map((found) => found.spec),
    ['real'],
  );
});

test('a // in a string, a template or a pattern, and a /* in a pattern, is no comment and blanks nothing after it', () => {
  const kept = [
    "const at = 'https://example.com/a'; const after = 1;",
    'const glob = `src/*.ts ${dir} // kept`; const after = 1;',
    'const nested = `${ { a: `//` }.a }`; const after = 1;',
    'const pattern = /[/*]/g; const after = 1;',
    'const pattern = /\\/\\//; const after = 1;',
    'const half = a / b / c; const after = 1;',
  ];
  for (const line of kept) assert.equal(withoutComments(line), line, line);
});
