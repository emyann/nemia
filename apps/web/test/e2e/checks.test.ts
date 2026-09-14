/**
 * The e2e's refusals, made to refuse. `npm run e2e` runs this before it looks at the real pages, so a
 * check that cannot fail never gets to pass them. It needs Chromium (`npx playwright install chromium`),
 * which is why it is not part of `npm test`.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { expectApart, expectBeneath, expectCount, expectInside, expectMovedWith, expectTheme, expectVisible, Refused, watch } from './checks.ts';

let browser: Browser;
before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});

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

async function eventually(done: () => boolean, ms = 3_000): Promise<void> {
  const until = Date.now() + ms;
  while (!done() && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 50));
}

test('a console error, an uncaught exception, a failed request and a 500 are each a problem', async () => {
  const { problems } = await pageWith(`<p>ok</p><script>
    console.error('the graph did not draw');
    setTimeout(() => { throw new Error('boom'); });
    fetch('/api/runs');
    fetch('/api/gone').catch(() => {});
  </script>`, { api: 500 });
  const want = [/^console error: the graph did not draw$/, /^uncaught: boom$/, /^request failed: GET http:\/\/e2e\.test\/api\/gone/, /^request answered 500: GET http:\/\/e2e\.test\/api\/runs$/];
  await eventually(() => want.every((pattern) => problems().some((p) => pattern.test(p))));
  for (const pattern of want) assert.ok(problems().some((p) => pattern.test(p)), `${pattern} in:\n${problems().join('\n')}`);
});

test('a page that does none of those has no problems — or every page would fail, and the watch prove nothing', async () => {
  const { page, problems } = await pageWith('<p>ok</p><script>fetch("/api/runs")</script>');
  await page.waitForLoadState('networkidle');
  assert.deepEqual(problems(), []);
});

test('an element that is not on the page, or is there and hidden, is refused, naming the assertion', async () => {
  const { page } = await pageWith('<nav><a href="/">Factory</a></nav><p class="card" hidden>a card</p>');
  await expectVisible(page.getByRole('link', { name: 'Factory' }), 'the sidebar has Factory');
  await assert.rejects(expectVisible(page.getByRole('link', { name: 'Runs' }), 'the sidebar has Runs', 300),
    (err: Error) => err instanceof Refused && err.message === 'the sidebar has Runs — not visible after 300 ms');
  await assert.rejects(expectVisible(page.locator('.card'), 'the card', 300), Refused);
});

test('a count that is not the count is refused, naming both', async () => {
  const { page } = await pageWith('<div class="node"></div><div class="node"></div>');
  await expectCount(page.locator('.node'), 2, 'a node per step');
  await assert.rejects(expectCount(page.locator('.node'), 3, 'a node per step', 300),
    (err: Error) => err instanceof Refused && err.message === 'a node per step — expected 3, found 2');
});

test('a node hanging off the edge of its canvas is refused, naming it — as the run page was, photographed mid-fit', async () => {
  const { page } = await pageWith(`<div id="canvas" style="position:relative;width:200px;height:100px;overflow:hidden">
    <div class="node" data-id="implement" style="position:absolute;left:10px;top:10px;width:50px;height:20px"></div>
    <div class="node" data-id="respond" style="position:absolute;left:180px;top:10px;width:50px;height:20px"></div>
  </div>`);
  await expectInside(page.locator('.node[data-id="implement"]'), page.locator('#canvas'), 'every step is on the canvas');
  await assert.rejects(expectInside(page.locator('.node'), page.locator('#canvas'), 'every step is on the canvas'),
    (err: Error) => err instanceof Refused && err.message === 'every step is on the canvas — respond is outside it');
});

test('a page that stays light in the dark is refused, and so is one nobody painted', async () => {
  const themed = '<style>body{background:white}@media (prefers-color-scheme: dark){body{background:oklch(0.145 0 0)}}</style><p>ok</p>';
  await expectTheme((await pageWith(themed, { theme: 'dark' })).page, 'dark');
  await expectTheme((await pageWith(themed)).page, 'light');

  await assert.rejects(expectTheme((await pageWith('<style>body{background:white}</style><p>ok</p>', { theme: 'dark' })).page, 'dark'),
    (err: Error) => err instanceof Refused && /^the page is dark — its background is rgb\(255, 255, 255\), which is not$/.test(err.message));
  await assert.rejects(expectTheme((await pageWith('<p>unpainted</p>', { theme: 'dark' })).page, 'dark'), Refused);
  // And the emulation itself: a light browser asked to be judged dark.
  await assert.rejects(expectTheme((await pageWith(themed)).page, 'dark'),
    (err: Error) => err instanceof Refused && err.message === 'the browser prefers dark — it prefers light');
});

test("a card under a graph is refused, naming both — and so is a comparison with nothing on one side", async () => {
  const { page } = await pageWith(`<div style="position:relative">
    <div class="card" data-id="beside" style="position:absolute;left:0;top:0;width:100px;height:50px"></div>
    <div class="step" data-id="run/implement" style="position:absolute;left:90px;top:10px;width:100px;height:50px"></div>
    <div class="step" data-id="run/review" style="position:absolute;left:300px;top:10px;width:100px;height:50px"></div>
  </div>`);
  await expectApart(page.locator('.card'), page.locator('[data-id="run/review"]'), 'the card is clear of the graph');
  await assert.rejects(expectApart(page.locator('.card'), page.locator('.step'), 'the card is clear of the graph', 300),
    (err: Error) => err instanceof Refused && err.message === 'the card is clear of the graph — beside and run/implement overlap');
  await assert.rejects(expectApart(page.locator('.gone'), page.locator('.step'), 'the card is clear of the graph', 300),
    (err: Error) => err instanceof Refused && err.message === 'the card is clear of the graph — nothing to compare: 0 and 2 found');
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
  await assert.rejects(expectMovedWith(page.locator('.step'), page.locator('#card'), down('#card, [data-id="run/implement"]'), 'the steps move with the card'),
    (err: Error) => err instanceof Refused && err.message === 'the steps move with the card — run/review did not move with run');
  await assert.rejects(expectMovedWith(page.locator('.step'), page.locator('#card'), async () => {}, 'the steps move with the card'),
    (err: Error) => err instanceof Refused && err.message === 'the steps move with the card — run did not move');
});

test("an edge back that runs beside its steps, or over them, is refused, naming both — and so is a comparison with nothing on one side", async () => {
  const { page } = await pageWith(`<div style="position:relative">
    <div class="step" data-id="implement" style="position:absolute;left:0;top:100px;width:100px;height:60px"></div>
    <div class="step" data-id="review" style="position:absolute;left:300px;top:100px;width:100px;height:80px"></div>
    <div class="edge" data-id="loop:review->implement" style="position:absolute;left:50px;top:160px;width:300px;height:60px"></div>
    <div class="beside" data-id="beside" style="position:absolute;left:50px;top:145px;width:300px;height:30px"></div>
    <div class="over" data-id="over" style="position:absolute;left:50px;top:40px;width:300px;height:200px"></div>
  </div>`);
  await expectBeneath(page.locator('.edge'), page.locator('.step'), 'the edge back runs beneath the row');
  // Level with the row: it reaches no lower than review, the taller of the two.
  await assert.rejects(expectBeneath(page.locator('.beside'), page.locator('.step'), 'the edge back runs beneath the row'),
    (err: Error) => err instanceof Refused && err.message === 'the edge back runs beneath the row — beside reaches no lower than review');
  // Lower than both, and over them too: it rises above the middle of each.
  await assert.rejects(expectBeneath(page.locator('.over'), page.locator('.step'), 'the edge back runs beneath the row'),
    (err: Error) => err instanceof Refused && err.message === 'the edge back runs beneath the row — over rises above the middle of implement, over rises above the middle of review');
  await assert.rejects(expectBeneath(page.locator('.gone'), page.locator('.step'), 'the edge back runs beneath the row'),
    (err: Error) => err instanceof Refused && err.message === 'the edge back runs beneath the row — nothing to compare: 0 and 2 found');
});
