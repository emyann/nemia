import type { Page } from 'playwright';
import { Refused } from '../checks.ts';
import type { PageSpec } from '../visit.ts';

/** The look's four faces as the board loads them: the family its package registers, and a font that asks for it. */
const FACES = [
  { family: 'Chakra Petch', font: '400 16px "Chakra Petch"' },
  { family: 'Michroma', font: '400 16px "Michroma"' },
  { family: 'Share Tech Mono', font: '400 16px "Share Tech Mono"' },
  { family: 'Archivo Variable', font: '800 expanded 16px "Archivo Variable"' },
] as const;

/**
 * The board's typefaces: the page is set in the plain face, each of the look's four faces loads — the label face at its widest and
 * heavy — mono text, by the `font-mono` class or in a `code` element, is set in the mono face, and every font file the page asked for
 * came from the board's own origin, never a font service.
 */
async function expectTypefaces(page: Page): Promise<void> {
  const seen = await page.evaluate(async (faces) => {
    const loaded: Record<string, number> = {};
    for (const face of faces) loaded[face.family] = (await document.fonts.load(face.font, 'Run 0123')).length;
    const files = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => /\.(?:woff2?|ttf|otf)(?:\?|$)/.test(name));
    const monoOf = (tag: string, className: string): string => {
      const probe = document.body.appendChild(Object.assign(document.createElement(tag), { className }));
      const family = getComputedStyle(probe).fontFamily;
      probe.remove();
      return family;
    };
    return {
      mono: { 'a font-mono class': monoOf('span', 'font-mono'), 'a code element': monoOf('code', '') },
      body: getComputedStyle(document.body).fontFamily,
      label: getComputedStyle(document.documentElement).getPropertyValue('--font-label'),
      loaded,
      files,
      elsewhere: files.filter((name) => new URL(name).origin !== location.origin),
    };
  }, FACES);
  if (!/^"?Chakra Petch"?,/.test(seen.body))
    throw new Refused(`the page is set in the plain face, Chakra Petch — it is set in ${seen.body}`);
  if (!/^\s*['"]Archivo Variable['"],/.test(seen.label))
    throw new Refused(`the label face is Archivo Variable (--font-label) — it is ${seen.label || 'not set'}`);
  for (const [what, family] of Object.entries(seen.mono))
    if (!/^"?Share Tech Mono"?,/.test(family))
      throw new Refused(`${what} is set in the mono face, Share Tech Mono — it is set in ${family}`);
  for (const { family } of FACES)
    if (!seen.loaded[family]) throw new Refused(`${family} loads — the page has no face of that family to load`);
  if (seen.files.length < FACES.length)
    throw new Refused(`each of the ${FACES.length} faces is a file the page fetched — it fetched ${seen.files.join(', ') || 'none'}`);
  if (seen.elsewhere.length)
    throw new Refused(
      `every font file comes from the board's own origin — ${seen.elsewhere.join(', ')} ${seen.elsewhere.length > 1 ? 'do' : 'does'} not`,
    );
}

export default { name: 'typefaces', route: '/', expect: expectTypefaces } satisfies PageSpec;
