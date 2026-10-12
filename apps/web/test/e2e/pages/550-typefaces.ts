import type { Page } from 'playwright';
import { Refused } from '../checks.ts';
import type { PageSpec } from '../visit.ts';

/** The look's three faces as the board loads them: the family its package registers, and a font that asks for it. */
const FACES = [
  { family: 'Chakra Petch', font: '400 16px "Chakra Petch"' },
  { family: 'Michroma', font: '400 16px "Michroma"' },
  { family: 'Archivo Variable', font: '800 expanded 16px "Archivo Variable"' },
] as const;

/**
 * The board's typefaces: the page is set in the plain face, each of the look's three faces loads — the label face at its widest and
 * heavy — and every font file the page asked for came from the board's own origin, never a font service.
 */
async function expectTypefaces(page: Page): Promise<void> {
  const seen = await page.evaluate(async (faces) => {
    const loaded: Record<string, number> = {};
    for (const face of faces) loaded[face.family] = (await document.fonts.load(face.font, 'Run 0123')).length;
    const files = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => /\.(?:woff2?|ttf|otf)(?:\?|$)/.test(name));
    return {
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
