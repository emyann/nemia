import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectNone, expectVisible, idle, Refused } from '../checks.ts';
import type { LibraryAgent, RunDetail, RunSummary } from '../../../src/lib/api.ts';
import { stepCardOf, type StepCardFacts } from '../../../src/lib/stepCard.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The rail of the table in flight. */
const FLIGHT = 'section[data-section="in-flight"]';

/** A phone's window, under Material's compact class, where a bar opens its card as a sheet. */
const PHONE = { width: 390, height: 844 };

/** What the api answers at `url`, read in the page as the board reads it. */
async function answer<T>(page: Page, url: string): Promise<T> {
  const text = await page.evaluate(async (at) => (await fetch(at)).text(), url);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Refused(`the api answers ${url} with JSON — it answered ${text.slice(0, 80)}`);
  }
}

/** A bar of the table in flight to open, the first of a step an agent works where the seed names one, and its run. */
async function aBar(page: Page): Promise<{ bar: Locator; run: string; step: string }> {
  const bars = await page
    .locator(`${FLIGHT} tr[data-run] [data-step-bar]`)
    .evaluateAll((found) =>
      found.map((bar) => ({ run: bar.closest('tr')!.getAttribute('data-run')!, step: bar.getAttribute('data-step-bar')! })),
    );
  if (bars.length === 0) throw new Refused('the table in flight draws its rails as buttons — no bar is a button');
  const runs = await answer<RunSummary[]>(page, '/api/runs');
  const worked = bars.find(({ run, step }) => runs.find((r) => r.id === run)?.steps.find((s) => s.name === step)?.agent);
  const { run, step } = worked ?? bars[0];
  return { bar: page.locator(`${FLIGHT} tr[data-run="${run}"] [data-step-bar="${step}"]`), run, step };
}

/** The card the board's rule gives for the step, from the api's own answers. */
async function expected(page: Page, run: string, step: string): Promise<StepCardFacts> {
  const [runs, detail, agents] = await Promise.all([
    answer<RunSummary[]>(page, '/api/runs'),
    answer<RunDetail>(page, `/api/runs/${encodeURIComponent(run)}`),
    answer<LibraryAgent[]>(page, '/api/agents'),
  ]);
  const row = runs.find((r) => r.id === run);
  if (!row) throw new Refused(`the api lists the run in flight ${run}`);
  return stepCardOf({ run: row, step, detail, agents, now: new Date() });
}

/** That `card` says the agent, the time box's label, the five facts and the action the rule gives. */
async function readsAsExpected(card: Locator, want: StepCardFacts, where: string): Promise<void> {
  await expectNone(async () => {
    const got = {
      agent: await card.locator('[data-step-agent]').textContent(),
      time: await card.locator('[data-step-time] > :first-child').textContent(),
      facts: await card.locator('[data-step-facts] dd').allTextContents(),
      action: (await card.locator('[data-step-action]').textContent())?.trim(),
    };
    const wanted = {
      agent: want.agent?.name ?? 'no agent',
      time: want.time?.label ?? null,
      facts: want.facts?.map((fact) => fact.value) ?? [],
      action: want.action.words,
    };
    return JSON.stringify(got) === JSON.stringify(wanted) ? null : `${JSON.stringify(got)} against ${JSON.stringify(wanted)}`;
  }, `${where}: the card reads the step's agent, time, five facts and action as the api answers them`);
}

/** The preview's card, open beside its bar. */
const previewOf = (page: Page): Locator => page.locator('[data-slot="preview-card"] [data-step-card]');

/** Whether `bar` holds the focus. */
const focusedOn = (bar: Locator): Promise<boolean> => bar.evaluate((found) => found === document.activeElement);

/**
 * That `press` on the card's action opens the step's page, which is left once its session's stream is open, every read before it
 * answered, for the runs page again.
 */
async function followed(page: Page, run: string, step: string, press: () => Promise<void>): Promise<void> {
  const streaming = page.waitForRequest((request) => request.url().includes('/transcript/stream'));
  await press();
  const at = `/runs/${encodeURIComponent(run)}/steps/${encodeURIComponent(step)}`;
  await expectNone(async () => (new URL(page.url()).pathname === at ? null : page.url()), `the action opens ${at}`);
  await streaming;
  await page.goto(new URL('/runs', page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/**
 * By the keyboard: the row in flight takes the focus, as the table's arrows move it, and Right walks it along the row's controls to
 * the bar; the card opens, reading what the api says of the step; Tab moves into it, to its action, and Enter on the action opens
 * the step's page. Escape on the bar closes it.
 */
async function byTheKeyboard(page: Page, bar: Locator, run: string, step: string, want: StepCardFacts): Promise<void> {
  const reach = async () => {
    await page.locator(`${FLIGHT} tr[data-run="${run}"]`).focus();
    for (let at = 0; at < 12 && !(await focusedOn(bar)); at += 1) await page.keyboard.press('ArrowRight');
    if (!(await focusedOn(bar))) throw new Refused("the table's arrows reach the bar along its row");
    await expectVisible(previewOf(page), 'a bar the keyboard focuses opens its step card');
  };
  await reach();
  await readsAsExpected(previewOf(page), want, 'by the keyboard');
  await page.keyboard.press('Escape');
  await expectCount(previewOf(page), 0, 'Escape closes the preview');
  await reach();
  await page.keyboard.press('Tab');
  const action = previewOf(page).locator('[data-step-action]');
  await expectNone(
    async () => ((await focusedOn(action)) ? null : 'focus is elsewhere'),
    'Tab from the bar moves into the card, to its action',
  );
  await followed(page, run, step, () => page.keyboard.press('Enter'));
}

/** By the pointer: hovering the bar opens the card, which stays while the pointer moves onto it, and its action opens the step's page. */
async function byThePointer(page: Page, bar: Locator, run: string, step: string, want: StepCardFacts): Promise<void> {
  await page.mouse.move(0, 0);
  await bar.hover();
  await expectVisible(previewOf(page), 'a bar the pointer rests on opens its step card');
  await readsAsExpected(previewOf(page), want, 'by the pointer');
  await glowHasRoom(page, 'by the pointer');
  await photographCard(page, 'card');
  const action = previewOf(page).locator('[data-step-action]');
  await action.hover();
  await followed(page, run, step, () => action.click());
}

/** How far a frame's glow reaches past its edge: the look's `drop-shadow` of 10 pixels (`GLOW` in look/CutFrame.tsx). */
const GLOW_REACH = 10;

/**
 * That the open preview's frame stands inset in the preview's box by the glow's reach on every side, measured along the box's own
 * scroll: the box clips what passes its edge, so a frame that fills it loses its glow.
 */
async function glowHasRoom(page: Page, what: string): Promise<void> {
  const insets = await page.locator('[data-slot="preview-card"]').evaluate((box) => {
    const frame = box.querySelector('[data-cut-frame]')!.getBoundingClientRect();
    const outer = box.getBoundingClientRect();
    const top = frame.top - outer.top + box.scrollTop;
    const left = frame.left - outer.left + box.scrollLeft;
    return [top, left, box.scrollWidth - (left + frame.width), box.scrollHeight - (top + frame.height)].map(Math.floor);
  });
  if (insets.some((inset) => inset < GLOW_REACH))
    throw new Refused(
      `${what}: the frame stands ${GLOW_REACH} pixels inside the preview's box, room for its glow — top, left, right, bottom ${insets}`,
    );
}

/** At a gate: a waiting card's bar that waits for you opens its card in the frame that glows, the glow drawn whole. */
async function aGateGlows(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  const bar = page
    .locator('section[data-section="waiting"] [data-step-bar][data-step-preview="card"][aria-label$="waits for you"]')
    .first();
  await bar.hover();
  await expectVisible(previewOf(page), 'a bar at its gate opens its step card');
  await expectCount(page.locator('[data-slot="preview-card"] [data-cut-frame="yours"]'), 1, 'in the frame that glows');
  await glowHasRoom(page, 'at a gate');
  await photographCard(page, 'gate');
  await page.mouse.move(0, 0);
  await expectCount(previewOf(page), 0, 'the pointer gone, the preview closes');
}

/** A window too short for the card on either side of a bar: 1280 wide, 420 tall. */
const SHORT = { width: 1280, height: 420 };

/**
 * In a window too short for the card on either side of its bar: the card stays inside the window and scrolls within itself, so its
 * action is brought into view with the preview still open.
 */
async function inAShortWindow(page: Page, bar: Locator): Promise<void> {
  const size = page.viewportSize() ?? { width: 1280, height: 800 };
  await page.setViewportSize(SHORT);
  try {
    await bar.evaluate((found) => found.scrollIntoView({ block: 'center' }));
    await page.mouse.move(0, 0);
    await bar.hover();
    await expectVisible(previewOf(page), 'in a short window, the bar opens its step card');
    const popover = page.locator('[data-slot="preview-card"]');
    const box = await popover.evaluate((found) => {
      const rect = found.getBoundingClientRect();
      const scroller = getComputedStyle(found).overflowY;
      const scrolls = found.scrollHeight > found.clientHeight && (scroller === 'auto' || scroller === 'scroll');
      return { top: rect.top, bottom: rect.bottom, inner: innerHeight, scrolls };
    });
    if (box.top < 0 || box.bottom > box.inner || !box.scrolls)
      throw new Refused(`the card stays inside a short window and scrolls within itself — ${JSON.stringify(box)}`);
    const action = previewOf(page).locator('[data-step-action]');
    const seen = await action.evaluate((found) => {
      const before = scrollY;
      found.scrollIntoView({ block: 'nearest' });
      const rect = found.getBoundingClientRect();
      return { inside: rect.top >= 0 && rect.bottom <= innerHeight, pageMoved: scrollY !== before };
    });
    if (!seen.inside || seen.pageMoved)
      throw new Refused(`the card's action is brought into the short window by the card's own scroll — ${JSON.stringify(seen)}`);
    await expectCount(previewOf(page), 1, 'with the preview still open');
    await page.mouse.move(0, 0);
    await expectCount(previewOf(page), 0, 'the pointer gone, the preview closes');
  } finally {
    await page.setViewportSize(size);
  }
}

/** The page with the card open, in the page's theme. */
async function photographCard(page: Page, what: string): Promise<void> {
  await photograph(page, path.join(OUT, `runs-preview-${what}-${await themeOf(page)}.png`));
}

/**
 * On a phone's window: a press on a waiting card's bar opens the same card in a modal sheet named by the bar, and the scrim closes it,
 * focus back on the bar.
 */
async function onAPhone(page: Page): Promise<void> {
  const size = page.viewportSize() ?? { width: 1280, height: 800 };
  await page.setViewportSize(PHONE);
  try {
    const card = page.locator('section[data-section="waiting"] article[data-run]').first();
    const run = (await card.getAttribute('data-run')) ?? '';
    const bar = card.locator('[data-step-bar][data-step-preview="sheet"]').first();
    await expectVisible(bar, 'narrowed to a phone, the bars of a waiting card open their cards as a sheet');
    const want = await expected(page, run, (await bar.getAttribute('data-step-bar')) ?? '');
    const name = (await bar.getAttribute('aria-label')) ?? '';
    await bar.click();
    const sheet = page.getByRole('dialog', { name });
    await expectVisible(sheet.locator('[data-step-card]'), 'on a phone, a press on a bar opens its card in a sheet');
    await expectCount(page.locator('[data-slot="bottom-sheet"][data-variant="modal"]'), 1, 'the modal bottom sheet');
    await readsAsExpected(sheet.locator('[data-step-card]'), want, 'in the sheet');
    await photographCard(page, 'sheet');
    await page.mouse.click(PHONE.width / 2, 20);
    await expectCount(page.getByRole('dialog'), 0, 'a press on the scrim closes the sheet');
    await expectNone(async () => ((await focusedOn(bar)) ? null : 'focus is elsewhere'), 'focus goes back to the bar');
  } finally {
    await page.setViewportSize(size);
  }
}

export default {
  /**
   * A step's card on the runs page: each bar of a rail in flight is a button named by its step and word, which opens its step's card
   * by the keyboard and by the pointer, reading its agent, its time, its five facts and its action as the api answers them; the action
   * opens the step's page. On a phone's window a press opens the same card in a modal sheet, which the scrim closes. Writes nothing.
   */
  name: 'runs-preview',
  route: '/runs',
  expect: async (page) => {
    const { bar, run, step } = await aBar(page);
    const want = await expected(page, run, step);
    await byTheKeyboard(page, bar, run, step, want);
    await byThePointer(page, bar, run, step, want);
    await aGateGlows(page);
    await inAShortWindow(page, (await aBar(page)).bar);
    await onAPhone(page);
  },
} satisfies PageSpec;
