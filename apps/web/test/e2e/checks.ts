/**
 * What `npm run e2e` holds a page to, as functions over a Playwright page — so each can be made to
 * refuse on its own (checks.test.ts), and not only be seen to pass.
 */
import type { Locator, Page } from 'playwright';

/** How long an element has to appear. The pages read an api on this machine; slower than this is a finding. */
export const WAIT_MS = 10_000;

/** A page that is not what it must be. The message is the assertion, then what was there instead. */
export class Refused extends Error {}

/**
 * Everything a page does that it must not: a console error, an uncaught exception, a request that failed
 * or was answered 400 or worse. Listened for from before the page loads, and read with `problems()`.
 */
export function watch(page: Page): { problems: () => string[] } {
  const seen: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') seen.push(`console error: ${message.text()}`);
  });
  page.on('pageerror', (error) => seen.push(`uncaught: ${error.message}`));
  page.on('requestfailed', (request) =>
    seen.push(`request failed: ${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'no reason given'}`));
  page.on('response', (response) => {
    if (response.status() >= 400) seen.push(`request answered ${response.status()}: ${response.request().method()} ${response.url()}`);
  });
  return { problems: () => [...seen] };
}

/** The element is on the page and visible, within `timeout`. */
export async function expectVisible(locator: Locator, assertion: string, timeout = WAIT_MS): Promise<void> {
  try {
    await locator.first().waitFor({ state: 'visible', timeout });
  } catch {
    throw new Refused(`${assertion} — not visible after ${timeout} ms`);
  }
}

/** As many elements match as `count`, within `timeout`. */
export async function expectCount(locator: Locator, count: number, assertion: string, timeout = WAIT_MS): Promise<void> {
  const until = Date.now() + timeout;
  let found = await locator.count();
  while (found !== count && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    found = await locator.count();
  }
  if (found !== count) throw new Refused(`${assertion} — expected ${count}, found ${found}`);
}

/** Every element matched lies inside `frame`'s box: a node on its canvas, not hanging off the edge. */
export async function expectInside(elements: Locator, frame: Locator, assertion: string): Promise<void> {
  const box = await frame.boundingBox();
  if (!box) throw new Refused(`${assertion} — the frame is not on the page`);
  const outside: string[] = [];
  for (const [i, element] of (await elements.all()).entries()) {
    const b = await element.boundingBox();
    const name = (await element.getAttribute('data-id')) ?? `#${i + 1}`;
    // A pixel of slack for borders that round onto the frame's edge.
    const inside = b && b.x >= box.x - 1 && b.y >= box.y - 1 && b.x + b.width <= box.x + box.width + 1 && b.y + b.height <= box.y + box.height + 1;
    if (!inside) outside.push(name);
  }
  if (outside.length) throw new Refused(`${assertion} — ${outside.join(', ')} ${outside.length > 1 ? 'are' : 'is'} outside it`);
}

/**
 * Once every canvas on the page has stopped moving. React Flow animates a fit — on load, and when a panel
 * opening beside the canvas changes its width — and a screenshot or a position read mid-flight shows
 * nodes off the edge that a person, a moment later, would not see. Not an assertion: a canvas still
 * moving after `timeout` is taken as it is, and `expectInside` says what that looks like.
 */
export async function settled(page: Page, timeout = 3_000): Promise<void> {
  const transforms = () =>
    page.locator('.react-flow__viewport').evaluateAll((viewports) => viewports.map((v) => (v as HTMLElement).style.transform).join(' | '));
  const until = Date.now() + timeout;
  let last = await transforms();
  for (let still = 0; still < 3 && Date.now() < until; ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const now = await transforms();
    still = now === last ? still + 1 : 0;
    last = now;
  }
}

/**
 * The page is in the theme asked for: the browser prefers it, and the page's ground is dark in the dark
 * and light in the light. Without the second half, both screenshots of a page could be the same picture.
 */
export async function expectTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  const seen = await page.evaluate(() => {
    const color = getComputedStyle(document.body).backgroundColor;
    // Painted onto a pixel, so a colour in any space (Tailwind's are oklch) reads back as sRGB.
    const pixel = document.createElement('canvas').getContext('2d')!;
    pixel.fillStyle = color;
    pixel.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data;
    // A ground nobody painted is the browser's white.
    const luminance = a === 0 ? 1 : (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return { color, luminance, prefersDark: matchMedia('(prefers-color-scheme: dark)').matches };
  });
  if (seen.prefersDark !== (theme === 'dark')) {
    throw new Refused(`the browser prefers ${theme} — it prefers ${seen.prefersDark ? 'dark' : 'light'}`);
  }
  if (seen.luminance < 0.5 !== (theme === 'dark')) {
    throw new Refused(`the page is ${theme} — its background is ${seen.color}, which is not`);
  }
}
