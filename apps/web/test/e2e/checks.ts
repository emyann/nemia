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

/**
 * The image is drawn, within `timeout`: visible, loaded, and with pixels. A broken image's box is visible all the same, so
 * `expectVisible` alone passes an image whose request failed.
 */
export async function expectDrawn(image: Locator, assertion: string, timeout = WAIT_MS): Promise<void> {
  const until = Date.now() + timeout;
  await expectVisible(image, assertion, timeout);
  const drawn = () => image.first().evaluate((element) => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0);
  let ok = await drawn();
  while (!ok && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    ok = await drawn();
  }
  if (!ok) throw new Refused(`${assertion} — the image did not load: no pixels after ${timeout} ms`);
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

/** The elements matched read `texts`, one each and in that order, within `timeout`: a menu's places, the first one first. */
export async function expectTexts(locator: Locator, texts: readonly string[], assertion: string, timeout = WAIT_MS): Promise<void> {
  await until(async () => {
    const found = (await locator.allTextContents()).map((text) => text.trim());
    if (found.length === texts.length && found.every((text, i) => text === texts[i])) return null;
    return `expected ${texts.join(', ')}, found ${found.length ? found.join(', ') : 'nothing'}`;
  }, assertion, timeout);
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

type Boxed = { name: string; box: { x: number; y: number; width: number; height: number } | null };

/** Each element matched, by its `data-id` (else its place), and where it is on the page. */
const boxesOf = async (elements: Locator): Promise<Boxed[]> =>
  Promise.all((await elements.all()).map(async (element, i) => ({ name: (await element.getAttribute('data-id')) ?? `#${i + 1}`, box: await element.boundingBox() })));

/**
 * No element of `these` overlaps one of `those`, within `timeout`: a card moved out from under a graph, not
 * left beneath it. Polled, because the floor is laid out again a render after whatever moved it. Nothing
 * matched on either side is refused too: an overlap between nothing and something proves nothing.
 */
export async function expectApart(these: Locator, those: Locator, assertion: string, timeout = WAIT_MS): Promise<void> {
  const problem = async (): Promise<string | null> => {
    const [a, b] = await Promise.all([boxesOf(these), boxesOf(those)]);
    if (!a.length || !b.length) return `nothing to compare: ${a.length} and ${b.length} found`;
    const over = a.flatMap((one) =>
      b.filter((other) => one.box && other.box && one.box.x < other.box.x + other.box.width && other.box.x < one.box.x + one.box.width
        && one.box.y < other.box.y + other.box.height && other.box.y < one.box.y + one.box.height).map((other) => `${one.name} and ${other.name}`));
    return over.length ? `${over.join(', ')} overlap` : null;
  };
  const until = Date.now() + timeout;
  let found = await problem();
  while (found && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    found = await problem();
  }
  if (found) throw new Refused(`${assertion} — ${found}`);
}

/**
 * Every element matched shows its text whole: none is cut short by the room it was given (`truncate`, an ellipsis), within `timeout`.
 * Nothing matched is refused too.
 */
export async function expectUncut(elements: Locator, assertion: string, timeout = WAIT_MS): Promise<void> {
  await until(async () => {
    const cut = await elements.evaluateAll((all) =>
      all.flatMap((element, i) => ((element as HTMLElement).scrollWidth > (element as HTMLElement).clientWidth + 1 ? [(element as HTMLElement).dataset.id ?? element.textContent ?? `#${i + 1}`] : [])));
    const found = await elements.count();
    if (!found) return 'nothing to look at: 0 found';
    return cut.length ? `${cut.join(', ')} ${cut.length > 1 ? 'are' : 'is'} cut short` : null;
  }, assertion, timeout);
}

/** Polls `problem` until it says none or `timeout` passes, and refuses with what it said last: for a floor laid out a render after what moved it. */
async function until(problem: () => Promise<string | null>, assertion: string, timeout: number): Promise<void> {
  const end = Date.now() + timeout;
  let found = await problem();
  while (found && Date.now() < end) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    found = await problem();
  }
  if (found) throw new Refused(`${assertion} — ${found}`);
}

/**
 * Every element of `left` ends left of where every element of `right` begins, within `timeout`: a card left of each card that waits on
 * it. Nothing matched on either side is refused too.
 */
export async function expectLeftOf(left: Locator, right: Locator, assertion: string, timeout = WAIT_MS): Promise<void> {
  await until(async () => {
    const [a, b] = await Promise.all([boxesOf(left), boxesOf(right)]);
    if (!a.length || !b.length) return `nothing to compare: ${a.length} and ${b.length} found`;
    const wrong = a.flatMap((one) => b.filter((other) => !one.box || !other.box || one.box.x + one.box.width > other.box.x).map((other) => `${one.name} does not end left of ${other.name}`));
    return wrong.length ? wrong.join(', ') : null;
  }, assertion, timeout);
}

/**
 * The vertical middle of every element of `middle` lies strictly between the middles of `one` and `other`, within `timeout`: a card level
 * with the middle of the two it is joined to, as a diamond's top and bottom are with its sides. Nothing matched is refused too.
 */
export async function expectBetween(middle: Locator, one: Locator, other: Locator, assertion: string, timeout = WAIT_MS): Promise<void> {
  const centre = (b: Boxed) => (b.box ? b.box.y + b.box.height / 2 : Number.NaN);
  await until(async () => {
    const [m, [o] = [], [p] = []] = await Promise.all([boxesOf(middle), boxesOf(one), boxesOf(other)]);
    const counts = [m.length, o ? 1 : 0, p ? 1 : 0];
    if (!m.length || !o || !p) return `nothing to compare: ${counts[0]}, ${counts[1]} and ${counts[2]} found`;
    const [top, bottom] = [Math.min(centre(o), centre(p)), Math.max(centre(o), centre(p))];
    const wrong = m.filter((b) => !(top < centre(b) && centre(b) < bottom)).map((b) => `${b.name} is not between ${o.name} and ${p.name}`);
    return wrong.length ? wrong.join(', ') : null;
  }, assertion, timeout);
}

/**
 * Every element of `these` runs beneath every element of `row`: it reaches lower than the lowest of them, and rises no
 * higher than the middle of any — a loop's edge back curved under its steps, not over them or through them. Nothing
 * matched on either side is refused too.
 */
export async function expectBeneath(these: Locator, row: Locator, assertion: string): Promise<void> {
  const [under, over] = await Promise.all([boxesOf(these), boxesOf(row)]);
  if (!under.length || !over.length) throw new Refused(`${assertion} — nothing to compare: ${under.length} and ${over.length} found`);
  const problems = under.flatMap(({ name, box }) => {
    if (!box) return [`${name} is not on the page`];
    return over.flatMap((other) => {
      if (!other.box) return [`${other.name} is not on the page`];
      if (box.y + box.height <= other.box.y + other.box.height) return [`${name} reaches no lower than ${other.name}`];
      if (box.y < other.box.y + other.box.height / 2) return [`${name} rises above the middle of ${other.name}`];
      return [];
    });
  });
  if (problems.length) throw new Refused(`${assertion} — ${problems.join(', ')}`);
}

/**
 * While `move` runs, `leader` moves, and every element of `followers` moves by as much: an open run's steps
 * dragged with its card. A pixel of slack for positions that round differently.
 */
export async function expectMovedWith(followers: Locator, leader: Locator, move: () => Promise<void>, assertion: string): Promise<void> {
  const [lead] = await boxesOf(leader);
  const before = await boxesOf(followers);
  await move();
  const [led] = await boxesOf(leader);
  const after = new Map((await boxesOf(followers)).map(({ name, box }) => [name, box]));
  if (!lead?.box || !led?.box) throw new Refused(`${assertion} — the element to follow is not on the page`);
  if (!before.length) throw new Refused(`${assertion} — nothing follows ${lead.name}`);
  const dx = led.box.x - lead.box.x;
  const dy = led.box.y - lead.box.y;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) throw new Refused(`${assertion} — ${lead.name} did not move`);
  const behind = before.filter(({ name, box }) => {
    const now = after.get(name);
    return !box || !now || Math.abs(now.x - box.x - dx) > 1 || Math.abs(now.y - box.y - dy) > 1;
  });
  if (behind.length) throw new Refused(`${assertion} — ${behind.map((f) => f.name).join(', ')} did not move with ${lead.name}`);
}
