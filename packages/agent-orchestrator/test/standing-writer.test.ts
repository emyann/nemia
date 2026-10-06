/**
 * `standing.json` has one writer, the tick's pass (`passStanding`, in `src/standing/standing.verb.ts`): no other file of `src` names
 * `writeStanding`, the store's one way to write it, whether it imports it, re-exports it or reaches it through the module.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PKG = path.join(import.meta.dirname, '..');

/** The file that defines `writeStanding`, and the one file that may call it. */
const STORE = 'src/standing/standing.store.ts';
const WRITER = 'src/standing/standing.verb.ts';

/** Every file of `src` but the tests beside the code and the store's own, by its path from the package. */
function sourcesOfSrc(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of fs.readdirSync(path.join(PKG, 'src'), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
    const file = path.relative(PKG, path.join(entry.parentPath, entry.name)).split(path.sep).join('/');
    if (file !== STORE) out[file] = fs.readFileSync(path.join(PKG, file), 'utf8');
  }
  return out;
}

/** The files among `sources` that name `writeStanding`, sorted. */
const writersIn = (sources: Record<string, string>): string[] =>
  Object.entries(sources)
    .filter(([, text]) => /\bwriteStanding\b/.test(text))
    .map(([file]) => file)
    .sort();

test('REFUSED: a second file that imports writeStanding, across line breaks, is a second writer', () => {
  const sources = {
    [WRITER]: "import { writeStanding, type StoodRead } from './standing.store.ts';\n",
    'src/tick/tick.verb.ts': "import {\n  readStanding,\n  writeStanding,\n} from '../standing/standing.store.ts';\n",
    'src/views/views.verb.ts': "import * as standing from '../standing/standing.store.ts';\nstanding.writeStanding('', []);\n",
    'src/wait/wait.ts': "import { readStanding } from '../standing/standing.store.ts';\n",
  };
  assert.deepEqual(writersIn(sources), ['src/standing/standing.verb.ts', 'src/tick/tick.verb.ts', 'src/views/views.verb.ts']);
});

test('the pass is the one writer of standing.json: no file of src but standing.verb.ts names writeStanding', () => {
  assert.deepEqual(writersIn(sourcesOfSrc()), [WRITER]);
});
