/**
 * The board names no colour of shadcn's: its own code writes Material's roles and the look's meanings (DESIGN.md, *The names the board
 * writes*), so one name says one colour. No file of `src` outside the vendored kit writes a shadcn colour name as a colour utility (any
 * side, variant or alpha: `text-muted-foreground`, `hover:bg-accent`, `border-b-border`, `bg-card/50`), reads or declares one as a
 * variable (`var(--card)`, `--muted:`), and `src/styles.css` declares no Tailwind colour of one (`--color-muted:`) nor of Material's
 * secondary family, which the kit's theme alone declares. `ring` is the kit's own, Material's focus indicator, which the theme
 * (`theme/theme.v4.css`) declares from `secondary` and the kit's `focusRing` reads: the board draws its focus with it, as DESIGN.md's
 * focus line asks, and declares no variable of that name itself. It takes no exception.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { ours } from './ours.ts';

const WEB = path.resolve(import.meta.dirname, '..');

/** shadcn's colour names, a longer before the shorter it starts with. */
const NAMES = [
  'muted-foreground',
  'muted',
  'card-foreground',
  'card',
  'popover-foreground',
  'popover',
  'accent-foreground',
  'accent',
  'destructive-foreground',
  'destructive',
  'primary-foreground',
  'secondary-foreground',
  'sidebar(?:-[a-z]+)*',
  'foreground',
  'border',
  'input',
].join('|');

/** The Tailwind utilities that take a colour, a side or an offset included. */
const UTILITIES =
  '(?:bg|text|border(?:-[xytrblse])?|outline|ring(?:-offset)?|inset-ring|divide|fill|stroke|from|via|to|decoration|caret|placeholder|(?:inset-|drop-)?shadow|accent)';

/**
 * A shadcn name drawn as a colour utility, or read or declared as a variable, its own or Tailwind's, shadcn's `--ring` and
 * `--secondary` too.
 */
const SHADCN = new RegExp(
  `(?<![\\w-])${UTILITIES}-(?:${NAMES})(?![\\w-])|var\\(\\s*--(?:color-)?(?:${NAMES}|ring|secondary)(?![\\w-])|(?<![\\w-])--(?:${NAMES}|ring|secondary)\\s*:`,
  'g',
);

/** A declaration of a Tailwind colour of shadcn's names, of the kit's `ring`, or of Material's secondary family. */
const FAMILY = new RegExp(`(?<![\\w-])--color-(?:${NAMES}|ring|(?:on-)?secondary[\\w-]*)\\s*:`, 'g');

/** Each `line` (1-based) of `text` where `pattern` matches, with the words found. */
function placesOf(text: string, pattern: RegExp) {
  return [...text.matchAll(pattern)].map((m) => `${text.slice(0, m.index).split('\n').length} (${m[0].replace(/\s+/g, ' ')})`);
}

/**
 * Where a stylesheet declares a Tailwind colour of shadcn's names, `ring` or the secondary family, as `line (words)`.
 * @param css The stylesheet's text.
 */
export function familyIn(css: string) {
  return placesOf(css, FAMILY);
}

/**
 * Every file of `root`'s `src` outside the kit that names a colour of shadcn's, as `path:line (words)`.
 * @param root The board's root, the real one or a scratch copy.
 */
export function shadcnNamesIn(root: string) {
  return fs
    .readdirSync(path.join(root, 'src'), { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.(ts|tsx|css)$/.test(e.name))
    .map((e) => path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
    .filter(ours)
    .sort()
    .flatMap((file) => placesOf(fs.readFileSync(path.join(root, file), 'utf8'), SHADCN).map((at) => `${file}:${at}`));
}

test('REFUSED: a stylesheet that declares a colour of shadcn, of ring or of the secondary family, across a line break too', () => {
  assert.deepEqual(familyIn('a\n  --color-secondary: var(--secondary);\n'), ['2 (--color-secondary:)']);
  assert.deepEqual(familyIn('--color-secondary-foreground: var(--secondary-foreground);'), ['1 (--color-secondary-foreground:)']);
  assert.deepEqual(familyIn('x\ny\n  --color-on-secondary\n    : var(--md-sys-color-primary);'), ['3 (--color-on-secondary :)']);
  assert.deepEqual(familyIn('@theme { --color-muted: red; --color-ring: blue; }'), ['1 (--color-muted:)', '1 (--color-ring:)']);
  assert.deepEqual(familyIn('--color-sidebar-accent: x;'), ['1 (--color-sidebar-accent:)']);
  for (const allowed of [
    '--meaning-alive: #c4a8ff;',
    'color: var(--color-secondary);',
    '--md-sys-color-secondary: #eaf6f8;',
    '--color-yours: var(--meaning-yours);',
    '--color-surface-container-low: x;',
  ])
    assert.deepEqual(familyIn(allowed), [], allowed);
});

test("REFUSED: shadcn's colour names in any file of src, each where it is; Material's roles, prose and the kit stay allowed", () => {
  const root = scratch('shadcn-names-');
  const refused = [
    'text-muted-foreground',
    'hover:bg-accent',
    'bg-card/50',
    'border-border',
    'border-b-border',
    'bg-input/30',
    'text-destructive',
    'text-primary-foreground',
    'bg-sidebar-accent',
    'var(--muted-foreground)',
    'bg-secondary text-secondary-foreground',
  ];
  const files: [string, string][] = [
    ['src/components/x.tsx', refused.map((cls) => `const a = "${cls}";`).join('\n') + '\n'],
    ['src/styles.css', ':root {\n  --card: grey;\n  --x: var(--ring);\n  --secondary: grey;\n}\n'],
    ['src/components/ui/ds/y.tsx', 'const c = "bg-card text-muted-foreground var(--secondary) border-border";\n'],
    [
      'src/components/z.tsx',
      [
        'const d = "bg-surface-container-low border ring-1 ring-ring outline-ring/50 bg-background text-on-surface bg-primary";',
        'const e = "data-card text-on-surface-variant border-outline-variant bg-secondary-container var(--md-sys-color-secondary)";',
        '// a card, an accent, the border of a muted input, `nemia start --input` and `--card` as words',
      ].join('\n') + '\n',
    ],
  ];
  for (const [file, text] of files) {
    fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  assert.deepEqual(shadcnNamesIn(root), [
    'src/components/x.tsx:1 (text-muted-foreground)',
    'src/components/x.tsx:2 (bg-accent)',
    'src/components/x.tsx:3 (bg-card)',
    'src/components/x.tsx:4 (border-border)',
    'src/components/x.tsx:5 (border-b-border)',
    'src/components/x.tsx:6 (bg-input)',
    'src/components/x.tsx:7 (text-destructive)',
    'src/components/x.tsx:8 (text-primary-foreground)',
    'src/components/x.tsx:9 (bg-sidebar-accent)',
    'src/components/x.tsx:10 (var(--muted-foreground)',
    'src/components/x.tsx:11 (text-secondary-foreground)',
    'src/styles.css:2 (--card:)',
    'src/styles.css:3 (var(--ring)',
    'src/styles.css:4 (--secondary:)',
  ]);
});

test("the kit's theme alone writes Tailwind's secondary and ring: Material's secondary role, its focus indicator", () => {
  const theme = fs.readFileSync(path.join(WEB, 'theme/theme.v4.css'), 'utf8');
  assert.match(theme, /--color-secondary:\s*var\(\s*--md-sys-color-secondary\s*\)/);
  assert.match(theme, /--color-ring:\s*var\(\s*--md-sys-color-secondary\s*\)/);
  assert.deepEqual(
    familyIn(fs.readFileSync(path.join(WEB, 'src/styles.css'), 'utf8')),
    [],
    "src/styles.css declares no colour of shadcn's names, of ring or of the secondary family: the kit's theme declares the roles",
  );
});

test("no file of the board outside the kit names a colour of shadcn's", () => {
  assert.deepEqual(
    shadcnNamesIn(WEB),
    [],
    'write the role: muted-foreground is on-surface-variant, foreground on-surface, card surface-container-low, popover surface-container, accent surface-container-high, muted surface-container-highest, border outline-variant, input outline, destructive failure, primary-foreground on-primary',
  );
});
