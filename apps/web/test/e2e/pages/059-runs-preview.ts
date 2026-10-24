import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, reachClock, themeOf } from '../board.ts';
import { expectCount, expectNone, expectVisible, idle, Refused } from '../checks.ts';
import type { LibraryAgent, RunDetail, RunSummary } from '../../../src/lib/api.ts';
import { stepCardOf, type StepCardFacts } from '../../../src/lib/stepCard.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The rail of the table in flight. */
const FLIGHT = 'section[data-section="in-flight"]';

/** A laptop's window, where a card opened from any bar stands beside its rail and shows its action whole, with no scroll. */
const LAPTOP = { width: 1280, height: 800 };

/** A window too narrow for a card beside a waiting card's rail, where the card stands under the rail or over it. */
const MEDIUM = { width: 1000, height: 800 };

/** Every rail on the page, in flight and in the waiting cards, as the group its bars stand in. */
const railsOf = (page: Page): Locator =>
  page
    .locator(`${FLIGHT} [data-run-steps], section[data-section="waiting"] [data-run-steps]`)
    .filter({ has: page.locator('button[data-step-bar][data-step-preview="card"]') });

/**
 * What the one open card shows, read beside `rail`: its action inside the window and inside the preview's box, how far the box is
 * scrolled, whether the box stands inside the window across, and the bars of the rail whose centre the box stands over.
 */
const seenBy = (rail: Locator): Promise<Record<string, unknown> & { covered: string[] }> =>
  rail.evaluate((found) => {
    const box = document.querySelector('[data-slot="preview-card"]')!;
    const action = box.querySelector('[data-step-action]')!.getBoundingClientRect();
    const own = box.getBoundingClientRect();
    const covered = [...found.querySelectorAll<HTMLElement>('button[data-step-bar]')].flatMap((bar) => {
      const rect = bar.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit?.closest('button') === bar ? [] : [bar.getAttribute('data-step-bar')!];
    });
    return {
      inWindow: action.top >= 0 && action.left >= 0 && action.bottom <= innerHeight && action.right <= innerWidth,
      inBox: action.top >= own.top && action.bottom <= own.bottom && action.left >= own.left && action.right <= own.right,
      scrollTop: box.scrollTop,
      across: own.left >= 0 && own.right <= innerWidth,
      covered,
    };
  });

/**
 * Brings `rail` to the window's `edge`, then slides the pointer from bar to bar of `bars`, never leaving the rail: each bar opens its own
 * card, read once its run is, which stands over no bar of the rail and inside the window across; where `unscrolled`, its action shows
 * whole inside the window and the preview, the preview unscrolled. Refuses the first bar that does not, naming the window.
 */
async function slideAlong(page: Page, rail: Locator, bars: Locator[], edge: 'center' | 'end', unscrolled: boolean): Promise<void> {
  const where = JSON.stringify(page.viewportSize());
  await rail.evaluate((found, block) => found.scrollIntoView({ block }), edge);
  await page.mouse.move(0, 0);
  await expectCount(previewOf(page), 0, 'no card open before the pointer comes to the rail');
  for (const bar of bars) {
    const [name, said, box] = await Promise.all([bar.getAttribute('data-step-bar'), bar.getAttribute('aria-label'), bar.boundingBox()]);
    if (!box) throw new Refused(`the bar "${said}" is drawn`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
    await expectCount(previewOf(page), 1, `in ${where}, the pointer slid onto "${said}" leaves one card open`);
    await expectVisible(page.locator(`[data-step-card][data-step-name="${name}"] [data-step-facts]`), `"${said}" opens its own card`);
    await idle(page);
    const seen = await seenBy(rail);
    const whole = seen.inWindow && seen.inBox && seen.scrollTop === 0;
    if (seen.covered.length > 0 || !seen.across || (unscrolled && !whole))
      throw new Refused(
        `in ${where}, the card of "${said}" at the window's ${edge} stands clear of its rail, inside the window` +
          `${unscrolled ? ', its action whole and unscrolled' : ''} — ${JSON.stringify(seen)}`,
      );
  }
}

/**
 * The pointer slides along every rail, in flight and in the waiting cards, from bar to bar: in a laptop's window, each rail brought to
 * the window's centre, every bar's card stands clear of the rail and shows its action unscrolled, and so does the last bar's with its
 * rail at the window's foot; in a medium window, each rail at the centre, every card stands clear of its rail and inside the window
 * across. The window is put back after.
 */
async function alongEachRail(page: Page): Promise<void> {
  const size = page.viewportSize() ?? LAPTOP;
  try {
    for (const [sized, unscrolled] of [
      [LAPTOP, true],
      [MEDIUM, false],
    ] as const) {
      await page.setViewportSize(sized);
      await expectCount(page.locator('[data-step-bar][data-step-preview="sheet"]'), 0, 'a wide window opens no sheet');
      const rails = await railsOf(page).all();
      if (rails.length < 2) throw new Refused(`rails in flight and in the waiting cards — ${rails.length}`);
      for (const rail of rails) {
        const bars = await rail.locator('button[data-step-bar]').all();
        await slideAlong(page, rail, bars, 'center', unscrolled);
        if (unscrolled) await slideAlong(page, rail, bars.slice(-1), 'end', unscrolled);
      }
    }
    await page.mouse.move(0, 0);
    await expectCount(previewOf(page), 0, 'the pointer gone, the preview closes');
  } finally {
    await page.setViewportSize(size);
  }
}

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

/** At a gate: a waiting card's bar that waits on you opens its card in the frame that glows, the glow drawn whole. */
async function aGateGlows(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  const bar = page.locator('section[data-section="waiting"] [data-step-bar][data-step-preview="card"][aria-label$="waits on you"]').first();
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

/** The breakdown a Clock cell's preview opens, wherever on the page it stands. */
const breakdownOf = (page: Page): Locator => page.locator('[data-slot="tooltip"] [data-breakdown]');

/**
 * The Clock cell's own preview, beside the rail's: on a resting pointer and on focus it opens the breakdown, Escape and the focus
 * leaving close it, and it does not fight the rail's card — the pointer moving from a clock onto a bar leaves the card open and the
 * breakdown gone. Read in a laptop's window and at a phone's, where the rail's bars open a sheet instead and the clock's preview is
 * the same.
 */
async function theClockPreview(page: Page): Promise<void> {
  const size = page.viewportSize() ?? LAPTOP;
  const first = page.locator(`${FLIGHT} tr[data-run]`).first();
  const clock = first.locator('td[data-clock] button');
  try {
    for (const sized of [LAPTOP, PHONE]) {
      const where = JSON.stringify(sized);
      await page.setViewportSize(sized);
      await clock.scrollIntoViewIfNeeded();
      await page.mouse.move(0, 0);
      await expectCount(breakdownOf(page), 0, `in ${where}, no breakdown is open before the pointer comes to a clock`);
      await clock.hover();
      await expectVisible(breakdownOf(page), `in ${where}, a clock the pointer rests on opens its breakdown`);
      await page.mouse.move(0, 0);
      await expectCount(breakdownOf(page), 0, 'the pointer gone, it closes');
      await reachClock(page, first, 'in-flight');
      await expectVisible(breakdownOf(page), `in ${where}, a clock the keyboard reaches opens it, with no pointer`);
      await page.keyboard.press('Escape');
      await expectCount(breakdownOf(page), 0, 'Escape closes it');
      await first.focus();
      await reachClock(page, first, 'in-flight');
      await expectVisible(breakdownOf(page), 'left and reached again, it opens again');
      await first.focus();
      await expectCount(breakdownOf(page), 0, 'the focus gone from the clock, it closes');
    }
    await page.setViewportSize(LAPTOP);
    const barred = page
      .locator(`${FLIGHT} tr[data-run]`)
      .filter({ has: page.locator('[data-step-bar][data-step-preview="card"]') })
      .first();
    const bar = barred.locator('[data-step-bar]').first();
    await barred.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await barred.locator('td[data-clock] button').hover();
    await expectVisible(breakdownOf(page), "the clock's breakdown opens on the row the rail's bars stand in");
    await bar.hover();
    await expectVisible(previewOf(page), "the pointer slid onto a bar of the same row opens the step's card");
    await expectCount(breakdownOf(page), 0, 'and the breakdown is gone: the two previews do not stand over each other');
    await page.mouse.move(0, 0);
    await expectCount(previewOf(page), 0, 'the pointer gone, the card closes');
  } finally {
    await page.setViewportSize(size);
  }
}

export default {
  /**
   * A step's card on the runs page: each bar of a rail in flight is a button named by its step and word, which opens its step's card
   * by the keyboard and by the pointer, reading its agent, its time, its five facts and its action as the api answers them; the action
   * opens the step's page. On a phone's window a press opens the same card in a modal sheet, which the scrim closes. The Clock cell's
   * own preview opens beside it, by the pointer and by the keyboard, at both widths, and the two do not fight. Writes nothing.
   */
  name: 'runs-preview',
  route: '/runs',
  expect: async (page) => {
    const { bar, run, step } = await aBar(page);
    const want = await expected(page, run, step);
    await byTheKeyboard(page, bar, run, step, want);
    await byThePointer(page, bar, run, step, want);
    await aGateGlows(page);
    await alongEachRail(page);
    await inAShortWindow(page, (await aBar(page)).bar);
    await onAPhone(page);
    await theClockPreview(page);
  },
} satisfies PageSpec;
