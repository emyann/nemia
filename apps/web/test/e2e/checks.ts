/**
 * What `npm run e2e` holds a page to, as functions over a Playwright page — so each can be made to
 * refuse on its own (checks.test.ts), and not only be seen to pass.
 */
import type { Locator, Page, Request } from 'playwright';

/** `text` as a regular expression that matches it and nothing else. */
export const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** How long an element has to appear. The pages read an api on this machine; slower than this is a finding. */
export const WAIT_MS = 10_000;

/** A page that is not what it must be. The message is the assertion, then what was there instead. */
export class Refused extends Error {}

/**
 * The workflow feed's stream, which the board may hold open from its root for as long as a page is open: never answered in full, so a
 * network that waits for it never idles (`idle` does not), and aborted by the browser whenever the page itself goes (`watch` lets that
 * one abort pass).
 */
export const FEED_STREAM = '/api/feed/stream';
const isFeedStream = (request: Request): boolean => new URL(request.url()).pathname === FEED_STREAM;

/** A page's requests in flight, the feed's stream left out; when one last started or ended; whether the feed's stream answered. */
type Flights = { open: Set<Request>; last: number; fed: boolean };
const flights = new WeakMap<Page, Flights>();

/**
 * Counts `page`'s requests in flight from now on, once however often it is called: from before a page loads, by `watch` and for every page
 * visit.ts opens, so a request begun before `idle` is called is counted. A page `idle` is the first to track counts from then.
 *
 * A page that navigates or reloads leaves its requests in flight behind, and Playwright (1.62) says nothing more of them: no
 * `requestfinished`, no `requestfailed`. So once the page's own navigation has committed, every request in flight but that navigation's is
 * let go — those the old document asked for while the navigation was on its way too, as its polls may — which is what Playwright's own
 * `networkidle` does at a commit. The new document asks for nothing before its commit. A same-document navigation (`history.pushState`)
 * asks for nothing, and lets nothing go. It also notes when the feed's stream answers its headers, forgotten at each such commit, for
 * `feedAnswered`.
 */
export function track(page: Page): void {
  if (flights.has(page)) return;
  const f: Flights = { open: new Set(), last: performance.now(), fed: false };
  let uncommittedNavigation: Request | undefined;
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) uncommittedNavigation = request;
    if (isFeedStream(request)) return;
    f.open.add(request);
    f.last = performance.now();
  });
  const done = (request: Request) => {
    if (f.open.delete(request)) f.last = performance.now();
  };
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  page.on('response', (response) => {
    if (isFeedStream(response.request())) f.fed = true;
  });
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame() || uncommittedNavigation === undefined) return;
    for (const request of f.open) if (request !== uncommittedNavigation) f.open.delete(request);
    uncommittedNavigation = undefined;
    f.fed = false;
    f.last = performance.now();
  });
  flights.set(page, f);
}

/**
 * Once the feed's stream of `page`'s current document has answered its headers: at once if it already has, as `track` saw it from before
 * the page loaded, else when it does. What the board says of the feed is judged from then, since a loaded machine answers the stream late
 * and the board says `connecting` until it does. A stream unanswered after `timeout`, the api's bound as `idle`'s, is refused, naming it.
 */
export async function feedAnswered(page: Page, timeout = 30_000): Promise<void> {
  track(page);
  if (flights.get(page)!.fed) return;
  try {
    await page.waitForResponse((response) => isFeedStream(response.request()), { timeout });
  } catch {
    throw new Refused(`the feed's stream is answered — GET ${FEED_STREAM} has no answer after ${timeout} ms`);
  }
}

/** How long no request may be in flight for the network to be idle: Playwright's `networkidle`'s half a second. */
export const QUIET_MS = 500;

/**
 * Once no request but the feed's stream has been in flight on `page` for `QUIET_MS`, counted from no earlier than the call: what a person
 * would see once whatever the last action started has been answered. Playwright's `networkidle` in its place waits on every request, the
 * stream too, and never fires; and a `waitForLoadState('networkidle')` after a click answers at once, however much the click set going. A
 * network still busy after `timeout` is refused, naming what is in flight.
 */
export async function idle(page: Page, timeout = 30_000): Promise<void> {
  track(page);
  const f = flights.get(page)!;
  const from = performance.now();
  const end = from + timeout;
  while (f.open.size || performance.now() - Math.max(f.last, from) < QUIET_MS) {
    if (performance.now() >= end) {
      const open = [...f.open].map((r) => `${r.method()} ${r.url()}`);
      throw new Refused(
        `the network idles — ${open.length ? `still in flight after ${timeout} ms: ${open.join(', ')}` : `never quiet for ${QUIET_MS} ms in ${timeout} ms`}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/**
 * Everything a page does that it must not: a console error, an uncaught exception, a request that failed
 * or was answered 400 or worse. Listened for from before the page loads, and read with `problems()`.
 *
 * One failure passes: the feed's stream aborted (`net::ERR_ABORTED`) by the page itself navigating or reloading after that stream opened —
 * the navigation committed after it, as `track` reads a page left — which is how a browser ends every request of a page it leaves, though
 * Playwright 1.62 reports none of them, and a later one may. The board closing its own stream while it stays on the page is counted, as any
 * other failure is.
 */
export function watch(page: Page): { problems: () => string[] } {
  track(page);
  const seen: string[] = [];
  let order = 0;
  let navigated = 0;
  let leaving = false;
  const opened = new WeakMap<Request, number>();
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) leaving = true;
    else if (isFeedStream(request)) opened.set(request, ++order);
  });
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame() || !leaving) return;
    navigated = ++order;
    leaving = false;
  });
  page.on('console', (message) => {
    if (message.type() === 'error') seen.push(`console error: ${message.text()}`);
  });
  page.on('pageerror', (error) => seen.push(`uncaught: ${error.message}`));
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText;
    if (reason === 'net::ERR_ABORTED' && isFeedStream(request) && navigated > (opened.get(request) ?? Infinity)) return;
    seen.push(`request failed: ${request.method()} ${request.url()} — ${reason ?? 'no reason given'}`);
  });
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
  const until = performance.now() + timeout;
  await expectVisible(image, assertion, timeout);
  const drawn = () =>
    image.first().evaluate((element) => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0);
  let ok = await drawn();
  while (!ok && performance.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    ok = await drawn();
  }
  if (!ok) throw new Refused(`${assertion} — the image did not load: no pixels after ${timeout} ms`);
}

/** As many elements match as `count`, within `timeout`. */
export async function expectCount(locator: Locator, count: number, assertion: string, timeout = WAIT_MS): Promise<void> {
  await expectNone(
    async () => {
      const found = await locator.count();
      return found === count ? null : `expected ${count}, found ${found}`;
    },
    assertion,
    timeout,
  );
}

/** The elements matched read `texts`, one each and in that order, within `timeout`: a menu's places, the first one first. */
export async function expectTexts(locator: Locator, texts: readonly string[], assertion: string, timeout = WAIT_MS): Promise<void> {
  await expectNone(
    async () => {
      const found = (await locator.allTextContents()).map((text) => text.trim());
      if (found.length === texts.length && found.every((text, i) => text === texts[i])) return null;
      return `expected ${texts.join(', ')}, found ${found.length ? found.join(', ') : 'nothing'}`;
    },
    assertion,
    timeout,
  );
}

/**
 * Every element matched lies inside `frame`'s box, give or take a pixel for borders that round onto its edge: a node on its canvas, not
 * hanging off the edge.
 */
export async function expectInside(elements: Locator, frame: Locator, assertion: string): Promise<void> {
  const box = await frame.boundingBox();
  if (!box) throw new Refused(`${assertion} — the frame is not on the page`);
  const outside: string[] = [];
  for (const [i, element] of (await elements.all()).entries()) {
    const b = await element.boundingBox();
    const name = (await element.getAttribute('data-id')) ?? `#${i + 1}`;
    const inside =
      b && b.x >= box.x - 1 && b.y >= box.y - 1 && b.x + b.width <= box.x + box.width + 1 && b.y + b.height <= box.y + box.height + 1;
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
  const until = performance.now() + timeout;
  let last = await transforms();
  for (let still = 0; still < 3 && performance.now() < until;) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const now = await transforms();
    still = now === last ? still + 1 : 0;
    last = now;
  }
}

/**
 * Resolves once every face the page has asked for is loaded: a face that swaps in after a width was measured moves what was measured.
 * The faces are the board's own files, so the wait ends with their requests.
 */
export const facesLoaded = (page: Page): Promise<void> => page.evaluate(async () => void (await document.fonts.ready));

/**
 * The page is in the theme asked for: the browser prefers it, and the page's ground is dark in the dark
 * and light in the light. Without the second half, both screenshots of a page could be the same picture. The ground's colour is read
 * back as sRGB off a pixel painted with it, whatever its space (Tailwind's are oklch); a ground nobody painted is the browser's white.
 */
export async function expectTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  const seen = await page.evaluate(() => {
    const color = getComputedStyle(document.body).backgroundColor;
    const pixel = document.createElement('canvas').getContext('2d')!;
    pixel.fillStyle = color;
    pixel.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data;
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
  Promise.all(
    (await elements.all()).map(async (element, i) => ({
      name: (await element.getAttribute('data-id')) ?? `#${i + 1}`,
      box: await element.boundingBox(),
    })),
  );

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
      b
        .filter(
          (other) =>
            one.box &&
            other.box &&
            one.box.x < other.box.x + other.box.width &&
            other.box.x < one.box.x + one.box.width &&
            one.box.y < other.box.y + other.box.height &&
            other.box.y < one.box.y + one.box.height,
        )
        .map((other) => `${one.name} and ${other.name}`),
    );
    return over.length ? `${over.join(', ')} overlap` : null;
  };
  await expectNone(problem, assertion, timeout);
}

/**
 * Every element matched shows its text whole: none is cut short by the room it was given (`truncate`, an ellipsis), within `timeout`.
 * Nothing matched is refused too.
 */
export async function expectUncut(elements: Locator, assertion: string, timeout = WAIT_MS): Promise<void> {
  await expectNone(
    async () => {
      const cut = await elements.evaluateAll((all) =>
        all.flatMap((element, i) =>
          (element as HTMLElement).scrollWidth > (element as HTMLElement).clientWidth + 1
            ? [(element as HTMLElement).dataset.id ?? element.textContent ?? `#${i + 1}`]
            : [],
        ),
      );
      const found = await elements.count();
      if (!found) return 'nothing to look at: 0 found';
      return cut.length ? `${cut.join(', ')} ${cut.length > 1 ? 'are' : 'is'} cut short` : null;
    },
    assertion,
    timeout,
  );
}

/**
 * Polls `problem` every 100 ms until it says none, and refuses with what it said last once `timeout` passes: for a floor laid out a render
 * after what moved it, and any state a page waits for: a page polls through this, never a loop of its own.
 *
 * @param problem what is wrong now, or null once the state is there
 * @param assertion what the page must show, said first in the refusal
 * @param timeout how long the state has to come; slower than `WAIT_MS` is a finding
 * @throws `Refused`, `<assertion> — <what problem said last>`
 */
export async function expectNone(problem: () => Promise<string | null>, assertion: string, timeout = WAIT_MS): Promise<void> {
  const end = performance.now() + timeout;
  let found = await problem();
  while (found && performance.now() < end) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    found = await problem();
  }
  if (found) throw new Refused(`${assertion} — ${found}`);
}

/**
 * `element` lies whole inside `frame`'s box, within `timeout`: a state a scrolling body brought into view, not one below its bottom edge.
 * Both boxes are relative to the viewport.
 */
export async function expectInView(element: Locator, frame: Locator, assertion: string, timeout = WAIT_MS): Promise<void> {
  await expectNone(
    async () => {
      const [box, view] = await Promise.all([element.boundingBox(), frame.boundingBox()]);
      if (!box || !view) return 'not drawn';
      return box.y >= view.y - 1 && box.y + box.height <= view.y + view.height + 1
        ? null
        : `it runs from ${Math.round(box.y)} to ${Math.round(box.y + box.height)}, the view from ${Math.round(view.y)} to ${Math.round(view.y + view.height)}`;
    },
    assertion,
    timeout,
  );
}

/**
 * Every element of `left` ends left of where every element of `right` begins, within `timeout`: a card left of each card that waits on
 * it. Nothing matched on either side is refused too.
 */
export async function expectLeftOf(left: Locator, right: Locator, assertion: string, timeout = WAIT_MS): Promise<void> {
  await expectNone(
    async () => {
      const [a, b] = await Promise.all([boxesOf(left), boxesOf(right)]);
      if (!a.length || !b.length) return `nothing to compare: ${a.length} and ${b.length} found`;
      const wrong = a.flatMap((one) =>
        b
          .filter((other) => !one.box || !other.box || one.box.x + one.box.width > other.box.x)
          .map((other) => `${one.name} does not end left of ${other.name}`),
      );
      return wrong.length ? wrong.join(', ') : null;
    },
    assertion,
    timeout,
  );
}

/**
 * `element` is wholly in the window, as the page is scrolled, within `timeout`: a page opened on something is scrolled to it. A top in the
 * window is not enough — the run page's inspector starts 40 pixels above the bottom of an unscrolled 800 — so its bottom must be in it too.
 * `boundingBox` is relative to the viewport.
 */
export async function expectOnScreen(element: Locator, assertion: string, timeout = WAIT_MS): Promise<void> {
  await expectNone(
    async () => {
      const [box, height] = await Promise.all([element.boundingBox(), element.page().evaluate(() => window.innerHeight)]);
      if (!box) return 'not drawn';
      return box.y >= 0 && box.y + box.height <= height
        ? null
        : `it runs from ${Math.round(box.y)} to ${Math.round(box.y + box.height)} of a window ${height} tall`;
    },
    assertion,
    timeout,
  );
}

/**
 * The vertical middle of every element of `middle` lies strictly between the middles of `one` and `other`, within `timeout`: a card level
 * with the middle of the two it is joined to, as a diamond's top and bottom are with its sides. Nothing matched is refused too.
 */
export async function expectBetween(middle: Locator, one: Locator, other: Locator, assertion: string, timeout = WAIT_MS): Promise<void> {
  const centre = (b: Boxed) => (b.box ? b.box.y + b.box.height / 2 : Number.NaN);
  await expectNone(
    async () => {
      const [m, [o], [p]] = await Promise.all([boxesOf(middle), boxesOf(one), boxesOf(other)]);
      const counts = [m.length, o ? 1 : 0, p ? 1 : 0];
      if (!m.length || !o || !p) return `nothing to compare: ${counts[0]}, ${counts[1]} and ${counts[2]} found`;
      const [top, bottom] = [Math.min(centre(o), centre(p)), Math.max(centre(o), centre(p))];
      const wrong = m
        .filter((b) => !(top < centre(b) && centre(b) < bottom))
        .map((b) => `${b.name} is not between ${o.name} and ${p.name}`);
      return wrong.length ? wrong.join(', ') : null;
    },
    assertion,
    timeout,
  );
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
 * dragged with its card. And every element of `still`, when it is given, stays where it was: the cards and steps
 * beside what was dragged. Nothing matched in `still` is refused too. A pixel of slack for positions that round differently.
 */
export async function expectMovedWith(
  followers: Locator,
  leader: Locator,
  move: () => Promise<void>,
  assertion: string,
  still?: Locator,
): Promise<void> {
  const [lead] = await boxesOf(leader);
  const before = await boxesOf(followers);
  const staying = still ? await boxesOf(still) : [];
  if (still && !staying.length) throw new Refused(`${assertion} — nothing to stay put: 0 found`);
  await move();
  const [led] = await boxesOf(leader);
  const after = new Map((await boxesOf(followers)).map(({ name, box }) => [name, box]));
  const stayed = new Map(still ? (await boxesOf(still)).map(({ name, box }) => [name, box]) : []);
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
  const strayed = staying.filter(({ name, box }) => {
    const now = stayed.get(name);
    return !box || !now || Math.abs(now.x - box.x) > 1 || Math.abs(now.y - box.y) > 1;
  });
  if (strayed.length) throw new Refused(`${assertion} — ${strayed.map((s) => s.name).join(', ')} moved too`);
}

/**
 * While `move` runs, `moved` moves, and every element of `still` stays where it was: a card or a step on the Factory dragged alone,
 * and what waits on it left behind. Nothing matched in `still` is refused, as `moved` not moving is.
 */
export const expectMovedAlone = (moved: Locator, move: () => Promise<void>, assertion: string, still: Locator): Promise<void> =>
  expectMovedWith(moved, moved, move, assertion, still);
