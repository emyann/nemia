import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import type { Paused } from '../../../src/lib/api/pause.ts';
import { finishingSentence } from '../../../src/lib/pause.ts';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled } from '../checks.ts';
import { FAKE, GATED } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The top bar's pause: its one button. */
const pauseOf = (page: Page) => page.locator('header[data-frame-header] button[data-pause]');

/** The pause's popover. */
const popoverOf = (page: Page) => page.locator('[data-pause-popover]');

/** Why the page pauses all factories, given in the popover. */
const WHY = 'merging by hand on main';

/** Refuses unless the top bar's pause stands right before the gauges button. */
async function beforeTheGauges(page: Page): Promise<void> {
  const order = await page
    .locator('header[data-frame-header]')
    .locator('[data-pause], [data-gauges-button]')
    .evaluateAll((all) => all.map((el) => ('pause' in (el as HTMLElement).dataset ? 'pause' : 'gauges')));
  if (order.join() !== 'pause,gauges') throw new Refused(`the pause stands right before the gauges — the bar stands ${order.join(', ')}`);
}

/** Refuses unless the popover's heading is `state`: Running, Pausing or Paused. */
const headed = (page: Page, state: string) =>
  expectTexts(popoverOf(page).getByRole('heading'), [state], `the popover's heading is the state, ${state}`);

/** What the package words a step whose check the pause holds, and what it notes beside it. */
const HELD_WORDS = { status: 'waiting on the pause', note: 'its check is filed on nemia resume' };

/** Whether `url` is the read of FAKE's run, never one of its steps'. */
const fakeRead = (url: URL) => url.pathname === `/api/runs/${FAKE.id}`;

/**
 * Opens FAKE's page with the api's read of it held with `route`, its refused step worded as the package words a step whose check the
 * pause holds; refuses unless the step's chip is drawn waiting, in those words; photographs its graph, wide and on a phone's screen;
 * and goes back to the Factory.
 */
async function heldRun(page: Page, theme: string): Promise<void> {
  const size = page.viewportSize();
  await page.route(fakeRead, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const read = (await (await route.fetch()).json()) as { steps: { name: string }[] };
    const steps = read.steps.map((s) => (s.name === FAKE.refused ? { ...s, ...HELD_WORDS } : s));
    return route.fulfill({ json: { ...read, steps } });
  });
  try {
    await page.goto(new URL(`/runs/${FAKE.id}`, page.url()).href, { waitUntil: 'load' });
    await idle(page);
    const graph = page.locator(`section[aria-label="The run's steps as a graph"]`);
    const node = graph.locator(`.react-flow__node[data-id="${FAKE.refused}"]`);
    await expectTexts(
      node.locator('[data-state="waiting"]'),
      [HELD_WORDS.status],
      'a step whose check the pause holds is drawn waiting on the pause, never checking',
    );
    await settled(page);
    await photograph(graph, path.join(OUT, `pause-run-${theme}.png`));
    await page.setViewportSize({ width: 390, height: 844 });
    await idle(page);
    await settled(page);
    await photograph(graph, path.join(OUT, `pause-run-phone-${theme}.png`));
  } finally {
    if (size) await page.setViewportSize(size);
    await page.unroute(fakeRead);
  }
  await page.goto(new URL('/factories/default', page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/** Opens the popover and photographs the top bar's corner with it, as `<what>`. */
async function opened(page: Page, what: string): Promise<void> {
  await pauseOf(page).click();
  await expectVisible(popoverOf(page), 'the button opens its popover');
  await settled(page);
  await photograph(page, path.join(OUT, `pause-${what}-${await themeOf(page)}.png`));
}

export default {
  /**
   * All factories paused and resumed from the top bar's one button, right before the gauges, as `wf pause` and `wf resume` do
   * (`POST` and `DELETE /api/pause`), on the Factory. The popover's heading is the state: Running, Pausing or Paused. Running, the button
   * is a pause icon; its popover says what pausing all factories does and offers Pause… beside Pause now… (`pause-now`'s page).
   * Pause… asks an optional why, and once sent the pause's file holds it and the popover says since when, by whom and why: `Pausing · N`
   * while the seed's sessions are at work, as the api reads them, its popover naming each; once nothing finishes and a landing is held
   * with its merge staged and another step's check held — the api's answer held with `route` — `Paused, 2 checks held`, its popover
   * naming each; and on the run's page that step's chip is drawn waiting, `waiting on the pause`, the api's read of the run held with
   * `route` as the package words it. Which tasks finish, and which checks are held, is the package's judgement, proven in its own tests
   * (`packages/agent-orchestrator/src/tick/pause.test.ts`). On a phone's screen the button is still there, and its popover fits. Resume,
   * in the popover, takes the file away. The window's size is put back.
   */
  name: 'pause',
  route: '/factories/default',
  expect: async (page) => {
    const file = path.join(store!, 'cordon');
    const theme = await themeOf(page);
    const button = pauseOf(page);
    const popover = popoverOf(page);
    const size = page.viewportSize();
    try {
      await expectVisible(button.and(page.locator('[data-pause="running"]')), 'the top bar has the pause, all factories running');
      await beforeTheGauges(page);
      if (fs.existsSync(file)) throw new Refused(`no pause before the page puts one — ${file} is there`);
      await opened(page, 'running');
      await headed(page, 'Running');
      await expectTexts(
        popover.locator('[data-pause-line]'),
        ['Pause all factories: nothing new starts, and what runs finishes.'],
        'its popover says what pausing does, to all factories',
      );
      await expectTexts(
        popover.locator('[data-pause-actions] li'),
        ['Pause…', 'Pause now…'],
        'its actions: Pause… and Pause now…, all factories running',
      );

      await popover.getByRole('button', { name: 'Pause…' }).click();
      await expectVisible(popover.getByText('Pause all factories', { exact: true }), 'Pause… asks why first');
      if (fs.existsSync(file)) throw new Refused(`nothing is put while it asks why — ${file} is there`);
      await popover.locator('[data-pause-why]').fill(WHY);
      await settled(page);
      await photograph(page, path.join(OUT, `pause-why-${theme}.png`));
      await popover.getByRole('button', { name: 'Pause', exact: true }).click();
      await expectCount(popover, 0, 'sent, the popover closes once the api answered');
      if (!fs.existsSync(file)) throw new Refused(`the popover put the pause once the api answered — ${file} is not there`);
      const put = JSON.parse(fs.readFileSync(file, 'utf8')) as { at: string; by: string; why?: string };
      if (put.why !== WHY) throw new Refused(`the pause's file holds the why given, "${WHY}" — it holds ${JSON.stringify(put.why)}`);
      const read = (await (await page.request.get(new URL('/api/pause', page.url()).href)).json()) as Paused;
      const count = read.finishing.length;
      if (count === 0) throw new Refused("the seeded store has sessions at work, which finish under the pause — the api's read names none");
      await expectTexts(
        button.and(page.locator(`[data-pause="pausing"][data-finishing="${count}"]`)),
        [`Pausing · ${count}`],
        `with the seed's sessions at work, the button says Pausing · ${count}, as the api reads it`,
      );
      await opened(page, 'pausing');
      await headed(page, 'Pausing');
      await expectVisible(
        popover
          .locator('[data-pause-line]')
          .getByText(new RegExp(`^Pausing: ${count} finishing — paused since .+ by ${put.by}: ${WHY}\\. Nothing new starts`)),
        'its popover says how many finish, since when, by whom and why',
      );
      await expectTexts(popover.locator('[data-pause-finishing] li'), read.finishing.map(finishingSentence), 'and names each');
      await expectTexts(
        popover.locator('[data-pause-actions] li'),
        ['Pause now…', 'Resume'],
        'its actions: Pause now… and Resume, a pause standing while what runs finishes',
      );
      await page.keyboard.press('Escape');
      await expectCount(popover, 0, 'Escape closes the popover');

      const staged = { run: GATED.id, step: 'ship', repo: '/code/app' };
      const held = { run: FAKE.id, step: FAKE.refused };
      await page.route('**/api/pause', (route) =>
        route.request().method() === 'GET'
          ? route.fulfill({ json: { pause: put, finishing: [], staged: [staged], held: [held] } })
          : route.fallback(),
      );
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      await expectTexts(button.and(page.locator('[data-pause="paused"]')), ['Paused'], 'once nothing finishes, the button says Paused');
      await opened(page, 'paused');
      await headed(page, 'Paused');
      await expectVisible(
        popover
          .locator('[data-pause-line]')
          .getByText(new RegExp(`^Paused since .+ by ${put.by}: ${WHY}\\. Nothing runs and nothing new starts, 2 checks held\\.$`)),
        'its popover says since when, by whom and why, and how many checks it holds',
      );
      await expectTexts(
        popover.locator('[data-pause-staged] li'),
        [`${GATED.id}'s ship has its merge staged in /code/app (MERGE_HEAD), and its check waits on the resume`],
        'and the landing it holds with its merge staged',
      );
      await expectTexts(
        popover.locator('[data-pause-held] li'),
        [`${FAKE.id}'s ${FAKE.refused} has signed off, and its check waits on the resume`],
        'and each other check it holds',
      );
      await page.keyboard.press('Escape');
      await heldRun(page, theme);
      await page.unroute('**/api/pause');
      await page.reload({ waitUntil: 'load' });
      await idle(page);

      await expectVisible(button.and(page.locator('[data-pause="pausing"]')), 'read again, the pause still stands');
      await page.setViewportSize({ width: 390, height: 844 });
      await expectVisible(button.and(page.locator('[data-pause="pausing"]')), "on a phone's screen, the bar keeps the pause");
      await opened(page, 'phone');
      await page.keyboard.press('Escape');
      if (size) await page.setViewportSize(size);

      await pauseOf(page).click();
      await popover.getByRole('button', { name: 'Resume' }).click();
      await expectVisible(button.and(page.locator('[data-pause="running"]')), 'Resume resumes all factories');
      if (fs.existsSync(file)) throw new Refused(`Resume took the pause away once the api answered — ${file} is still there`);
      await expectCount(popover, 0, 'the popover closes once the api answered');
    } finally {
      await page.unroute('**/api/pause');
      fs.rmSync(file, { force: true });
      if (size) await page.setViewportSize(size);
      await idle(page);
    }
  },
} satisfies PageSpec;
