/**
 * The package's own files hold no raw control character and no byte-order mark. A tool that decodes escapes wrote a raw
 * BOM into card.ts's frontmatter pattern once, where it reads as nothing to a person; a class names them with escapes.
 */
import './hermetic.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PACKAGE = path.resolve(import.meta.dirname, '..');

/** The characters that are not text, built from their codes, so this file holds none of them either. */
const HIDDEN = new RegExp(
  `[${[
    [0, 8],
    [11, 12],
    [14, 31],
    [127, 127],
    [0xfeff, 0xfeff],
  ]
    .map(([from, to]) => `${String.fromCharCode(from!)}-${String.fromCharCode(to!)}`)
    .join('')}]`,
);

/** Where `text` holds a character that is not text, as `line:column` and its code, or null. */
export function hiddenAt(text: string): string | null {
  const m = HIDDEN.exec(text);
  if (!m) return null;
  const before = text.slice(0, m.index).split('\n');
  return `${before.length}:${before.at(-1)!.length + 1} (code ${m[0].charCodeAt(0)})`;
}

const sources = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.(ts|json|md)$/.test(e.name))
    .map((e) => path.join(e.parentPath, e.name));

test('REFUSED: a raw control character or a BOM is found, where it is; tab, line feed and carriage return are not', () => {
  for (const code of [0, 8, 11, 27, 31, 127, 0xfeff])
    assert.equal(hiddenAt(`ok\nab${String.fromCharCode(code)}c`), `2:3 (code ${code})`, String(code));
  assert.equal(hiddenAt('a\tb\r\nc\n\\uFEFF'), null);
});

test("the package's source, command, tests and README hold none", () => {
  const found = [
    ...sources(path.join(PACKAGE, 'src')),
    ...sources(path.join(PACKAGE, 'bin')),
    ...sources(path.join(PACKAGE, 'test')),
    path.join(PACKAGE, 'README.md'),
    path.join(PACKAGE, 'package.json'),
  ]
    .filter((file) => fs.existsSync(file))
    .flatMap((file) => {
      const at = hiddenAt(fs.readFileSync(file, 'utf8'));
      return at ? [`${path.relative(PACKAGE, file)}:${at}`] : [];
    });
  assert.deepEqual(found, [], 'write each one as an escape');
});
