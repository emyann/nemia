/**
 * The board's text takes the theme's fifteen type roles (`text-body-small` … `text-display-large`): its source writes no size of
 * Tailwind's (`text-sm`), no size, line height or tracking in brackets (`text-[11px]`, `leading-[18px]`) and no `fontSize` by hand.
 * The vendored kit (`src/components/ui/ds`) is another repository's and stays out; the few sizes no role gives are `OUTSIDE`, each
 * in its file alone, with its reason.
 *
 * The table, by what the text is: 12px is `text-body-small`, 14px `text-body-medium`, 16px `text-body-large`; a text in capitals is
 * a label role and `uppercase` (`text-label-small uppercase`), with no weight or tracking written beside it; a heading is a title
 * role (`text-title-small` 14px, `text-title-medium` 16px, `text-title-large` 22px); mono text takes a body role whole.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

const WEB = path.resolve(import.meta.dirname, '..');

/** The one folder of `src` the rule does not read, from the board's root. */
const KIT = 'src/components/ui/ds';

/** What to write instead, said by every refusal. */
const TABLE =
  'give the text a role of the theme: text-body-small (12px), text-body-medium (14px), text-body-large (16px); a label role and uppercase for small caps; a title role for a heading; a body role for mono';

/** The ways a size is written by hand, each a family the rule needs: a pattern over a source text, by its name. */
export const FAMILIES: Record<string, RegExp> = {
  named: /(?<![\w-])text-(?:xs|sm|base|lg|[2-9]?xl)(?![\w-])/g,
  length: /(?<![\w-])text-\[(?!color:)[^\]]*\]/g,
  spacing: /(?<![\w-])(?:leading|tracking)-\[[^\]]*\]/g,
  property: /(?<![\w-])(?:fontSize\s*[=:]\s*\{?\s*['"`]?|font-size\s*:\s*)[\d.]+\w*/g,
};

/** A size found in a text: the words written and where, as `line:column`. */
export interface Found {
  size: string;
  at: string;
}

/** Every hand-written size in `text`, in the order written, by the `families` given (all of them unless told). */
export function sizesAt(text: string, families: Record<string, RegExp> = FAMILIES): Found[] {
  return Object.values(families)
    .flatMap((family) => [...text.matchAll(family)])
    .sort((a, b) => a.index - b.index)
    .map((m) => {
      const before = text.slice(0, m.index).split('\n');
      return { size: m[0], at: `${before.length}:${before.at(-1)!.length + 1}` };
    });
}

/** A size left outside the roles: the file that writes it, from the board's root, the class, and why no role gives it. */
export interface Outside {
  file: string;
  size: string;
  why: string;
}

const NUMERAL = "the label face's numeral (Archivo, width 125, weight 800), which no role sizes; settled by the Runs page";
const PROSE = 'rendered markdown takes the size of the surface it stands on: a role would fix it at one size everywhere';

/** The sizes no role gives, each valid in its file alone. */
export const OUTSIDE: Outside[] = [
  { file: 'src/components/look/Plate.tsx', size: 'text-[30px]', why: NUMERAL },
  { file: 'src/components/look/Plate.tsx', size: 'tracking-[-0.02em]', why: NUMERAL },
  { file: 'src/components/look/Sticker.tsx', size: 'text-[22px]', why: NUMERAL },
  { file: 'src/components/look/Sticker.tsx', size: 'leading-[26px]', why: NUMERAL },
  { file: 'src/components/Markdown.tsx', size: 'text-[1.15em]', why: PROSE },
  { file: 'src/components/Markdown.tsx', size: 'text-[1.08em]', why: PROSE },
  { file: 'src/components/Markdown.tsx', size: 'text-[0.95em]', why: PROSE },
  { file: 'src/components/Markdown.tsx', size: 'text-[0.9em]', why: PROSE },
  {
    file: 'src/components/FrameTabs.tsx',
    size: 'text-[length:inherit]',
    why: 'it gives the size back to where the content stands, and names none',
  },
];

/** The files of `root`'s `src` the rule reads: every `.ts`, `.tsx` and `.css` outside the kit, as its path from `root`. */
function sources(root: string): string[] {
  return fs
    .readdirSync(path.join(root, 'src'), { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.(ts|tsx|css)$/.test(e.name))
    .map((e) => path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
    .filter((file) => !file.startsWith(`${KIT}/`))
    .sort();
}

/** Every hand-written size in `root`'s `src` outside the kit that `outside` does not list for its file, as `file:line:column (size)`. */
export function sizesIn(root: string, outside: Outside[] = OUTSIDE): string[] {
  return sources(root).flatMap((file) =>
    sizesAt(fs.readFileSync(path.join(root, file), 'utf8'))
      .filter(({ size }) => !outside.some((o) => o.file === file && o.size === size))
      .map(({ size, at }) => `${file}:${at} (${size})`),
  );
}

/** The entries of `outside` that hold nothing: no reason given, or a size its file under `root` no longer writes. */
export function idle(root: string, outside: Outside[] = OUTSIDE): string[] {
  return outside
    .filter(({ file, size, why }) => {
      const at = path.join(root, file);
      return !why.trim() || !fs.existsSync(at) || !sizesAt(fs.readFileSync(at, 'utf8')).some((found) => found.size === size);
    })
    .map(({ file, size }) => `${file} (${size})`);
}

const WEIGHTED = /(?<![\w-])text-(?:label|title|headline|display)-(?:small|medium|large)(?![\w-])/;

/** Each class string of `text` that sets mono text in a role carrying a weight: the face has one, and the browser would draw the rest. */
export function monoWeighted(text: string): string[] {
  return [...text.matchAll(/(["'`])([^"'`\n]*)\1/g)]
    .map(([, , classes]) => classes ?? '')
    .filter((classes) => /(?<![\w-])font-mono(?![\w-])/.test(classes) && WEIGHTED.test(classes));
}

/** Whether `text` takes a merge function that does not know the roles: the package's own, which reads `text-body-small` as an ink. */
export const roleBlind = (text: string): boolean => /from\s*['"]cn['"]/.test(text);

const REFUSED: [string, string, string][] = [
  ['text-sm', 'text-sm', 'named'],
  ['md:text-base', 'text-base', 'named'],
  ['file:text-sm', 'text-sm', 'named'],
  ['group-data-[size=sm]/card:text-sm', 'text-sm', 'named'],
  ['!text-xs', 'text-xs', 'named'],
  ['text-2xl', 'text-2xl', 'named'],
  ['text-lg/7', 'text-lg', 'named'],
  ['text-[11px]', 'text-[11px]', 'length'],
  ['text-[0.8rem]', 'text-[0.8rem]', 'length'],
  ['text-[1.15em]', 'text-[1.15em]', 'length'],
  ['text-[length:12px]', 'text-[length:12px]', 'length'],
  ['leading-[18px]', 'leading-[18px]', 'spacing'],
  ['tracking-[0.06em]', 'tracking-[0.06em]', 'spacing'],
  ['fontSize={10}', 'fontSize={10', 'property'],
  ['fontSize: 10', 'fontSize: 10', 'property'],
  ["fontSize: '0.9em'", "fontSize: '0.9em", 'property'],
  ['font-size: 12px', 'font-size: 12px', 'property'],
];

test('REFUSED: a size written by hand is found, where it is, under any variant; a role, an ink and a named line height are not', () => {
  for (const [written, size] of REFUSED) {
    const line = `<a className="p-2 ${written}">`;
    assert.deepEqual(sizesAt(`ok\n${line}`), [{ size, at: `2:${line.indexOf(size) + 1}` }], written);
  }
  for (const allowed of [
    'text-body-small',
    'text-label-large uppercase',
    'text-on-surface',
    'text-muted-foreground',
    'text-left',
    'text-[color:var(--x)]',
    'leading-none',
    'tracking-wide',
    'rounded-[14px]',
    'context-sm',
    'text-smooth text-xs-ish',
    "fontSize: 'var(--md-sys-typescale-label-small-size)'",
    'font-size: var(--md-sys-typescale-body-small-size)',
  ])
    assert.deepEqual(sizesAt(allowed), [], allowed);
  assert.deepEqual(
    sizesAt('a text-xs\nb leading-[18px] text-[13px]').map(({ size, at }) => `${at} ${size}`),
    ['1:3 text-xs', '2:3 leading-[18px]', '2:18 text-[13px]'],
  );
});

test('every family is needed: the rule built without one finds nothing of what that family alone refuses', () => {
  assert.deepEqual(Object.keys(FAMILIES).sort(), [...new Set(REFUSED.map(([, , family]) => family))].sort());
  for (const name of Object.keys(FAMILIES)) {
    const rest = Object.fromEntries(Object.entries(FAMILIES).filter(([family]) => family !== name));
    for (const [written, , family] of REFUSED)
      assert.equal(sizesAt(written, rest).length, family === name ? 0 : 1, `${written} without ${name}`);
  }
});

/** A board's root in a scratch folder, holding each of `files` by its path from that root. */
function boardOf(files: Record<string, string>): string {
  const root = scratch('type-');
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  return root;
}

test('REFUSED: a size in any file of src, a stylesheet included; the vendored kit alone stays out, and a size outside the roles in its file alone', () => {
  const root = boardOf({
    [`${KIT}/x.tsx`]: '<a className="text-sm">\n',
    'src/components/ui/y.tsx': '<a className="text-sm">\n',
    'src/routes/z.tsx': '<a className="text-[11px]">\n',
    'src/components/m.tsx': '<a className="text-[1.15em]">\n',
    'src/routes/s.css': 'a { font-size: 12px }\n',
    'src/components/Markdown.tsx': '<a className="text-[1.15em] text-xs">\n',
    'src/lib/clean.ts': 'export const a = "text-body-small text-on-surface";\n',
  });
  assert.deepEqual(sizesIn(root), [
    'src/components/Markdown.tsx:1:29 (text-xs)',
    'src/components/m.tsx:1:15 (text-[1.15em])',
    'src/components/ui/y.tsx:1:15 (text-sm)',
    'src/routes/s.css:1:5 (font-size: 12px)',
    'src/routes/z.tsx:1:15 (text-[11px])',
  ]);
});

test('REFUSED: a size listed outside the roles with no reason, or that its file no longer writes', () => {
  const root = boardOf({ 'src/a.tsx': '<a className="text-[30px]">\n' });
  const kept = { file: 'src/a.tsx', size: 'text-[30px]', why: 'a numeral' };
  assert.deepEqual(idle(root, [kept]), []);
  assert.deepEqual(idle(root, [{ ...kept, why: ' ' }]), ['src/a.tsx (text-[30px])']);
  assert.deepEqual(idle(root, [{ ...kept, size: 'text-[22px]' }]), ['src/a.tsx (text-[22px])']);
  assert.deepEqual(idle(root, [{ ...kept, file: 'src/gone.tsx' }]), ['src/gone.tsx (text-[30px])']);
  assert.deepEqual(idle(WEB), [], 'take the entry out of OUTSIDE: its file no longer writes that size');
});

test("the board's source writes no text size by hand: a role of the theme, or a size listed outside the roles", () => {
  assert.deepEqual(sizesIn(WEB), [], TABLE);
});

test('REFUSED: mono text in a role that carries a weight: mono takes a body role whole', () => {
  assert.deepEqual(monoWeighted('<a className="font-mono text-label-small">'), ['font-mono text-label-small']);
  assert.deepEqual(monoWeighted("cn('truncate text-title-medium font-mono', x)"), ['truncate text-title-medium font-mono']);
  assert.deepEqual(monoWeighted('<a className="font-mono text-body-small uppercase">'), []);
  assert.deepEqual(monoWeighted('<a className="font-monospace text-label-small"><b className="text-label-small">'), []);
  for (const file of sources(WEB))
    assert.deepEqual(monoWeighted(fs.readFileSync(path.join(WEB, file), 'utf8')), [], `${file}: mono text takes a body role`);
});

test("the board's cn knows the theme's roles as the kit's does: a role stays beside an ink and gives way to another role", async () => {
  const { cn: ours } = await import('../src/lib/utils.ts');
  const { cn: kits } = await import('../src/components/ui/ds/utils.ts');
  const merged: [string[], string][] = [
    [['text-body-small', 'text-on-surface-variant'], 'text-body-small text-on-surface-variant'],
    [['text-on-surface', 'block text-title-small'], 'text-on-surface block text-title-small'],
    [['text-body-medium', 'text-body-small'], 'text-body-small'],
    [['text-body-small', 'leading-none'], 'text-body-small leading-none'],
    [['font-brand', 'font-plain'], 'font-plain'],
    [['rounded-lg', 'rounded-shape-full'], 'rounded-shape-full'],
    [['shadow-elevation-1', 'shadow-outline'], 'shadow-elevation-1 shadow-outline'],
  ];
  for (const [classes, kept] of merged) {
    assert.equal(ours(...classes), kept, classes.join(' '));
    assert.equal(kits(...classes), kept, `the kit's: ${classes.join(' ')}`);
  }
});

test("REFUSED: the package's own cn in the board's source: it drops a role beside an ink, and the board's keeps both", async () => {
  assert.equal(roleBlind("import { cn } from 'cn';"), true);
  assert.equal(roleBlind("import {\n  cn,\n} from\n  'cn';"), true);
  assert.equal(roleBlind("import { cn } from '@/lib/utils';"), false);
  assert.equal(roleBlind("import { createCn } from 'cn/config';"), false);
  const { cn: blind } = await import('cn');
  assert.equal(blind('text-body-medium text-foreground', 'text-muted-foreground'), 'text-muted-foreground');
  for (const file of sources(WEB))
    assert.equal(roleBlind(fs.readFileSync(path.join(WEB, file), 'utf8')), false, `${file}: import cn from @/lib/utils`);
});
