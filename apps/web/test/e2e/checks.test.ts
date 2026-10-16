/**
 * The e2e's refusals, made to refuse. `npm run e2e` runs this before it looks at the real pages, so a
 * check that cannot fail never gets to pass them. It needs Chromium (`npx playwright install chromium`),
 * which is why it is not part of `npm test`.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser, type Page } from 'playwright';
import {
  CHAT_STREAM,
  expectApart,
  expectBeneath,
  expectBetween,
  expectCount,
  expectDrawn,
  expectInside,
  expectInView,
  expectLeftOf,
  expectMovedAlone,
  expectMovedWith,
  expectTexts,
  expectTheme,
  expectUncut,
  expectVisible,
  FEED_STREAM,
  feedAnswered,
  idle,
  QUIET_MS,
  Refused,
  WAIT_MS,
  watch,
} from './checks.ts';
import { until, WAITED } from '../waits.ts';

let browser: Browser;
/**
 * A server on this machine, for what a route cannot fake: a stream held open — the feed's, and a run's: its headers and a comment, never an
 * end — and a request answered late, on a timer that does not hold the tests open. Its pages are `served`'s.
 */
let server: http.Server;
let origin: string;
const served = new Map<string, string>();
before(async () => {
  browser = await chromium.launch();
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://here');
    if (url.pathname === FEED_STREAM || url.pathname === '/api/runs/r-1/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      res.write(': open\n\n');
      return;
    }
    if (url.pathname === '/api/slow')
      return void setTimeout(
        () => res.writeHead(200, { 'content-type': 'application/json' }).end('[]'),
        Number(url.searchParams.get('ms')),
      ).unref();
    if (url.pathname === '/api/slow-page')
      return void setTimeout(
        () => res.writeHead(200, { 'content-type': 'text/html' }).end('<p>there</p>'),
        Number(url.searchParams.get('ms')),
      ).unref();
    const html = served.get(url.pathname);
    if (html === undefined) return void res.writeHead(404).end();
    res.writeHead(200, { 'content-type': 'text/html' }).end(html);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  await browser?.close();
  server?.closeAllConnections();
  server?.close();
});

/** `html` served from this machine, loaded in a page of its own and watched from before it loads. */
async function servedPage(html: string) {
  const route = `/page-${served.size + 1}`;
  served.set(route, html);
  const page = await (await browser.newContext()).newPage();
  const { problems } = watch(page);
  await page.goto(origin + route, { waitUntil: 'load' });
  return { page, problems };
}

/** A stream opened by the page, in `window.es` for the page to close, answered with its headers before this resolves. */
async function opened(page: Page, pathname: string): Promise<void> {
  await Promise.all([
    page.waitForResponse((r) => new URL(r.url()).pathname === pathname),
    page.evaluate((p) => {
      (window as unknown as { es: EventSource }).es = new EventSource(p);
    }, pathname),
  ]);
}

/** `html` at a made-up origin, with `/api/runs` answering `api` — no server, no port. */
async function pageWith(html: string, { theme = 'light', api = 200 }: { theme?: 'light' | 'dark'; api?: number } = {}) {
  const context = await browser.newContext({ colorScheme: theme });
  const page: Page = await context.newPage();
  const { problems } = watch(page);
  await page.route('http://e2e.test/**', (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (pathname === '/api/runs') return route.fulfill({ status: api, contentType: 'application/json', body: '[]' });
    return route.abort('connectionrefused');
  });
  await page.goto('http://e2e.test/');
  return { page, problems };
}

test('a console error, an uncaught exception, a failed request and a 500 are each a problem', WAITED, async (t) => {
  const { problems } = await pageWith(
    `<p>ok</p><script>
    console.error('the graph did not draw');
    setTimeout(() => { throw new Error('boom'); });
    fetch('/api/runs');
    fetch('/api/gone').catch(() => {});
  </script>`,
    { api: 500 },
  );
  const want = [
    /^console error: the graph did not draw$/,
    /^uncaught: boom$/,
    /^request failed: GET http:\/\/e2e\.test\/api\/gone/,
    /^request answered 500: GET http:\/\/e2e\.test\/api\/runs$/,
  ];
  await until(
    t,
    () => want.every((pattern) => problems().some((p) => pattern.test(p))),
    () => `every one of ${want.join(', ')}; problems: ${problems().join(' | ')}`,
    { everyMs: 50 },
  );
  for (const pattern of want)
    assert.ok(
      problems().some((p) => pattern.test(p)),
      `${pattern} in:\n${problems().join('\n')}`,
    );
});

test('an image whose request failed is refused as not drawn, though its box is visible — and one that loaded is drawn', async () => {
  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const { page } = await pageWith(
    `<img id="broken" src="/api/gone.png" alt="gone" width="40" height="40"><img id="drawn" src="${pixel}" alt="drawn" width="40" height="40">`,
  );
  await expectVisible(page.locator('#broken'), 'the broken image has a box');
  await assert.rejects(
    expectDrawn(page.locator('#broken'), 'the broken image is drawn', 500),
    (err) => err instanceof Refused && err.message.startsWith('the broken image is drawn — the image did not load'),
  );
  await expectDrawn(page.locator('#drawn'), 'the loaded image is drawn');
});

test('a page that does none of those has no problems — or every page would fail, and the watch prove nothing', async () => {
  const { page, problems } = await pageWith('<p>ok</p><script>fetch("/api/runs")</script>');
  await idle(page);
  assert.deepEqual(problems(), []);
});

test('an element that is not on the page, or is there and hidden, is refused, naming the assertion', async () => {
  const { page } = await pageWith('<nav><a href="/">Factory</a></nav><p class="card" hidden>a card</p>');
  await expectVisible(page.getByRole('link', { name: 'Factory' }), 'the sidebar has Factory');
  await assert.rejects(
    expectVisible(page.getByRole('link', { name: 'Runs' }), 'the sidebar has Runs', 300),
    (err: Error) => err instanceof Refused && err.message === 'the sidebar has Runs — not visible after 300 ms',
  );
  await assert.rejects(expectVisible(page.locator('.card'), 'the card', 300), Refused);
});

test('a count that is not the count is refused, naming both', async () => {
  const { page } = await pageWith('<div class="node"></div><div class="node"></div>');
  await expectCount(page.locator('.node'), 2, 'a node per step');
  await assert.rejects(
    expectCount(page.locator('.node'), 3, 'a node per step', 300),
    (err: Error) => err instanceof Refused && err.message === 'a node per step — expected 3, found 2',
  );
});

test('places out of their order are refused, naming both orders — and so are a place too few, one too many, and nothing at all', async () => {
  const { page } = await pageWith('<nav><a href="/inbox">Inbox</a><a href="/"> Factory </a><a href="/runs">Runs</a></nav>');
  const places = page.locator('nav a');
  await expectTexts(places, ['Inbox', 'Factory', 'Runs'], 'the menu starts with the Inbox');
  await assert.rejects(
    expectTexts(places, ['Factory', 'Inbox', 'Runs'], 'the menu starts with the Factory', 300),
    (err: Error) =>
      err instanceof Refused &&
      err.message === 'the menu starts with the Factory — expected Factory, Inbox, Runs, found Inbox, Factory, Runs',
  );
  await assert.rejects(
    expectTexts(places, ['Inbox', 'Factory', 'Runs', 'Workflows'], 'the menu has Workflows', 300),
    (err: Error) =>
      err instanceof Refused &&
      err.message === 'the menu has Workflows — expected Inbox, Factory, Runs, Workflows, found Inbox, Factory, Runs',
  );
  await assert.rejects(
    expectTexts(places, ['Inbox', 'Factory'], 'the menu has two places', 300),
    (err: Error) =>
      err instanceof Refused && err.message === 'the menu has two places — expected Inbox, Factory, found Inbox, Factory, Runs',
  );
  await assert.rejects(
    expectTexts(page.locator('.gone'), ['Inbox'], 'the menu has the Inbox', 300),
    (err: Error) => err instanceof Refused && err.message === 'the menu has the Inbox — expected Inbox, found nothing',
  );
});

test('a node hanging off the edge of its canvas is refused, naming it — as the run page was, photographed mid-fit', async () => {
  const { page } = await pageWith(`<div id="canvas" style="position:relative;width:200px;height:100px;overflow:hidden">
    <div class="node" data-id="implement" style="position:absolute;left:10px;top:10px;width:50px;height:20px"></div>
    <div class="node" data-id="respond" style="position:absolute;left:180px;top:10px;width:50px;height:20px"></div>
  </div>`);
  await expectInside(page.locator('.node[data-id="implement"]'), page.locator('#canvas'), 'every step is on the canvas');
  await assert.rejects(
    expectInside(page.locator('.node'), page.locator('#canvas'), 'every step is on the canvas'),
    (err: Error) => err instanceof Refused && err.message === 'every step is on the canvas — respond is outside it',
  );
});

test('a state below the bottom of a scrolling view is refused, naming both spans — and taken once the view scrolls to it', async () => {
  const { page } = await pageWith(`<div id="view" style="margin-top:20px;height:200px;overflow-y:auto">
    <div style="height:600px;position:relative"><div id="state" style="position:absolute;top:400px;height:40px"></div></div>
  </div>`);
  const [state, view] = [page.locator('#state'), page.locator('#view')];
  await assert.rejects(
    expectInView(state, view, 'the lit state is in view', 300),
    (err: Error) => err instanceof Refused && err.message === 'the lit state is in view — it runs from 420 to 460, the view from 20 to 220',
  );
  await view.evaluate((el) => (el.scrollTop = 300));
  await expectInView(state, view, 'the lit state is in view', 300);
});

test('a page that stays light in the dark is refused, and so is one nobody painted', async () => {
  const themed = '<style>body{background:white}@media (prefers-color-scheme: dark){body{background:oklch(0.145 0 0)}}</style><p>ok</p>';
  await expectTheme((await pageWith(themed, { theme: 'dark' })).page, 'dark');
  await expectTheme((await pageWith(themed)).page, 'light');

  await assert.rejects(
    expectTheme((await pageWith('<style>body{background:white}</style><p>ok</p>', { theme: 'dark' })).page, 'dark'),
    (err: Error) => err instanceof Refused && /^the page is dark — its background is rgb\(255, 255, 255\), which is not$/.test(err.message),
  );
  await assert.rejects(expectTheme((await pageWith('<p>unpainted</p>', { theme: 'dark' })).page, 'dark'), Refused);
  await assert.rejects(
    expectTheme((await pageWith(themed)).page, 'dark'),
    (err: Error) => err instanceof Refused && err.message === 'the browser prefers dark — it prefers light',
    'a light browser asked to be judged dark is refused',
  );
});

test('a card under a graph is refused, naming both — and so is a comparison with nothing on one side', async () => {
  const { page } = await pageWith(`<div style="position:relative">
    <div class="card" data-id="beside" style="position:absolute;left:0;top:0;width:100px;height:50px"></div>
    <div class="step" data-id="run/implement" style="position:absolute;left:90px;top:10px;width:100px;height:50px"></div>
    <div class="step" data-id="run/review" style="position:absolute;left:300px;top:10px;width:100px;height:50px"></div>
  </div>`);
  await expectApart(page.locator('.card'), page.locator('[data-id="run/review"]'), 'the card is clear of the graph');
  await assert.rejects(
    expectApart(page.locator('.card'), page.locator('.step'), 'the card is clear of the graph', 300),
    (err: Error) => err instanceof Refused && err.message === 'the card is clear of the graph — beside and run/implement overlap',
  );
  await assert.rejects(
    expectApart(page.locator('.gone'), page.locator('.step'), 'the card is clear of the graph', 300),
    (err: Error) => err instanceof Refused && err.message === 'the card is clear of the graph — nothing to compare: 0 and 2 found',
  );
});

test('a step left behind when its card moves is refused, naming it — and so is a card that never moved', async () => {
  const { page } = await pageWith(`<div id="card" data-id="run" style="position:absolute;left:0;top:0;width:100px;height:50px"></div>
    <div class="step" data-id="run/implement" style="position:absolute;left:150px;top:0;width:100px;height:50px"></div>
    <div class="step" data-id="run/review" style="position:absolute;left:300px;top:0;width:100px;height:50px"></div>`);
  const down = (selector: string) => () =>
    page.evaluate((s) => {
      document.querySelectorAll<HTMLElement>(s).forEach((el) => (el.style.top = `${parseFloat(el.style.top) + 40}px`));
    }, selector);
  await expectMovedWith(page.locator('.step'), page.locator('#card'), down('#card, .step'), 'the steps move with the card');
  await assert.rejects(
    expectMovedWith(page.locator('.step'), page.locator('#card'), down('#card, [data-id="run/implement"]'), 'the steps move with the card'),
    (err: Error) => err instanceof Refused && err.message === 'the steps move with the card — run/review did not move with run',
  );
  await assert.rejects(
    expectMovedWith(page.locator('.step'), page.locator('#card'), async () => {}, 'the steps move with the card'),
    (err: Error) => err instanceof Refused && err.message === 'the steps move with the card — run did not move',
  );
});

test('a step that moves when it should stay put is refused, naming it — and so is nothing to stay put', async () => {
  const { page } =
    await pageWith(`<div class="step" data-id="run/implement" style="position:absolute;left:150px;top:0;width:100px;height:50px"></div>
    <div class="step" data-id="run/review" style="position:absolute;left:300px;top:0;width:100px;height:50px"></div>
    <div class="lane" data-id="run/tokens" style="position:absolute;left:150px;top:100px;width:100px;height:50px"></div>
    <div class="lane" data-id="run/theme" style="position:absolute;left:300px;top:100px;width:100px;height:50px"></div>`);
  const down = (selector: string) => () =>
    page.evaluate((s) => {
      document.querySelectorAll<HTMLElement>(s).forEach((el) => (el.style.top = `${parseFloat(el.style.top) + 40}px`));
    }, selector);
  const [review, implement] = [page.locator('[data-id="run/review"]'), page.locator('[data-id="run/implement"]')];
  await expectMovedWith(review, implement, down('.step'), 'review moves with implement, and the other lane stays', page.locator('.lane'));
  await assert.rejects(
    expectMovedWith(
      review,
      implement,
      down('.step, [data-id="run/theme"]'),
      'review moves with implement, and the other lane stays',
      page.locator('.lane'),
    ),
    (err: Error) => err instanceof Refused && err.message === 'review moves with implement, and the other lane stays — run/theme moved too',
  );
  await assert.rejects(
    expectMovedWith(review, implement, down('.step'), 'review moves with implement, and the other lane stays', page.locator('.gone')),
    (err: Error) =>
      err instanceof Refused && err.message === 'review moves with implement, and the other lane stays — nothing to stay put: 0 found',
  );
});

test('a step dragged alone that takes the step after it along is refused, naming that step — and so is a step that never moved', async () => {
  const { page } =
    await pageWith(`<div class="step" data-id="run/implement" style="position:absolute;left:150px;top:0;width:100px;height:50px"></div>
    <div class="step" data-id="run/review" style="position:absolute;left:300px;top:0;width:100px;height:50px"></div>`);
  const down = (selector: string) => () =>
    page.evaluate((s) => {
      document.querySelectorAll<HTMLElement>(s).forEach((el) => (el.style.top = `${parseFloat(el.style.top) + 40}px`));
    }, selector);
  const [review, implement] = [page.locator('[data-id="run/review"]'), page.locator('[data-id="run/implement"]')];
  await expectMovedAlone(implement, down('[data-id="run/implement"]'), 'implement moves alone, and review stays', review);
  await assert.rejects(
    expectMovedAlone(implement, down('.step'), 'implement moves alone, and review stays', review),
    (err: Error) => err instanceof Refused && err.message === 'implement moves alone, and review stays — run/review moved too',
  );
  await assert.rejects(
    expectMovedAlone(implement, async () => {}, 'implement moves alone, and review stays', review),
    (err: Error) => err instanceof Refused && err.message === 'implement moves alone, and review stays — run/implement did not move',
  );
});

test('an edge back that runs beside its steps, or over them, is refused, naming both — and so is a comparison with nothing on one side', async () => {
  const { page } = await pageWith(`<div style="position:relative">
    <div class="step" data-id="implement" style="position:absolute;left:0;top:100px;width:100px;height:60px"></div>
    <div class="step" data-id="review" style="position:absolute;left:300px;top:100px;width:100px;height:80px"></div>
    <div class="edge" data-id="loop:review->implement" style="position:absolute;left:50px;top:160px;width:300px;height:60px"></div>
    <div class="beside" data-id="beside" style="position:absolute;left:50px;top:145px;width:300px;height:30px"></div>
    <div class="over" data-id="over" style="position:absolute;left:50px;top:40px;width:300px;height:200px"></div>
  </div>`);
  await expectBeneath(page.locator('.edge'), page.locator('.step'), 'the edge back runs beneath the row');
  await assert.rejects(
    expectBeneath(page.locator('.beside'), page.locator('.step'), 'the edge back runs beneath the row'),
    (err: Error) => err instanceof Refused && err.message === 'the edge back runs beneath the row — beside reaches no lower than review',
    'an edge level with the row reaches no lower than review, the taller of the two, and is refused',
  );
  await assert.rejects(
    expectBeneath(page.locator('.over'), page.locator('.step'), 'the edge back runs beneath the row'),
    (err: Error) =>
      err instanceof Refused &&
      err.message ===
        'the edge back runs beneath the row — over rises above the middle of implement, over rises above the middle of review',
    'an edge lower than both steps and over them too rises above the middle of each, and is refused',
  );
  await assert.rejects(
    expectBeneath(page.locator('.gone'), page.locator('.step'), 'the edge back runs beneath the row'),
    (err: Error) => err instanceof Refused && err.message === 'the edge back runs beneath the row — nothing to compare: 0 and 2 found',
  );
});

test('a card that does not end left of one that waits on it is refused, naming both — and so is nothing to compare', async () => {
  const { page } = await pageWith(`<div class="parent" data-id="a" style="position:absolute;left:0;top:0;width:100px;height:50px"></div>
    <div class="child" data-id="b" style="position:absolute;left:150px;top:0;width:100px;height:50px"></div>
    <div class="under" data-id="c" style="position:absolute;left:80px;top:60px;width:100px;height:50px"></div>`);
  await expectLeftOf(page.locator('.parent'), page.locator('.child'), 'a is left of b');
  await assert.rejects(
    expectLeftOf(page.locator('.parent'), page.locator('.under'), 'a is left of c', 300),
    (err: Error) => err instanceof Refused && err.message === 'a is left of c — a does not end left of c',
    'c, begun before a ends a row down, is not left of it though not over it either, and is refused',
  );
  await assert.rejects(
    expectLeftOf(page.locator('.child'), page.locator('.parent'), 'b is left of a', 300),
    (err: Error) => err instanceof Refused && err.message === 'b is left of a — b does not end left of a',
  );
  await assert.rejects(
    expectLeftOf(page.locator('.gone'), page.locator('.child'), 'nothing is left of b', 300),
    (err: Error) => err instanceof Refused && err.message === 'nothing is left of b — nothing to compare: 0 and 1 found',
  );
});

test('a card not level with the middle of the two it is joined to is refused, naming it — level with one of them included — and so is nothing to compare', async () => {
  const { page } = await pageWith(`<div id="b" data-id="b" style="position:absolute;left:100px;top:0;width:100px;height:50px"></div>
    <div id="c" data-id="c" style="position:absolute;left:100px;top:200px;width:100px;height:50px"></div>
    <div class="middle" data-id="d" style="position:absolute;left:250px;top:100px;width:100px;height:50px"></div>
    <div class="level" data-id="e" style="position:absolute;left:250px;top:0;width:100px;height:50px"></div>
    <div class="below" data-id="f" style="position:absolute;left:250px;top:300px;width:100px;height:50px"></div>`);
  await expectBetween(page.locator('.middle'), page.locator('#b'), page.locator('#c'), 'd is between b and c');
  await assert.rejects(
    expectBetween(page.locator('.level'), page.locator('#b'), page.locator('#c'), 'e is between b and c', 300),
    (err: Error) => err instanceof Refused && err.message === 'e is between b and c — e is not between b and c',
  );
  await assert.rejects(
    expectBetween(page.locator('.middle, .below'), page.locator('#c'), page.locator('#b'), 'd and f are between c and b', 300),
    (err: Error) => err instanceof Refused && err.message === 'd and f are between c and b — f is not between c and b',
  );
  await assert.rejects(
    expectBetween(page.locator('.middle'), page.locator('#gone'), page.locator('#c'), 'd is between', 300),
    (err: Error) => err instanceof Refused && err.message === 'd is between — nothing to compare: 1, 0 and 1 found',
  );
});

test('a name cut short by the room beside it is refused, naming it — and so is nothing to look at', async () => {
  const { page } = await pageWith(`<p style="display:flex;width:120px">
      <span class="whole" style="flex-shrink:0">implement</span>
      <span class="cut" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">implement</span>
      <span style="flex-shrink:0">waiting on the-other-side-runs-e2e6</span>
    </p>`);
  await expectUncut(page.locator('.whole'), 'the name is whole');
  await assert.rejects(
    expectUncut(page.locator('.cut'), 'the name is whole', 300),
    (err: Error) => err instanceof Refused && err.message === 'the name is whole — implement is cut short',
  );
  await assert.rejects(
    expectUncut(page.locator('.gone'), 'the name is whole', 300),
    (err: Error) => err instanceof Refused && err.message === 'the name is whole — nothing to look at: 0 found',
  );
});

test("idle resolves with the feed's stream open, which never ends — and only once nothing else has been in flight for its half a second", async () => {
  const { page } = await servedPage('<p>ok</p>');
  await opened(page, FEED_STREAM);
  const from = performance.now();
  await idle(page, 3_000);
  assert.ok(
    performance.now() - from >= QUIET_MS,
    `quiet for ${QUIET_MS} ms counted from the call, not from the last request — it took ${performance.now() - from} ms`,
  );
});

test('idle counts its quiet on a clock that does not step: the wall clock stepped a minute ahead once it waits still leaves it its half a second', async (t) => {
  const { page } = await servedPage('<p>ok</p>');
  await opened(page, FEED_STREAM);
  const wall = Date.now.bind(Date);
  const from = performance.now();
  const waited = idle(page, 3_000);
  t.mock.method(Date, 'now', () => wall() + 60_000);
  await waited;
  assert.ok(
    performance.now() - from >= QUIET_MS,
    `quiet for ${QUIET_MS} ms as a monotonic clock counts it, whatever the wall clock says — it took ${performance.now() - from} ms`,
  );
});

test("idle waits for any other request: one answered late, and a stream that is not the feed's, which it refuses at its timeout, naming it", async () => {
  const { page } = await servedPage('<p>ok</p>');
  await opened(page, FEED_STREAM);
  const from = performance.now();
  await page.evaluate(() => void fetch('/api/slow?ms=1200'));
  await idle(page, 5_000);
  assert.ok(
    performance.now() - from >= 1_200 + QUIET_MS,
    `idle waited for the late answer, then for quiet — it took ${performance.now() - from} ms`,
  );

  await opened(page, '/api/runs/r-1/stream');
  await assert.rejects(
    idle(page, 1_000),
    (err: Error) =>
      err instanceof Refused && err.message === `the network idles — still in flight after 1000 ms: GET ${origin}/api/runs/r-1/stream`,
  );
});

test("feedAnswered resolves once the feed's stream answers: at once for one answered before the call, else when it is", async () => {
  const opens = `<p>ok</p><script>window.es = new EventSource('${FEED_STREAM}')</script>`;
  const { page } = await servedPage(opens);
  await page.waitForFunction(() => (window as unknown as { es: EventSource }).es.readyState === EventSource.OPEN);
  await feedAnswered(page, 1);

  const { page: later } = await servedPage('<p>ok</p>');
  const answered = feedAnswered(later, 5_000);
  await later.evaluate((p) => {
    (window as unknown as { es: EventSource }).es = new EventSource(p);
  }, FEED_STREAM);
  await answered;
});

test("REFUSED by feedAnswered: a feed's stream never answered, and one answered only before the page's reload, each naming the stream", async () => {
  const want = (err: Error) =>
    err instanceof Refused && err.message === `the feed's stream is answered — GET ${FEED_STREAM} has no answer after 300 ms`;
  const { page } = await servedPage('<p>ok</p>');
  await assert.rejects(feedAnswered(page, 300), want);

  const opens = `<p>ok</p><script>window.es = new EventSource('${FEED_STREAM}')</script>`;
  const { page: reloaded } = await servedPage(opens);
  await reloaded.waitForFunction(() => (window as unknown as { es: EventSource }).es.readyState === EventSource.OPEN);
  served.set(new URL(reloaded.url()).pathname, '<p>ok</p>');
  await reloaded.reload({ waitUntil: 'load' });
  await assert.rejects(feedAnswered(reloaded, 300), want);
});

test("the board closing the feed's stream while it stays on the page is a failed request the watch counts", WAITED, async (t) => {
  const { page, problems } = await servedPage('<p>ok</p>');
  await opened(page, FEED_STREAM);
  await page.evaluate(() => (window as unknown as { es: EventSource }).es.close());
  const want = `request failed: GET ${origin}${FEED_STREAM} — net::ERR_ABORTED`;
  await until(
    t,
    () => problems().includes(want),
    () => `${want}; problems: ${problems().join(' | ')}`,
    { everyMs: 50 },
  );
  assert.deepEqual(problems(), [want]);
});

test(
  "the feed's stream left by the page's own reload is not counted — and one opened after that reload, then closed by the page, is",
  WAITED,
  async (t) => {
    const opens = `<p>ok</p><script>window.es = new EventSource('${FEED_STREAM}')</script>`;
    const { page, problems } = await servedPage(opens);
    const isStream = (r: { url: () => string }) => new URL(r.url()).pathname === FEED_STREAM;
    await page.waitForFunction(() => (window as unknown as { es: EventSource }).es.readyState === EventSource.OPEN);
    const [reopened] = await Promise.all([page.waitForResponse(isStream, { timeout: 5_000 }), page.reload({ waitUntil: 'load' })]);
    assert.ok(reopened.ok());
    await idle(page, 3_000);
    assert.deepEqual(
      problems(),
      [],
      "the stream the reload left is not counted — which Playwright 1.62, reporting nothing of a request its page left, passes with or without the watch's rule; the next test is where the rule allows and refuses",
    );

    await page.evaluate(() => (window as unknown as { es: EventSource }).es.close());
    const want = `request failed: GET ${origin}${FEED_STREAM} — net::ERR_ABORTED`;
    await until(t, () => problems().length > 0, 'a problem, once the page closes its stream', { everyMs: 50 });
    assert.deepEqual(problems(), [want]);
  },
);

test('the watch lets a page stream be aborted once the page it opened on is left — by a navigation committed after it, or by the router moving to another address — and counts every other failure', () => {
  const main = {};
  const emitter = new EventEmitter();
  let address = 'http://e2e.test/';
  const page = Object.assign(emitter, { mainFrame: () => main, url: () => address }) as unknown as Page;
  const request = (pathname: string, { navigation = false, error = 'net::ERR_ABORTED' } = {}) => ({
    url: () => `http://e2e.test${pathname}`,
    method: () => 'GET',
    isNavigationRequest: () => navigation,
    frame: () => main,
    failure: () => ({ errorText: error }),
  });
  const failed = (pathname: string, error = 'net::ERR_ABORTED') => `request failed: GET http://e2e.test${pathname} — ${error}`;
  const navigate = (frame: object = main) => {
    emitter.emit('request', { ...request('/', { navigation: true }), frame: () => frame });
    emitter.emit('framenavigated', frame);
  };
  const { problems } = watch(page);
  const seen = () => problems().length;

  const left = request(FEED_STREAM);
  emitter.emit('request', left);
  navigate();
  emitter.emit('requestfailed', left);
  assert.deepEqual(problems(), [], 'a stream opened, then left by the page reloading, is let abort');

  const late = request(FEED_STREAM);
  emitter.emit('request', request('/', { navigation: true }));
  emitter.emit('request', late);
  emitter.emit('framenavigated', main);
  emitter.emit('requestfailed', late);
  assert.deepEqual(
    problems(),
    [],
    'a stream opened by the page it leaves while the navigation is on its way, before the commit, is let abort',
  );

  const closed = request(FEED_STREAM);
  emitter.emit('request', closed);
  emitter.emit('requestfailed', closed);
  assert.deepEqual(
    problems(),
    [failed(FEED_STREAM)],
    'a stream opened after that navigation and aborted with no other, closed by the board, is counted',
  );

  const broken = request(FEED_STREAM, { error: 'net::ERR_INCOMPLETE_CHUNKED_ENCODING' });
  const other = request('/api/runs/r-1/stream');
  emitter.emit('request', broken);
  emitter.emit('request', other);
  navigate();
  emitter.emit('requestfailed', broken);
  emitter.emit('requestfailed', other);
  assert.equal(seen(), 3, 'a stream failed some other way than an abort after a navigation, and another stream aborted, are both counted');
  assert.deepEqual(problems().slice(1), [failed(FEED_STREAM, 'net::ERR_INCOMPLETE_CHUNKED_ENCODING'), failed('/api/runs/r-1/stream')]);

  const framed = request(FEED_STREAM);
  emitter.emit('request', framed);
  navigate({});
  emitter.emit('requestfailed', framed);
  assert.equal(seen(), 4, "a navigation of a frame inside the page is not the page's own: the stream's abort is counted");
  const pending = request(FEED_STREAM);
  emitter.emit('request', pending);
  emitter.emit('request', request('/', { navigation: true }));
  emitter.emit('framenavigated', {});
  emitter.emit('requestfailed', pending);
  emitter.emit('framenavigated', main);
  assert.equal(
    seen(),
    5,
    "a frame's commit while the page's own navigation is on its way does not leave the page: the stream's abort is counted",
  );

  const pushed = request(FEED_STREAM);
  emitter.emit('request', pushed);
  emitter.emit('framenavigated', main);
  emitter.emit('requestfailed', pushed);
  assert.equal(seen(), 6, "a same-document navigation (pushState) asks for nothing and leaves nothing: the stream's abort is counted");

  const moved = request(CHAT_STREAM);
  emitter.emit('request', moved);
  address = 'http://e2e.test/chat';
  emitter.emit('requestfailed', moved);
  assert.equal(seen(), 6, 'a page stream the router left behind by moving to another address is let abort: nothing reads it there');

  const standing = request(CHAT_STREAM);
  emitter.emit('request', standing);
  emitter.emit('requestfailed', standing);
  assert.deepEqual(problems().slice(6), [failed(CHAT_STREAM)], 'and one the board closes while that address stands is counted');
});

test('idle lets go of the requests a page left behind when it reloaded or navigated, those its old document asked for on the way included, of which Playwright says nothing more — and of none on a pushState', async () => {
  const { page } = await servedPage('<p>ok</p>');
  await page.evaluate(() => void fetch('/api/slow?ms=60000'));
  await page.reload({ waitUntil: 'load' });
  await idle(page, 3_000);

  const asked: string[] = [];
  let navigating = false;
  page.on('request', (r) => {
    if (r.isNavigationRequest()) navigating = true;
    else if (navigating) asked.push(r.url());
  });
  await page.evaluate(() => void setInterval(() => void fetch('/api/slow?ms=60000'), 50));
  await page.goto(`${origin}/api/slow-page?ms=800`, { waitUntil: 'load' });
  assert.ok(asked.length > 0, 'the old document asked for something between the navigation and its commit — or this proves nothing');
  await idle(page, 3_000);

  const from = performance.now();
  const slow = page.waitForRequest((r) => new URL(r.url()).search === '?ms=1200', { timeout: WAIT_MS });
  await page.evaluate(() => {
    void fetch('/api/slow?ms=1200');
    history.pushState({}, '', '/elsewhere');
  });
  await slow;
  await page.waitForURL(`${origin}/elsewhere`, { timeout: WAIT_MS });
  await idle(page, 5_000);
  assert.ok(
    performance.now() - from >= 1_200,
    `idle waited for the request asked for before the pushState — it took ${performance.now() - from} ms`,
  );
});
