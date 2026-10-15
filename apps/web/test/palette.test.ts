/**
 * The board's source names no colour of Tailwind's palette and writes no raw colour (a hex, `rgb()`, `oklch()` and their kin) outside a
 * comment: a ground, an outline or an ink reads a role of the theme, and a hue one of the look's five meanings (`src/lib/meaning.ts`,
 * `src/styles.css`), so one class serves both schemes. The vendored kit (`src/components/ui/ds`) is another repository's and stays out,
 * and nothing else does; the few raw colours no role gives are `KEPT`, each in its file alone, with its reason.
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

/** The files of `root`'s `src` the colour guards read: every `.ts`, `.tsx` and `.css` outside the kit, as its path from `root`. */
function sources(root: string): string[] {
  return fs
    .readdirSync(path.join(root, 'src'), { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.(ts|tsx|css)$/.test(e.name))
    .map((e) => path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
    .filter((file) => !file.startsWith(`${KIT}/`))
    .sort();
}

/** Every file of `root`'s `src` outside the kit that names a palette colour, as its path from `root` and where. */
export function paletteIn(root: string): string[] {
  return sources(root).flatMap((file) => {
    const at = paletteAt(fs.readFileSync(path.join(root, file), 'utf8'));
    return at ? [`${file}:${at}`] : [];
  });
}

/**
 * The forms of a raw colour, each a family: a hex of 3, 4, 6 or 8 digits, percent-encoded in a data URI too, never an entity, a private
 * field or a longer hash; and a colour function, a relative one included, never `color-mix(`, which mixes roles, nor a method.
 */
export const RAW: Record<string, RegExp> = {
  hex: /(?:(?<![\w&.$#-])#|%23)(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g,
  notation: /(?<![\w.$-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/g,
};

/** `text` with each comment that opens its line, `//` to its end or `/*` to its close, written as spaces, so every place holds. */
export function codeOf(text: string): string {
  const blank = (comment: string): string => comment.replace(/[^\n]/g, ' ');
  return text.replace(/^([ \t]*)(\/\*[\s\S]*?\*\/|\/\/[^\n]*)/gm, (_, indent: string, comment: string) => indent + blank(comment));
}

/** The colour that starts at `index` of `code`: a hex as found, a function to its closing bracket on its line. */
function colourAt(code: string, index: number, found: string): string {
  if (!found.endsWith('(')) return found;
  let depth = 0;
  for (let i = index; i < code.length && code[i] !== '\n'; i++) {
    if (code[i] === '(') depth++;
    else if (code[i] === ')' && --depth === 0) return code.slice(index, i + 1);
  }
  return found;
}

/** Every raw colour written outside a comment of `text`, in the order written, by the `families` given (all of them unless told). */
export function rawAt(text: string, families: Record<string, RegExp> = RAW): { colour: string; at: string }[] {
  const code = codeOf(text);
  return Object.values(families)
    .flatMap((family) => [...code.matchAll(family)])
    .sort((a, b) => a.index - b.index)
    .map((m) => {
      const before = code.slice(0, m.index).split('\n');
      return { colour: colourAt(code, m.index, m[0]), at: `${before.length}:${before.at(-1)!.length + 1}` };
    });
}

/** A raw colour kept: the file that writes it, from the board's root, the colour whole, and why no role gives it. */
export interface Kept {
  file: string;
  colour: string;
  why: string;
}

const TINTED =
  "a message said while the session ran is drawn in a pale tone of yours, hand-picked per scheme; which role it takes is the owner's " +
  "look to choose (yours' container recommended)";

/** The raw colours no role gives yet, each valid in its file alone. */
export const KEPT: Kept[] = [
  { file: 'src/components/ui/bubble.tsx', colour: 'oklch(from_var(--primary)_0.93_calc(c*0.4)_h)', why: TINTED },
  { file: 'src/components/ui/bubble.tsx', colour: 'oklch(from_var(--primary)_0.3_calc(c*0.4)_h)', why: TINTED },
  { file: 'src/components/ui/bubble.tsx', colour: 'oklch(from_var(--primary)_0.88_calc(c*0.5)_h)', why: TINTED },
  { file: 'src/components/ui/bubble.tsx', colour: 'oklch(from_var(--primary)_0.35_calc(c*0.5)_h)', why: TINTED },
];

/** Every raw colour in `root`'s `src` outside the kit that `kept` does not list for its file, as `file:line:column (colour)`. */
export function rawIn(root: string, kept: Kept[] = KEPT): string[] {
  return sources(root).flatMap((file) =>
    rawAt(fs.readFileSync(path.join(root, file), 'utf8'))
      .filter(({ colour }) => !kept.some((k) => k.file === file && k.colour === colour))
      .map(({ colour, at }) => `${file}:${at} (${colour})`),
  );
}

/** The entries of `kept` that hold nothing: no reason given, or a colour its file under `root` no longer writes. */
export function idle(root: string, kept: Kept[] = KEPT): string[] {
  return kept
    .filter(({ file, colour, why }) => {
      const at = path.join(root, file);
      return !why.trim() || !fs.existsSync(at) || !rawAt(fs.readFileSync(at, 'utf8')).some((found) => found.colour === colour);
    })
    .map(({ file, colour }) => `${file} (${colour})`);
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

/** Each form of a raw colour, as written in a line of the board, the colour found and the family that alone finds it. */
const RAW_REFUSED: [string, string, string][] = [
  ['<a className="bg-[#fff]">', '#fff', 'hex'],
  ['<a className="bg-[#ffffff80]">', '#ffffff80', 'hex'],
  ['<a className="text-[#1A2B3C]">', '#1A2B3C', 'hex'],
  ["<a style={{ color: '#abcd' }}>", '#abcd', 'hex'],
  ['<path fill="#000" />', '#000', 'hex'],
  ['a { color: var(--x, #fff); }', '#fff', 'hex'],
  ['a { background: color-mix(in srgb, #fff 5%, transparent); }', '#fff', 'hex'],
  ["url(\"data:image/svg+xml,<svg fill=%22%23000%22/>\")", '%23000', 'hex'],
  ['a { color: #fff; }', '#fff', 'hex'],
  ['<stop stopColor="rgb(0 0 0)" />', 'rgb(0 0 0)', 'notation'],
  ['<a className="bg-[rgb(0_0_0)]">', 'rgb(0_0_0)', 'notation'],
  ['a { color: rgba(0, 0, 0, 0.5); }', 'rgba(0, 0, 0, 0.5)', 'notation'],
  ['a { color: hsl(210 40% 50%); }', 'hsl(210 40% 50%)', 'notation'],
  ['a { color: hsla(210, 40%, 50%, 0.5); }', 'hsla(210, 40%, 50%, 0.5)', 'notation'],
  ['a { color: hwb(0 0% 0%); }', 'hwb(0 0% 0%)', 'notation'],
  ['a { color: lab(50% 0 0); }', 'lab(50% 0 0)', 'notation'],
  ['a { color: lch(50% 0 0); }', 'lch(50% 0 0)', 'notation'],
  ['a { color: oklab(0.5 0 0); }', 'oklab(0.5 0 0)', 'notation'],
  ['  --chart-1: oklch(0.87 0 0);', 'oklch(0.87 0 0)', 'notation'],
  ['<a className="bg-[oklch(from_var(--primary)_0.93_calc(c*0.4)_h)]">', 'oklch(from_var(--primary)_0.93_calc(c*0.4)_h)', 'notation'],
  ['a { color: color(display-p3 1 0 0); }', 'color(display-p3 1 0 0)', 'notation'],
];

/** Text that names no raw colour as code: a role, a mix of roles, a fragment, an entity, a field, a hash of another length, prose. */
const RAW_SPARED = [
  'a { background: color-mix(in srgb, var(--meaning-alive) 45%, transparent); }',
  '<a className="hover:bg-[color-mix(in_oklch,var(--muted),var(--foreground)_5%)]">',
  '<a className="bg-transparent fill-[currentColor] text-[color:var(--x)]">',
  '  --xy-background-color: var(--md-sys-color-background);',
  '<a href="#runs">',
  '&#123;',
  'this.#cafe = 1;',
  'url(%23n)',
  'a #12345 and a #ff00ff00ff',
  'a { background-color: var(--bar-ink); }',
  'x.rgb(1, 2, 3)',
  '/** a #fff or rgb(0 0 0) in prose */',
  '// oklch(0.5 0 0)',
  '  // a #000 said in a comment',
  '/*\n * #000\n */',
  '/**\n * #fff\n * rgb(0 0 0)\n */',
];

test('REFUSED: a raw colour is found, where it is, in any form; a role, a mix of roles and prose that names one are not', () => {
  for (const [written, colour] of RAW_REFUSED)
    assert.deepEqual(rawAt(`ok\n${written}`), [{ colour, at: `2:${written.indexOf(colour) + 1}` }], written);
  for (const spared of RAW_SPARED) assert.deepEqual(rawAt(spared), [], spared);
  assert.deepEqual(rawAt("/**\n * #fff\n */\nconst a = '#000';"), [{ colour: '#000', at: '4:12' }]);
});

test('every raw family is needed: the rule built without one finds nothing of what that family alone refuses', () => {
  assert.deepEqual(Object.keys(RAW).sort(), [...new Set(RAW_REFUSED.map(([, , family]) => family))].sort());
  for (const name of Object.keys(RAW)) {
    const rest = Object.fromEntries(Object.entries(RAW).filter(([family]) => family !== name));
    for (const [written, , family] of RAW_REFUSED)
      assert.equal(rawAt(written, rest).length, family === name ? 0 : 1, `${written} without ${name}`);
  }
});

/** A board's root in a scratch folder, holding each of `files` by its path from that root. */
function boardOf(files: Record<string, string>): string {
  const root = scratch('palette-');
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
  return root;
}

test('REFUSED: a raw colour in any file of src, a stylesheet and a story included; the kit and test/ stay out, a kept colour in its file alone', () => {
  const root = boardOf({
    [`${KIT}/x.tsx`]: '<a className="bg-[#fff]">\n',
    'src/components/ui/y.tsx': '<a className="bg-[#fff]">\n',
    'src/routes/z.css': 'a { color: rgb(0 0 0) }\n',
    'src/components/look/A.stories.tsx': "<a style={{ color: '#000' }}>\n",
    'src/components/k.tsx': '<a className="bg-[#123]">\n',
    'src/components/ui/bubble.tsx': '<a className="bg-[#123]">\n',
    'test/x.test.ts': "assert.equal(c, '#fff');\n",
    'src/lib/clean.ts': 'export const a = "bg-card";\n',
  });
  const kept = [{ file: 'src/components/ui/bubble.tsx', colour: '#123', why: 'a reason' }];
  assert.deepEqual(rawIn(root, kept), [
    'src/components/k.tsx:1:19 (#123)',
    'src/components/look/A.stories.tsx:1:21 (#000)',
    'src/components/ui/y.tsx:1:19 (#fff)',
    'src/routes/z.css:1:12 (rgb(0 0 0))',
  ]);
});

test('REFUSED: a raw colour kept with no reason, or that its file no longer writes', () => {
  const root = boardOf({ 'src/a.tsx': '<a className="bg-[#123]">\n' });
  const kept = { file: 'src/a.tsx', colour: '#123', why: 'a reason' };
  assert.deepEqual(idle(root, [kept]), []);
  assert.deepEqual(idle(root, [{ ...kept, why: ' ' }]), ['src/a.tsx (#123)']);
  assert.deepEqual(idle(root, [{ ...kept, colour: '#456' }]), ['src/a.tsx (#456)']);
  assert.deepEqual(idle(root, [{ ...kept, file: 'src/gone.tsx' }]), ['src/gone.tsx (#123)']);
  assert.deepEqual(idle(WEB), [], 'take the entry out of KEPT: its file no longer writes that colour');
});

test("the board's source writes no raw colour: a role of the theme, or a colour kept with its reason", () => {
  assert.deepEqual(
    rawIn(WEB),
    [],
    "give each a role of the theme (bg-card, border-outline), a meaning's form of src/lib/meaning.ts, or paint for an SVG",
  );
});
