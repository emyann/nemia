/**
 * The board's source names no colour of Tailwind's palette: a ground, an outline or an ink reads a role of the theme, and a hue one of
 * the look's five meanings (`src/lib/meaning.ts`, `src/styles.css`), so one class serves both schemes. The vendored kit
 * (`src/components/ui/ds`) is another repository's and stays out, and nothing else does.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

const WEB = path.resolve(import.meta.dirname, '..');

/** The one folder of `src` the rule does not read, from the board's root. */
const KIT = 'src/components/ui/ds';

const FAMILIES = [
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
];

const UTILITIES = [
  'bg',
  'text',
  'border',
  'ring',
  'outline',
  'divide',
  'decoration',
  'fill',
  'stroke',
  'shadow',
  'accent',
  'caret',
  'placeholder',
  'from',
  'via',
  'to',
  '-color',
];

/**
 * A palette family with its shade, as a class or a variable spells it, or a colour utility that ends in white or black, a side or an
 * offset between them included (`border-b-white`, `ring-offset-black`).
 */
const PALETTE = new RegExp(
  `(?<![\\w])(?:${FAMILIES.join('|')})-(?:50|[1-9]00|950)(?![\\w-])|(?<![\\w])(?:${UTILITIES.join('|')})(?:-[a-z]+)*-(?:white|black)(?![\\w-])`,
);

/** Where `text` first names a palette colour, as `line:column` and the words found, or null. */
export function paletteAt(text: string): string | null {
  const m = PALETTE.exec(text);
  if (!m) return null;
  const before = text.slice(0, m.index).split('\n');
  return `${before.length}:${before.at(-1)!.length + 1} (${m[0]})`;
}

/** Every file of `root`'s `src` outside the kit that names a palette colour, as its path from `root` and where. */
export function paletteIn(root: string): string[] {
  return fs
    .readdirSync(path.join(root, 'src'), { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.(ts|tsx|css)$/.test(e.name))
    .map((e) => path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
    .filter((file) => !file.startsWith(`${KIT}/`))
    .sort()
    .flatMap((file) => {
      const at = paletteAt(fs.readFileSync(path.join(root, file), 'utf8'));
      return at ? [`${file}:${at}`] : [];
    });
}

test('REFUSED: a palette colour is found, where it is, under any variant; a role of the theme and prose that names a hue are not', () => {
  const refused: [string, string][] = [
    ['bg-amber-100', 'amber-100'],
    ['dark:hover:border-neutral-700/50', 'neutral-700'],
    ['text-white', 'text-white'],
    ['!border-white', 'border-white'],
    ['bg-black/10', 'bg-black'],
    ['border-b-white', 'border-b-white'],
    ['ring-offset-black/20', 'ring-offset-black'],
    ['inset-shadow-black', 'shadow-black'],
    ['hover:drop-shadow-white', 'shadow-white'],
    ['fill-amber-400', 'amber-400'],
    ['var(--color-neutral-400)', 'neutral-400'],
    ['var(--color-white)', '-color-white'],
    ['bg-slate-50', 'slate-50'],
  ];
  for (const [cls, word] of refused) {
    const line = `<a className="p-2 ${cls}">`;
    assert.equal(paletteAt(`ok\n${line}`), `2:${line.indexOf(word) + 1} (${word})`, cls);
  }
  for (const allowed of [
    'bg-yours text-on-yours',
    'border-outline-variant',
    'bg-surface-container-highest',
    'whitespace-nowrap',
    'text-foreground',
    'bg-background',
    'the amber banner, on white, is yours; a red that is no failure',
    'gap-100 scale-950 text-whiteboard',
    'border-b-whiteish text-on-black-ish to-blacksmith',
  ])
    assert.equal(paletteAt(allowed), null, allowed);
});

test('REFUSED: a palette colour in any file of src, a stylesheet included; the vendored kit alone stays out', () => {
  const root = scratch('palette-');
  for (const file of [`${KIT}/x.tsx`, 'src/components/ui/y.tsx', 'src/routes/z.css', 'src/lib/clean.ts']) {
    fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), file.endsWith('clean.ts') ? 'export const a = "bg-card";\n' : 'a { b: "bg-red-500" }\n');
  }
  assert.deepEqual(paletteIn(root), ['src/components/ui/y.tsx:1:12 (red-500)', 'src/routes/z.css:1:12 (red-500)']);
});

test("the board's source names no palette colour: a role of the theme, or a meaning's form", () => {
  assert.deepEqual(
    paletteIn(WEB),
    [],
    'give each a role of the theme (bg-card, border-outline, text-muted-foreground) or a form of src/lib/meaning.ts, whose roles src/styles.css reads',
  );
});
