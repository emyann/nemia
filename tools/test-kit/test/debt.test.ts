/**
 * The door-debt counter, proven on planted sources: a door's store test counts the seam's uses in each file of `src` and holds them to
 * its baseline, which only shrinks, so a counter that counts nothing, or a judge that lets a fallen count stand, would pass there too.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { debtBreaks, seamUses, sourcesUnder } from 'test-kit/debt';

const SEAM = /(?<![\w$.])(?:readFeed|feedSize)\s*\(/g;
const USE = /(?<![\w$.])(?:ledgerOf|appendRevision)(?![\w$])/g;

test('the seam is counted in code, never in a comment line', () => {
  const sources = {
    'src/a.ts': 'const a = readFeed(x);\n// readFeed(y)\n * feedSize() in prose\n/* feedSize() */\nconst b = feedSize ();',
    'src/b.ts': 'const c = door.readFeed(x);\nconst d = unreadFeed(x);',
  };
  assert.deepEqual([...seamUses(sources, SEAM)], [['src/a.ts', 2]]);
});

test('with bindings on, an import or a re-export of a seam name is plumbing, and the name handed on is a use', () => {
  const sources = {
    'src/a.ts': [
      "import {\n  ledgerOf,\n  appendRevision,\n} from '../revisions/index.ts';",
      "export { ledgerOf } from '../revisions/index.ts';",
      'const read = ledgerOf;',
      'run(appendRevision);',
      'const n = ledgerOf(x);',
    ].join('\n'),
  };
  assert.deepEqual([...seamUses(sources, USE, { bindings: true })], [['src/a.ts', 3]]);
  assert.deepEqual([...seamUses(sources, USE)], [['src/a.ts', 6]], 'bindings off: every spelling counts');
});

test('REFUSED: a count above its debt, a count below it, a file the debt does not name, and a debt with no use left', () => {
  const uses = new Map([
    ['src/a.ts', 3],
    ['src/b.ts', 1],
    ['src/c.ts', 2],
  ]);
  assert.deepEqual(debtBreaks(uses, { 'src/a.ts': 3, 'src/b.ts': 1, 'src/c.ts': 2 }), [], 'each count as its debt');
  assert.deepEqual(debtBreaks(uses, { 'src/a.ts': 2, 'src/b.ts': 1, 'src/c.ts': 2 }), [
    { file: 'src/a.ts', uses: 3, owed: 2, kind: 'grown' },
  ]);
  assert.deepEqual(debtBreaks(uses, { 'src/a.ts': 4, 'src/b.ts': 1, 'src/c.ts': 2 }), [
    { file: 'src/a.ts', uses: 3, owed: 4, kind: 'fallen' },
  ]);
  assert.deepEqual(debtBreaks(uses, { 'src/a.ts': 3, 'src/b.ts': 1 }), [{ file: 'src/c.ts', uses: 2, owed: 0, kind: 'grown' }]);
  assert.deepEqual(debtBreaks(uses, { 'src/a.ts': 3, 'src/b.ts': 1, 'src/c.ts': 2, 'src/d.ts': 1 }), [
    { file: 'src/d.ts', uses: 0, owed: 1, kind: 'gone' },
  ]);
});

test('the sources under a folder are its code, tests and the named own files left out, by path from the package', () => {
  const pkg = scratch('kit-debt-');
  for (const [file, text] of Object.entries({
    'src/a.ts': 'a',
    'src/feed/feed.store.ts': 'own',
    'src/feed/feed.ts': 'b',
    'src/feed/feed.test.ts': 'test',
    'src/feed/notes.md': 'prose',
    'test/x.ts': 'test',
  })) {
    fs.mkdirSync(path.dirname(path.join(pkg, file)), { recursive: true });
    fs.writeFileSync(path.join(pkg, file), text);
  }
  assert.deepEqual(sourcesUnder(pkg, 'src', ['src/feed/feed.store.ts']), { 'src/a.ts': 'a', 'src/feed/feed.ts': 'b' });
});
