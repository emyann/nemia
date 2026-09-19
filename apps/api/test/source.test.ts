/**
 * The api's own files hold no raw control character. One in a regular expression's class reads as a blank to a person, and a NUL makes
 * ripgrep take the whole file for binary and search none of it: the builder's refusals of a control character were written so once, and a
 * search of `apps/api/src` did not find builder.ts at all. A class names them with escapes. Tab, line feed and carriage return are text.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const API = path.resolve(import.meta.dirname, '..');

/** The control characters that are not text, built from their codes, so this file holds none of them either. */
const CONTROL = new RegExp(`[${[[0, 8], [11, 12], [14, 31], [127, 127]].map(([from, to]) => `${String.fromCharCode(from!)}-${String.fromCharCode(to!)}`).join('')}]`);

/** Where `text` holds a control character that is not text, as `line:column` and its code, or null. */
export function controlAt(text: string): string | null {
  const m = CONTROL.exec(text);
  if (!m) return null;
  const before = text.slice(0, m.index).split('\n');
  return `${before.length}:${before.at(-1)!.length + 1} (code ${m[0].charCodeAt(0)})`;
}

const sources = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.(ts|tsx|json|md)$/.test(e.name))
    .map((e) => path.join(e.parentPath, e.name));

test('REFUSED: a raw control character — a NUL, a DEL, an escape — is found, where it is; tab, line feed and carriage return are not', () => {
  for (const code of [0, 8, 11, 27, 31, 127]) assert.equal(controlAt(`ok\nab${String.fromCharCode(code)}c`), `2:3 (code ${code})`, String(code));
  assert.equal(controlAt('a\tb\r\nc\n'), null);
});

test("the api's source and tests hold no raw control character", () => {
  const found = [...sources(path.join(API, 'src')), ...sources(path.join(API, 'test'))]
    .flatMap((file) => {
      const at = controlAt(fs.readFileSync(file, 'utf8'));
      return at ? [`${path.relative(API, file)}:${at}`] : [];
    });
  assert.deepEqual(found, [], 'write each one as an escape');
});
