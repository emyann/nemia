/**
 * The look's four meanings are written by hand beside the theme (`src/styles.css`, `--meaning-*`), since the kit's generator reads
 * Material's roles and no colour of the board's own: this holds them to the rulebook. Each meaning's colour, its ink, its container and
 * the container's ink equal the table of `DESIGN.md` (*The four meanings*) in the light scheme, written at the stylesheet's root, and in
 * the dark one, written under `prefers-color-scheme: dark`; `failure` may be Material's error, read through the theme
 * (`theme/theme.css`), within the rounding of the `hsl()` the generator writes. The names are the four meanings' roles and rest's tint
 * `sage`: a cost is no meaning, and drawn in ink. Each ink reads at 4.5:1 on
 * its fill, and each meaning's colour, as the ink of a word on a neutral surface, on every rung of the ladder, in both schemes. Needs
 * no browser: both files are read as text.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ratio, type Rgb } from './e2e/contrast.ts';

const WEB = path.resolve(import.meta.dirname, '..');

/** The schemes, the dark one opening at this line in both the theme and the stylesheet. */
const DARK = '@media (prefers-color-scheme: dark)';

/**
 * Where a stylesheet's dark meanings open: the dark media query around a `:root` block, never the `dark` variant that names the same
 * query above it.
 */
const DARK_ROOT = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{/;

/** WCAG AA for text. */
const THRESHOLD = 4.5;

/** The four meanings. */
const MEANINGS = ['yours', 'alive', 'failure', 'rest'] as const;

/** The roles a meaning has: its colour, the ink on it, its container and the ink on that; rest has the first two. */
const ROLES = ['', 'on-', '-container', 'on--container'] as const;

/** The variables beside the four meanings' roles: rest's tint. */
const BESIDE = ['sage', 'on-sage'];

/** The ladder's rungs (DESIGN.md, *Neutrals: the surface ladder*), on which a meaning's colour is read as a word's ink. */
const RUNGS = [
  'background',
  'surface-container-lowest',
  'surface-container-low',
  'surface-container',
  'surface-container-high',
  'surface-container-highest',
];

/** How far, per channel of 255, a role read through the theme's `hsl()` may stand from the table's hex. */
const ROUNDING = 3;

type Scheme = 'light' | 'dark';

/** A meaning's role's variable name after `--meaning-`. */
const nameOf = (meaning: string, role: (typeof ROLES)[number]) =>
  role === 'on--container' ? `on-${meaning}-container` : role === 'on-' ? `on-${meaning}` : `${meaning}${role}`;

/** A hex colour's channels. */
const hexRgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return [r, g, b] satisfies Rgb;
};

/** An `hsl(h s% l%)` the kit's generator writes, in sRGB's channels. */
const hslRgb = (hsl: string) => {
  const parts = /^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/.exec(hsl.trim());
  if (!parts) throw new Error(`${hsl} is no hsl(h s% l%): regenerate the theme, npm run theme:generate`);
  const [h, s, l] = [Number(parts[1]), Number(parts[2]) / 100, Number(parts[3]) / 100];
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return [channel(0), channel(8), channel(4)] satisfies Rgb;
};

/**
 * The table of the meanings a rulebook writes, by scheme then variable name: each row's cell, `` `#hex`, ink `#hex` `` with
 * `` ; container `#hex`, ink `#hex` `` after it where the meaning has a container.
 * @param design The text of a `DESIGN.md`.
 */
export function tableOf(design: string) {
  const table: Record<Scheme, Map<string, string>> = { light: new Map(), dark: new Map() };
  for (const row of design.matchAll(/^\|\s*`([a-z]+)`\s*\|[^|]*\|([^|]*)\|([^|]*)\|\s*$/gm)) {
    const [, meaning, dark, light] = row;
    for (const [scheme, cell] of [
      ['dark', dark],
      ['light', light],
    ] as const) {
      const hexes = [...cell.matchAll(/`(#[0-9a-fA-F]{6})`/g)].map((m) => m[1].toLowerCase());
      if (hexes.length === 0) continue;
      hexes.forEach((hex, i) => table[scheme].set(nameOf(meaning, ROLES[i]), hex));
    }
  }
  return table;
}

/**
 * The `--meaning-*` variables a stylesheet writes, by scheme: what it writes before the dark scheme's media query, and what it writes
 * in it, each a value as written.
 * @param css The text of the stylesheet.
 */
export function writtenOf(css: string) {
  const at = css.search(DARK_ROOT);
  const read = (part: string) => new Map([...part.matchAll(/--meaning-([a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  return { light: read(at < 0 ? css : css.slice(0, at)), dark: read(at < 0 ? '' : css.slice(at)) } satisfies Record<
    Scheme,
    Map<string, string>
  >;
}

/**
 * Where the written meanings stand from the table, as `scheme name: written, table`: a value missing on either side, or another
 * colour; a hex is compared as written, and a value read from the theme's role within `ROUNDING`.
 * @param table The rulebook's table, by scheme.
 * @param written The stylesheet's meanings, by scheme; a dark scheme that leaves one unwritten keeps the light one's value.
 * @param theme The theme's roles, by scheme, each in sRGB.
 */
export function apartFrom(
  table: Record<Scheme, Map<string, string>>,
  written: Record<Scheme, Map<string, string>>,
  theme: Record<Scheme, Map<string, Rgb>>,
) {
  return (['light', 'dark'] as const).flatMap((scheme) =>
    [...table[scheme]].flatMap(([name, hex]) => {
      const value = written[scheme].get(name) ?? written.light.get(name);
      const colour = value === undefined || value.startsWith('#') ? undefined : colourOf(value, theme[scheme]);
      const want = hexRgb(hex);
      const same =
        value?.toLowerCase() === hex || (colour !== undefined && colour.every((channel, i) => Math.abs(channel - want[i]) <= ROUNDING));
      return same ? [] : [`${scheme} ${name}: ${value ?? 'unwritten'}, ${hex}`];
    }),
  );
}

/** A meaning's value in sRGB: a hex, or a role of the theme read through `var(--md-sys-color-…)`; none for anything else. */
const colourOf = (value: string, roles: Map<string, Rgb>) => {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return hexRgb(value);
  const role = /^var\(\s*--md-sys-color-([a-z-]+)\s*\)$/.exec(value)?.[1];
  return (role === undefined ? undefined : roles.get(role)) satisfies Rgb | undefined;
};

/** The theme's colour roles by scheme. */
const themeOf = (css: string) => {
  const at = css.indexOf(DARK);
  const roles = (part: string) =>
    new Map([...part.matchAll(/--md-sys-color-([a-z-]+):\s*(hsl\([^)]*\))\s*;/g)].map((m) => [m[1], hslRgb(m[2])]));
  return { light: roles(css.slice(0, at)), dark: roles(css.slice(at)) } satisfies Record<Scheme, Map<string, Rgb>>;
};

const design = fs.readFileSync(path.join(WEB, 'DESIGN.md'), 'utf8');
const styles = fs.readFileSync(path.join(WEB, 'src/styles.css'), 'utf8');
const THEME = themeOf(fs.readFileSync(path.join(WEB, 'theme/theme.css'), 'utf8'));
const TABLE = tableOf(design);
const WRITTEN = writtenOf(styles);

test('REFUSED: a stylesheet that writes a meaning at another value than the table, or leaves one unwritten, names it and its scheme', () => {
  const table = tableOf(
    [
      '| Meaning | Says | Dark | Light |',
      '| :--- | :--- | :--- | :--- |',
      '| `alive` | at work | `#c4a8ff`, ink `#0c1416`; container `#45218a`, ink `#e9ddff` | `#7732d9`, ink `#ffffff`; container `#ecdcff`, ink `#5e00c1` |',
      '| `rest` | over | `#a9aaa8`, ink `#0d0d0d` | `#2f3031`, ink `#f2f0f1` |',
    ].join('\n'),
  );
  assert.equal(table.dark.get('alive-container'), '#45218a');
  assert.equal(table.light.get('on-alive-container'), '#5e00c1');
  assert.equal(table.dark.has('rest-container'), false, 'rest has no container');
  const roles = { light: new Map<string, Rgb>([['error', [181, 36, 47]]]), dark: new Map<string, Rgb>() };
  const css = [
    ':root {',
    '  --meaning-alive: #7732d9; --meaning-on-alive: #ffffff; --meaning-alive-container: #ecdcff;',
    '  --meaning-on-alive-container: #5e00c1; --meaning-rest: var(--md-sys-color-error); --meaning-on-rest: #f2f0f1;',
    '}',
    DARK,
    '{ :root { --meaning-alive: #c4a8ff; --meaning-on-alive: #0c1416; --meaning-alive-container: #45218b;',
    '  --meaning-on-alive-container: #e9ddff; --meaning-rest: #a9aaa8; } }',
  ].join('\n');
  assert.deepEqual(apartFrom(table, writtenOf(css), roles), [
    'light rest: var(--md-sys-color-error), #2f3031',
    'dark alive-container: #45218b, #45218a',
    'dark on-rest: #f2f0f1, #0d0d0d',
  ]);
  const near = { light: new Map<string, Rgb>([['x', [0x2f + 2, 0x30, 0x31 - 3]]]), dark: new Map<string, Rgb>() };
  const rest = new Map([['rest', '#2f3031']]);
  assert.deepEqual(apartFrom({ light: rest, dark: new Map() }, writtenOf('--meaning-rest: var(--md-sys-color-x);'), near), []);
});

test("the rulebook's table names the four meanings, each with its roles, in both schemes", () => {
  for (const scheme of ['light', 'dark'] as const)
    assert.deepEqual(
      [...TABLE[scheme].keys()].sort(),
      MEANINGS.flatMap((meaning) => (meaning === 'rest' ? ROLES.slice(0, 2) : ROLES).map((role) => nameOf(meaning, role))).sort(),
      `DESIGN.md's table of the four meanings, the ${scheme} column`,
    );
});

test("the stylesheet writes each meaning at the rulebook's value, in light and in dark", () => {
  assert.ok(DARK_ROOT.test(styles), `src/styles.css writes the dark meanings under ${DARK}, in a :root block`);
  assert.deepEqual(
    apartFrom(TABLE, WRITTEN, THEME),
    [],
    "write DESIGN.md's value in src/styles.css's --meaning-*, light at :root, dark below",
  );
});

test("the meanings are the four and rest's tint, each written once a scheme", () => {
  const four = MEANINGS.flatMap((meaning) => (meaning === 'rest' ? ROLES.slice(0, 2) : ROLES).map((role) => nameOf(meaning, role)));
  assert.deepEqual([...WRITTEN.light.keys()].sort(), [...four, ...BESIDE].sort(), 'the light scheme, at the root');
  assert.deepEqual(
    [...WRITTEN.dark.keys()].filter((name) => !four.includes(name) && !BESIDE.includes(name)),
    [],
    'the dark scheme writes no other meaning',
  );
  for (const name of [...four, ...BESIDE])
    assert.ok(styles.split(`--meaning-${name}:`).length - 1 <= 2, `--meaning-${name} is written once in light and at most once in dark`);
});

for (const scheme of ['light', 'dark'] as const)
  test(`each meaning's ink reads on its fill, and each meaning on every rung, at ${THRESHOLD}:1 at least, in the ${scheme} scheme`, () => {
    const colour = (name: string) => colourOf(WRITTEN[scheme].get(name) ?? WRITTEN.light.get(name) ?? '', THEME[scheme]);
    const under = MEANINGS.flatMap((meaning) => {
      const pairs: [string, string][] = [[nameOf(meaning, 'on-'), meaning]];
      if (meaning !== 'rest') pairs.push([nameOf(meaning, 'on--container'), nameOf(meaning, '-container')]);
      const onFills = pairs.map(([ink, fill]) => [ink, fill, ratio(colour(ink)!, colour(fill)!)] as const);
      const onRungs = RUNGS.map((rung) => [meaning, rung, ratio(colour(meaning)!, THEME[scheme].get(rung)!)] as const);
      return [...onFills, ...onRungs]
        .filter(([, , read]) => read < THRESHOLD)
        .map(([ink, fill, read]) => `${ink} on ${fill}: ${read.toFixed(2)}:1`);
    });
    assert.deepEqual(under, [], `under ${THRESHOLD}:1 in the ${scheme} scheme: say it to the person who owns DESIGN.md's values`);
  });
