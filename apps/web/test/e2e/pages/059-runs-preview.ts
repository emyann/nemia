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
const answer = <T>(page: Page, url: string): Promise<T> =>
  page.evaluate(async (at) => (await (await fetch(at)).json()) as unknown, url) as Promise<T>;

/** A bar of the table in flight to open, the first of a step an agent works where the seed names one, and its run. */
async function aBar(page: Page): Promise<{ bar: Locator; run: string; step: string }> {
  const bars = await page
    .locator(`${FLIGHT} tr[data-run] [data-bar]`)
    .evaluateAll((found) =>
      found.map((bar) => ({ run: bar.closest('tr')!.getAttribute('data-run')!, step: bar.getAttribute('data-bar')! })),
    );
  if (bars.length === 0) throw new Refused('the table in flight draws its rails as buttons — no bar is a button');
  const runs = await answer<RunSummary[]>(page, '/api/runs');
  const worked = bars.find(({ run, step }) => runs.find((r) => r.id === run)?.steps.find((s) => s.name === step)?.agent);
  const { run, step } = worked ?? bars[0];
  return { bar: page.locator(`${FLIGHT} tr[data-run="${run}"] [data-bar="${step}"]`), run, step };
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

/** By the keyboard: focus reaches the bar, and the card opens at once, reading what the api says of the step. */
async function byTheKeyboard(page: Page, bar: Locator, want: StepCardFacts): Promise<void> {
  await bar.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expectVisible(previewOf(page), 'a bar the keyboard focuses opens its step card');
  await readsAsExpected(previewOf(page), want, 'by the keyboard');
  await page.keyboard.press('Escape');
  await expectCount(previewOf(page), 0, 'Escape closes the preview');
}

/** By the pointer: hovering the bar opens the card, which stays while the pointer moves onto it, and its action opens the step's page. */
async function byThePointer(page: Page, bar: Locator, run: string, step: string, want: StepCardFacts): Promise<void> {
  await page.mouse.move(0, 0);
  await bar.hover();
  await expectVisible(previewOf(page), 'a bar the pointer rests on opens its step card');
  await readsAsExpected(previewOf(page), want, 'by the pointer');
  await photographCard(page, 'card');
  const action = previewOf(page).locator('[data-step-action]');
  await action.hover();
  await action.click();
  const at = `/runs/${encodeURIComponent(run)}/steps/${encodeURIComponent(step)}`;
  await expectNone(async () => (new URL(page.url()).pathname === at ? null : page.url()), `the action opens ${at}`);
  await page.goBack();
  await idle(page);
}

/** The page with the card open, in the page's theme. */
async function photographCard(page: Page, what: string): Promise<void> {
  await photograph(page, path.join(OUT, `runs-preview-${what}-${await themeOf(page)}.png`));
}

/** On a phone's window: a press on the bar opens the same card in a modal sheet named by the bar, and the scrim closes it, focus back on the bar. */
async function onAPhone(page: Page, run: string, step: string, want: StepCardFacts): Promise<void> {
  const size = page.viewportSize() ?? { width: 1280, height: 800 };
  await page.setViewportSize(PHONE);
  try {
    const bar = page.locator(`${FLIGHT} tr[data-run="${run}"] [data-bar="${step}"]`);
    const name = (await bar.getAttribute('aria-label')) ?? '';
    await bar.click();
    const sheet = page.getByRole('dialog', { name });
    await expectVisible(sheet.locator('[data-step-card]'), 'on a phone, a press on a bar opens its card in a sheet');
    await expectCount(page.locator('[data-slot="bottom-sheet"][data-variant="modal"]'), 1, 'the modal bottom sheet');
    await readsAsExpected(sheet.locator('[data-step-card]'), want, 'in the sheet');
    await photographCard(page, 'sheet');
    await page.mouse.click(PHONE.width / 2, 20);
    await expectCount(page.getByRole('dialog'), 0, 'a press on the scrim closes the sheet');
    await expectNone(
      async () => ((await bar.evaluate((found) => found === document.activeElement)) ? null : 'focus is elsewhere'),
      'focus goes back to the bar',
    );
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
    await byTheKeyboard(page, bar, want);
    await byThePointer(page, bar, run, step, want);
    await onAPhone(page, run, step, want);
  },
} satisfies PageSpec;
