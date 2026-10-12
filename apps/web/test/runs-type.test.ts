/**
 * The Runs page's text takes the theme's type roles (`text-body-medium`, `text-label-small`): no file the page is drawn by writes a
 * Tailwind size or a size in brackets, but the label face's two numerals, which no role sizes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join(import.meta.dirname, '..', 'src');

/** The files that draw the Runs page: its route and each part of the board it mounts. */
const FILES = [
  'routes/runs.index.tsx',
  'components/WaitingCard.tsx',
  'components/StatTile.tsx',
  'components/CopyId.tsx',
  'components/CutButton.tsx',
  'components/FlightTable.tsx',
  'components/FinishedTable.tsx',
  'components/Plate.tsx',
  'components/Sticker.tsx',
  'components/RunSteps.tsx',
  'components/Pager.tsx',
  'components/TextLink.tsx',
  'components/CutFrame.tsx',
  'components/ScanLines.tsx',
];

/** The sizes no role gives: the count on a plate and the value on a tile, both in the label face. */
const NUMERALS = ['text-[30px]', 'text-[22px]'];

/** A text size written by hand: one of Tailwind's own, or a length in brackets; a line height or a tracking in brackets too. */
const SIZES = /(?<![\w-])(?:text-(?:xs|sm|base|lg|[2-9]?xl)|(?:text|leading|tracking)-\[[^\]]*\])(?![\w-])/g;

/** Each hand-written size in `text`, the two numerals and their line heights left out. */
const handSizes = (text: string): string[] =>
  (text.match(SIZES) ?? []).filter((size) => !NUMERALS.includes(size) && !['leading-[26px]', 'tracking-[-0.02em]'].includes(size));

test('REFUSED: a Tailwind size or a bracketed size in a file that draws the Runs page', () => {
  for (const file of FILES) {
    const text = fs.readFileSync(path.join(SRC, file), 'utf8');
    assert.deepEqual(handSizes(text), [], `${file} sizes its text by hand: give it a role of the theme`);
  }
  assert.deepEqual(handSizes('<p className="text-xs text-on-surface">'), ['text-xs']);
  assert.deepEqual(handSizes('className="font-mono text-[13px] leading-[18px]"'), ['text-[13px]', 'leading-[18px]']);
  assert.deepEqual(handSizes('className="text-2xl tracking-[0.06em]"'), ['text-2xl', 'tracking-[0.06em]']);
  assert.deepEqual(handSizes('className="text-body-small text-label-large text-on-surface text-[30px] rounded-[14px]"'), []);
});

test('every file that draws the Runs page is on the list: each part the route and its parts import from the board', () => {
  const reached = new Set<string>(['routes/runs.index.tsx']);
  const next = [...reached];
  while (next.length) {
    const file = next.pop()!;
    const text = fs.readFileSync(path.join(SRC, file), 'utf8');
    for (const [, mod] of text.matchAll(/from\s*'((?:\.\.?\/|@\/components\/)[^']+)'/g)) {
      const at = mod.startsWith('@/') ? mod.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(file), mod));
      const found = `${at}.tsx`;
      if (!at.startsWith('components/') || at.startsWith('components/ui/') || !fs.existsSync(path.join(SRC, found))) continue;
      if (!reached.has(found)) next.push(found);
      reached.add(found);
    }
  }
  reached.delete('components/routeLink.tsx');
  assert.deepEqual([...reached].sort(), [...FILES].sort());
});

/** The import of a `cn` that does not know the theme's roles: the board's own, which reads `text-body-small` as a colour. */
const roleBlind = (text: string): boolean => /import\s*\{[^}]*\bcn\b[^}]*\}\s*from\s*'@\/lib\/utils'/.test(text);

test("REFUSED: the board's own cn in a file that draws the Runs page: it drops a role beside a colour, the kit's keeps both", async () => {
  for (const file of FILES)
    assert.equal(roleBlind(fs.readFileSync(path.join(SRC, file), 'utf8')), false, `${file} merges classes with the kit's cn`);
  assert.equal(roleBlind("import { cn } from '@/lib/utils';"), true);
  assert.equal(roleBlind("import { cn } from '@/components/ui/ds/utils';"), false);
  const { cn: ours } = await import('../src/lib/utils.ts');
  const { cn: kits } = await import('../src/components/ui/ds/utils.ts');
  assert.equal(ours('text-body-small', 'text-on-surface-variant'), 'text-on-surface-variant', "the board's own loses the role");
  assert.equal(kits('text-body-small', 'text-on-surface-variant'), 'text-body-small text-on-surface-variant');
  assert.equal(kits('text-on-surface', 'block text-title-small'), 'text-on-surface block text-title-small');
});
