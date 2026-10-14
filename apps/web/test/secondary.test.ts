/**
 * Tailwind's `secondary` on the board is Material's secondary role, as the kit's generated theme (`theme/theme.v4.css`) declares it
 * and the kit's parts draw it: `src/styles.css` declares no colour of the secondary family over it, and no file of `src` outside the
 * vendored kit names shadcn's `--secondary` or its `secondary-foreground`. shadcn's quiet surface is written by its own role,
 * `bg-surface-container-highest text-on-surface`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

const WEB = path.resolve(import.meta.dirname, '..');

/** The one folder of `src` the name rule does not read, from the board's root. */
const KIT = 'src/components/ui/ds';

/** A declaration of a Tailwind colour of the secondary family (`--color-secondary`, `--color-on-secondary-container`). */
const FAMILY = /(?<![\w-])--color-(?:on-)?secondary[\w-]*\s*:/g;

/** shadcn's surface tone under the name `secondary`: its variable, or its foreground in any spelling. */
const SHADCN = /(?<![\w-])--secondary(?![\w])|secondary-foreground/g;

/** Each `line` (1-based) of `text` where `pattern` matches, with the words found. */
function placesOf(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((m) => `${text.slice(0, m.index).split('\n').length} (${m[0].replace(/\s+/g, ' ')})`);
}

/** Where a stylesheet declares a colour of the secondary family over the theme's, as `line (words)`. */
export function familyIn(css: string): string[] {
  return placesOf(css, FAMILY);
}

/** Every file of `root`'s `src` outside the kit that names shadcn's `secondary` tone, as `path:line (words)`. */
export function shadcnSecondaryIn(root: string): string[] {
  return fs
    .readdirSync(path.join(root, 'src'), { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.(ts|tsx|css)$/.test(e.name))
    .map((e) => path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
    .filter((file) => !file.startsWith(`${KIT}/`))
    .sort()
    .flatMap((file) => placesOf(fs.readFileSync(path.join(root, file), 'utf8'), SHADCN).map((at) => `${file}:${at}`));
}

test('REFUSED: a stylesheet that declares a colour of the secondary family, across a line break too; a role read from it is not', () => {
  assert.deepEqual(familyIn('a\n  --color-secondary: var(--secondary);\n'), ['2 (--color-secondary:)']);
  assert.deepEqual(familyIn('--color-secondary-foreground: var(--secondary-foreground);'), ['1 (--color-secondary-foreground:)']);
  assert.deepEqual(familyIn('x\ny\n  --color-on-secondary\n    : var(--md-sys-color-primary);'), ['3 (--color-on-secondary :)']);
  assert.deepEqual(familyIn('@theme { --color-secondary-container: red; }'), ['1 (--color-secondary-container:)']);
  for (const allowed of [
    '--meaning-alive: var(--md-sys-color-secondary);',
    '--ring: var(--md-sys-color-secondary);',
    '--sidebar-ring: var(--md-sys-color-secondary);',
    'color: var(--color-secondary);',
    '--md-sys-color-secondary: #eaf6f8;',
  ])
    assert.deepEqual(familyIn(allowed), [], allowed);
});

test("REFUSED: shadcn's secondary tone named in any file of src, a stylesheet included; the kit and Material's role stay allowed", () => {
  const root = scratch('secondary-');
  const files: [string, string][] = [
    ['src/components/ui/x.tsx', 'const a = 1;\nconst b = "bg-secondary text-secondary-foreground";\n'],
    ['src/styles.css', ':root {\n  --secondary: grey;\n  --x: var(--secondary);\n}\n'],
    [`${KIT}/y.tsx`, 'const c = "bg-secondary text-secondary-foreground var(--secondary)";\n'],
    ['src/components/z.tsx', 'const d = "bg-secondary text-on-secondary ring-secondary/40 var(--md-sys-color-secondary)";\n'],
  ];
  for (const [file, text] of files) {
    fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  assert.deepEqual(shadcnSecondaryIn(root), [
    'src/components/ui/x.tsx:2 (secondary-foreground)',
    'src/styles.css:2 (--secondary)',
    'src/styles.css:3 (--secondary)',
  ]);
});

test("the kit's theme alone writes Tailwind's secondary: Material's secondary role", () => {
  const theme = fs.readFileSync(path.join(WEB, 'theme/theme.v4.css'), 'utf8');
  assert.match(theme, /--color-secondary:\s*var\(\s*--md-sys-color-secondary\s*\)/);
  assert.deepEqual(
    familyIn(fs.readFileSync(path.join(WEB, 'src/styles.css'), 'utf8')),
    [],
    "src/styles.css declares none of the secondary family: the kit's theme does, and its parts draw Material's secondary from it",
  );
});

test("no file of the board outside the kit names shadcn's secondary tone", () => {
  assert.deepEqual(
    shadcnSecondaryIn(WEB),
    [],
    "bg-secondary is Material's secondary (its ink text-on-secondary); for shadcn's quiet surface write its role, bg-surface-container-highest text-on-surface",
  );
});
