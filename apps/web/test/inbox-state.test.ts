/**
 * A card's state is the orchestrator's, computed once and sent closed (`InboxEntry.state`, src/lib/api/inbox.ts): the board reads it and
 * never rebuilds it from the runs a card was started as. A test of what `src/` says about the inbox, read as text.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '..', 'src');
/** The design system kit, another repository's files, which know no card. */
const KIT = path.join(SRC, 'components', 'ui', 'ds');

/** A read of `startedAs` that decides whether a card started — its length, or a search of it — across line breaks too. */
const REBUILT = /startedAs\s*\.\s*(length|includes|some|find|every)\b/g;

/** Each place `text`, the file `file`, rebuilds a card's state from `startedAs`, as `<file>:<line>` and the fix. */
export const rebuiltAt = (file: string, text: string): string[] =>
  [...text.matchAll(REBUILT)].map(
    (m) => `${file}:${text.slice(0, m.index).split('\n').length} reads startedAs.${m[1]}: read the card's \`state\` ('started') instead`,
  );

const sources = (dir: string): string[] =>
  fs
    .readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
    .map((e) => path.join(e.parentPath, e.name))
    .filter((file) => !file.startsWith(KIT + path.sep));

test("REFUSED: a card's state rebuilt from startedAs is found, on one line or across two; a read of its runs to list them is not", () => {
  const lines = (found: string[]) => found.map((at) => at.split(' ')[0]);
  assert.deepEqual(lines(rebuiltAt('a.ts', 'const started = entry.startedAs.length === 0;')), ['a.ts:1']);
  assert.deepEqual(lines(rebuiltAt('b.ts', 'x\nentry.startedAs\n  .includes(id);\ncard.startedAs.some(f)')), ['b.ts:2', 'b.ts:4']);
  assert.deepEqual(rebuiltAt('c.ts', "entry.startedAs.map((id) => id); entry.state === 'started'"), []);
});

test("no file of the board's src rebuilds a card's state from startedAs", () => {
  const found = sources(SRC).flatMap((file) => rebuiltAt(path.relative(SRC, file), fs.readFileSync(file, 'utf8')));
  assert.deepEqual(found, []);
});
