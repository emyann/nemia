import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectInside, expectLeftOf, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

const { good, yours } = WORKFLOWS;

/** The step the page inspects first, which waits on the other: `review`, after `implement`. */
const [FIRST, WAITS] = good.steps;

/** The page of the workflow `name`, read from `from`. */
const pageOf = (from: string, name: string) => `/workflows/${from}/${name}`;

/** The canvas of the workflow `name`, whose page is open. */
const canvasOf = (page: Page, name: string) => page.locator(`article[aria-label="Workflow ${name}"] .react-flow`);

/** The node of the step `step` on the canvas of the workflow `name`. */
const nodeOf = (page: Page, name: string, step: string) => canvasOf(page, name).locator(`.react-flow__node[data-id="${step}"]`);

/** The bar showing the step `step` of the workflow `name`, read from `from`. */
const specBar = (page: Page, from: string, name: string, step: string) => page.locator(`aside[data-bar="spec:${from}/${name}/${step}"]`);

/** What the address's search holds for `bar`, or null. */
const barInUrl = (page: Page) => new URL(page.url()).searchParams.get('bar');

/** Goes to `to` in this tab and waits for its reads. */
async function visit(page: Page, to: string): Promise<void> {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** Refuses unless no bar is drawn and the address names none. */
async function expectNoBar(page: Page, assertion: string): Promise<void> {
  await expectCount(page.locator('aside[data-bar]'), 0, assertion);
  if (barInUrl(page) !== null) throw new Refused(`${assertion}: the address names no bar — it is ${page.url()}`);
}

/**
 * Refuses unless the bar shows the step `step` of `name` read from `from`, the address names it, and its node alone on the page is
 * marked.
 */
async function expectSpec(page: Page, from: string, name: string, step: string, assertion: string): Promise<Locator> {
  const bar = specBar(page, from, name, step);
  const value = `spec:${from}/${name}/${step}`;
  await expectVisible(bar, assertion);
  if (barInUrl(page) !== value) throw new Refused(`${assertion}: the address names bar=${value} — it is ${page.url()}`);
  await expectVisible(nodeOf(page, name, step).locator('[data-inspected]'), `${assertion}: its node is ringed`);
  await expectCount(page.locator('.react-flow [data-inspected]'), 1, `${assertion}: and no other node on the page is`);
  return bar;
}

/** Refuses unless the page reaches `pathname` within the wait. */
async function expectAt(page: Page, pathname: string, assertion: string): Promise<void> {
  try {
    await page.waitForURL((url) => url.pathname === pathname, { timeout: WAIT_MS });
  } catch {
    throw new Refused(`${assertion} — the page is at ${page.url()}`);
  }
}

/** Clicks a point of the canvas of `name` with nothing drawn on it, where the click lands on the empty pane. */
async function clickPane(page: Page, name: string): Promise<void> {
  const spot = await canvasOf(page, name).evaluate((canvas) => {
    const box = canvas.getBoundingClientRect();
    for (let y = box.top + box.height - 12; y > box.top + 12; y -= 12)
      for (let x = box.left + 12; x < box.left + box.width / 2; x += 12)
        if (document.elementFromPoint(x, y)?.classList.contains('react-flow__pane')) return { x, y };
    return null;
  });
  if (!spot) throw new Refused(`${name}'s canvas has an empty spot to click`);
  await page.mouse.click(spot.x, spot.y);
}

/**
 * A click on a step shows it in the bar, its node clear of the bar and whole on its canvas, and the bar says what the node says and what
 * the step waits on; again closes it; another step, on this canvas or another workflow's, switches it; Enter shows one; the empty canvas
 * closes it.
 */
async function presses(page: Page): Promise<void> {
  await canvasOf(page, good.name).scrollIntoViewIfNeeded();
  await nodeOf(page, good.name, WAITS).click();
  const bar = await expectSpec(page, 'repo', good.name, WAITS, `a click on ${WAITS}'s node shows the step in the bar`);
  await expectVisible(bar.getByRole('heading', { name: WAITS }), `the bar is titled ${WAITS}`);
  await expectVisible(bar.getByText(`a step of ${good.name} · this repository`), `and says it is a step of ${good.name}, the repository's`);
  await expectVisible(bar.locator('[data-runs-on]', { hasText: new RegExp(`^${good.runsOn}$`) }), `what it runs on (${good.runsOn})`);
  await expectVisible(
    bar.locator('dd', { hasText: new RegExp(`^${good.loop}$`) }),
    `its keys as its node lists them, its loop (${good.loop})`,
  );
  await expectVisible(bar.locator('[data-waits-on]', { hasText: new RegExp(`^${FIRST}$`) }), `and the step it waits on, ${FIRST}`);
  await settled(page);
  const node = nodeOf(page, good.name, WAITS);
  await expectLeftOf(node, bar, `${WAITS}'s node is clear of the bar`);
  await expectInside(node, canvasOf(page, good.name), 'and whole on its narrowed canvas');
  await photograph(page, path.join(OUT, `workflow-bar-open-${await themeOf(page)}.png`));

  await nodeOf(page, good.name, WAITS).click();
  await expectNoBar(page, `a click on ${WAITS}'s node again closes the bar`);
  await expectCount(page.locator('.react-flow [data-inspected]'), 0, 'and no node is ringed');
  await settled(page);

  await nodeOf(page, good.name, FIRST).click();
  const first = await expectSpec(page, 'repo', good.name, FIRST, `a click on ${FIRST}'s node shows it`);
  await expectVisible(first.locator('[data-waits-on]', { hasText: /^nothing: it starts first$/ }), `${FIRST} waits on nothing`);
  await settled(page);
  await nodeOf(page, good.name, WAITS).click();
  await expectSpec(page, 'repo', good.name, WAITS, `a click on ${WAITS}'s node then switches the bar to it`);
  await settled(page);
  const [mine] = yours.steps;
  await visit(page, `${pageOf('yours', yours.name)}?bar=spec:repo/${good.name}/${WAITS}`);
  await expectVisible(specBar(page, 'repo', good.name, WAITS), `the bar showing ${WAITS} stays open on ${yours.name}'s page`);
  await nodeOf(page, yours.name, mine).click();
  const theirs = await expectSpec(
    page,
    'yours',
    yours.name,
    mine,
    `a click on ${mine}'s node, on ${yours.name}'s page, switches the bar to it`,
  );
  await expectVisible(theirs.getByText(`a step of ${yours.name} · yours`), `and says it is a step of ${yours.name}, yours`);
  await settled(page);
  await clickPane(page, yours.name);
  await expectNoBar(page, 'a click on the empty canvas closes the bar');
  await visit(page, pageOf('repo', good.name));

  await nodeOf(page, good.name, FIRST).focus();
  await page.keyboard.press('Enter');
  await expectSpec(page, 'repo', good.name, FIRST, `Enter on ${FIRST}'s node shows it in the bar`);
  await page.keyboard.press('Escape');
  await expectNoBar(page, 'Escape closes it');
}

/** The bar's Open and a double click on a step each open the step's page, with no bar. */
async function opens(page: Page): Promise<void> {
  const to = `/workflows/repo/${good.name}/${WAITS}`;
  await nodeOf(page, good.name, WAITS).click();
  const bar = await expectSpec(page, 'repo', good.name, WAITS, `a click on ${WAITS}'s node shows it`);
  await bar.getByRole('link', { name: 'Open', exact: true }).click();
  await expectAt(page, to, "the bar's Open opens the step's page");
  await visit(page, pageOf('repo', good.name));
  await nodeOf(page, good.name, WAITS).dblclick();
  await expectAt(page, to, `a double click on ${WAITS}'s node opens its page`);
  if (barInUrl(page) !== null) throw new Refused(`the step's page opens with no bar — it is ${page.url()}`);
}

/**
 * Build, pressed from the keyboard under the bar that floats over it, swaps a workflow's canvas for its builder and closes the bar showing
 * one of its steps; a click on a step in the builder selects it for its form, and shows no bar.
 */
async function builds(page: Page): Promise<void> {
  const [mine] = yours.steps;
  await visit(page, pageOf('yours', yours.name));
  await nodeOf(page, yours.name, mine).click();
  await expectSpec(page, 'yours', yours.name, mine, `a click on ${mine}'s node shows it`);
  await page.getByRole('button', { name: 'Build', exact: true }).focus();
  await page.keyboard.press('Enter');
  const builder = page.locator(`section[data-builder="${yours.name}"]`);
  await expectVisible(builder, `Build opens ${yours.name}'s builder`);
  if (new URL(page.url()).searchParams.get('build') !== 'true')
    throw new Refused(`the address says the builder is open, ?build=true — it is ${page.url()}`);
  await expectNoBar(page, `and closes the bar showing a step of ${yours.name}`);
  await builder.locator(`.react-flow__node[data-id="${mine}"]`).click();
  await expectVisible(builder.locator(`[data-step-form="${mine}"]`), `a click on ${mine} in the builder selects it for its form`);
  await expectCount(builder.locator('[data-inspected]'), 0, "and the builder's node takes no mark of the bar's");
  await expectNoBar(page, 'and shows no bar');
  await builder.getByRole('button', { name: 'Close', exact: true }).click();
  await expectVisible(nodeOf(page, yours.name, mine), `Close puts ${yours.name}'s canvas back`);
  if (new URL(page.url()).searchParams.has('build')) throw new Refused(`and the address no longer says build — it is ${page.url()}`);
}

export default {
  /**
   * A workflow's canvas, on its page, and the frame's bar: a click or Enter on a step shows it in the bar, ringed, clear of the bar; the bar
   * says what it runs on, its keys and what it waits on; again, or the empty canvas, closes it, and another step, on this canvas or another
   * workflow's page, switches it. Open and a double click open the step's page. Build swaps the canvas for the builder, closes the bar showing one of its
   * steps, and keeps a click on a step to edit it.
   */
  name: 'workflow-bar',
  route: pageOf('repo', good.name),
  expect: async (page) => {
    await presses(page);
    await opens(page);
    await builds(page);
  },
} satisfies PageSpec;
