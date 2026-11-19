/**
 * The theme holds both schemes, so no story needs a picture of each: every pair of an ink and the ground the kit pairs it with
 * (`CONTRAST_PAIRS`, the kit's `tokens/design-md.mjs`) reads at `CONTRAST_THRESHOLD` (WCAG AA, 4.5:1) at least, in the light scheme
 * `theme/theme.css` writes at its root and in the dark one it writes under `prefers-color-scheme: dark`. The kit's generator checks only
 * the pairs `DESIGN.md` writes, in the scheme it writes them in, and only warns; this refuses, naming each pair, its scheme and its ratio.
 * Needs no browser: the theme is read as text, each role an `hsl()` the generator writes.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CONTRAST_PAIRS, CONTRAST_THRESHOLD } from '../src/components/ui/ds/tokens/design-md.mjs';
import { ratio, type Rgb } from './e2e/contrast.ts';

/** The theme the kit generates from `DESIGN.md`. */
const THEME = path.join(import.meta.dirname, '..', 'theme', 'theme.css');

/** Where the theme's dark scheme begins: what is before it is the light scheme's. */
const DARK = '@media (prefers-color-scheme: dark)';

/** A colour the theme writes as `hsl(<h> <s>% <l>%)`, in sRGB's channels. */
const rgbOf = (hsl: string): Rgb => {
  const parts = /^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/.exec(hsl.trim());
  if (!parts) throw new Error(`${hsl} is no hsl(h s% l%): read theme/theme.css as the kit's generator writes it, npm run theme:generate`);
  const [h, s, l] = [Number(parts[1]), Number(parts[2]) / 100, Number(parts[3]) / 100];
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return [channel(0), channel(8), channel(4)];
};

/** The colour roles a block of the theme writes, by their name after `--md-sys-color-`. */
const rolesIn = (css: string): Map<string, Rgb> =>
  new Map([...css.matchAll(/--md-sys-color-([a-z-]+):\s*(hsl\([^)]*\))\s*;/g)].map((m) => [m[1], rgbOf(m[2])]));

const css = fs.readFileSync(THEME, 'utf8');
const at = css.indexOf(DARK);
const SCHEMES = { light: rolesIn(css.slice(0, at)), dark: rolesIn(css.slice(at)) } as const;

test('the theme writes each scheme', () => {
  assert.ok(at > 0, `theme/theme.css has its dark scheme under ${DARK}`);
  for (const [scheme, roles] of Object.entries(SCHEMES)) assert.ok(roles.size > 0, `the ${scheme} scheme writes its roles`);
});

for (const scheme of ['light', 'dark'] as const)
  test(`every ink the kit pairs reads on its ground at ${CONTRAST_THRESHOLD}:1 at least, in the ${scheme} scheme`, () => {
    const roles = SCHEMES[scheme];
    const unwritten = CONTRAST_PAIRS.flat().filter((role) => !roles.has(role));
    assert.deepEqual(
      [...new Set(unwritten)],
      [],
      `roles the ${scheme} scheme does not write: regenerate the theme, npm run theme:generate`,
    );
    const under = CONTRAST_PAIRS.flatMap(([ink, ground]) => {
      const read = ratio(roles.get(ink)!, roles.get(ground)!);
      return read < CONTRAST_THRESHOLD ? [`${ink} on ${ground}: ${read.toFixed(2)}:1`] : [];
    });
    assert.deepEqual(
      under,
      [],
      `under ${CONTRAST_THRESHOLD}:1 in the ${scheme} scheme: change DESIGN.md's colours, then npm run theme:generate`,
    );
  });
