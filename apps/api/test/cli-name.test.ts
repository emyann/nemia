/**
 * The api names the command `nemia` in every word it answers with: a refusal, a line of a run, a command it hands the board to copy.
 * `wf` is the alias of `nemia`, and says no word of the api's own; one said as a word in `src` is refused (`wfLines`). A `wf` in a path
 * (`wf/` branches), a prefix (`wf-`) or a file name (`wf.ts`) is no word. Tests are not read: they quote old records.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const API = path.resolve(import.meta.dirname, '..');

/** A `wf` said as a word: no part of a longer name, a path, a prefix, a file name or an assignment. */
const WF_WORD = /(?<![\w/=.-])wf(?![\w/@.-])/;

/** Each `.ts` file of `src` but a test, by its path from the api, with its text. */
function sources(): Map<string, string> {
  const files = new Map<string, string>();
  for (const f of fs.readdirSync(path.join(API, 'src'), { recursive: true, encoding: 'utf8' })) {
    const file = `src/${f.split(path.sep).join('/')}`;
    if (file.endsWith('.ts') && !file.endsWith('.test.ts')) files.set(file, fs.readFileSync(path.join(API, file), 'utf8'));
  }
  return files;
}

/** Each line of `files` (each file's text, by its path) that says `wf` as a word, as `file:line: text`. */
function wfLines(files: ReadonlyMap<string, string>): string[] {
  return [...files].flatMap(([file, text]) =>
    text.split('\n').flatMap((line, i) => (WF_WORD.test(line) ? [`${file}:${i + 1}: ${line.trim()}`] : [])),
  );
}

test('every word the api answers with names the command nemia, never wf', () => {
  assert.deepEqual(wfLines(sources()), [], 'say `nemia`: `wf` is only its alias');
});

test('REFUSED: a refusal or a JSDoc naming `wf` as the command is found; a branch, a prefix and a file name are not', () => {
  const files = new Map([
    [
      'src/x.ts',
      [
        'throw new Invalid(`no such run: ${id}. wf retry takes a run by its id`);',
        '/** Holds a run, as `wf hold` does. */',
        'const branch = `wf/${run}/${step}`;',
        "const dir = scratch('wf-x-');",
        "const bin = 'bin/wf.ts';",
      ].join('\n'),
    ],
  ]);
  assert.deepEqual(wfLines(files), [
    'src/x.ts:1: throw new Invalid(`no such run: ${id}. wf retry takes a run by its id`);',
    'src/x.ts:2: /** Holds a run, as `wf hold` does. */',
  ]);
});
