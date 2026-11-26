import type * as RunObject from 'objects';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, reachClock, themeOf, rowsAnswered, stepBar } from '../board.ts';
import { expectCount, expectNone, expectVisible, Refused } from '../checks.ts';
import type { RunLines } from '../../../src/lib/api/run.ts';
import { agentRowOf } from '../../../src/lib/api/agents.ts';
import { agentOf } from '../../../src/lib/api/judged.ts';
import { runDetailOf } from '../../../src/lib/runView.ts';
import { stepCardOf, type StepCardFacts } from '../../../src/lib/stepCard.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The rail of the table in flight. */
const FLIGHT = 'section[data-section="in-flight"]';

/** A laptop's window. */
const LAPTOP = { width: 1280, height: 800 };

/** A phone's window, under Material's compact class. */
const PHONE = { width: 390, height: 844 };

/** The most a glance is tall: a few lines, never scrolling. */
const GLANCE_HEIGHT = 200;

/** What the api answers at `url`, read in the page as the board reads it. */
async function answer<T>(page: Page, url: string) {
  const text = await page.evaluate(async (at) => (await fetch(at)).text(), url);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Refused(`the api answers ${url} with JSON — it answered ${text.slice(0, 80)}`);
  }
}

/** A bar of the table in flight to open, the first of a step an agent works where the seed names one, and its run. */
async function aBar(page: Page) {
  const bars = await page
    .locator(`${FLIGHT} tr[data-run] [data-step-bar]`)
    .evaluateAll((found) =>
      found.map((bar) => ({ run: bar.closest('tr')!.getAttribute('data-run')!, step: bar.getAttribute('data-step-bar')! })),
    );
  if (bars.length === 0) throw new Refused('the table in flight draws its rails as buttons — no bar is a button');
  const runs = await rowsAnswered(page);
  const worked = bars.find(({ run, step }) => {
    const listed = runs.find((r) => r.id === run)?.steps.find((s) => s.name === step);
    return listed !== undefined && agentOf(listed) !== null;
  });
  const { run, step } = worked ?? bars[0];
  return { bar: page.locator(`${FLIGHT} tr[data-run="${run}"] [data-step-bar="${step}"]`), run, step } satisfies {
    bar: Locator;
    run: string;
    step: string;
  };
}

/**
 * The card the board's rule gives for the step, from the api's own answers: the run's object, its lines and each of its steps' tries and
 * told, composed as the board composes them (`runDetailOf`): a step the api has none of reads as none, as the board's reads do.
 */
async function expected(page: Page, run: string, step: string) {
  const at = `/api/runs/${encodeURIComponent(run)}`;
  const [runs, object, lines, agents] = await Promise.all([
    rowsAnswered(page),
    answer<RunObject.Run>(page, at),
    answer<RunLines>(page, `${at}/lines`),
    answer<RunObject.AgentList>(page, '/api/namespaces/default/agents?origin=user').then((list) => list.items.map(agentRowOf)),
  ]);
  const row = runs.find((r) => r.id === run);
  if (!row) throw new Refused(`the api lists the run in flight ${run}`);
  const names = object.status.steps.map((s) => s.name);
  const sub = (name: string, what: 'tries' | 'told') => `${at}/steps/${encodeURIComponent(name)}/${what}`;
  const [tries, told] = await Promise.all([
    Promise.all(names.map((name) => answer<Partial<RunObject.StepTries>>(page, sub(name, 'tries')))),
    Promise.all(names.map((name) => answer<RunObject.StepTold | { error: string }>(page, sub(name, 'told')))),
  ]);
  const detail = runDetailOf(
    object,
    lines,
    Object.fromEntries(names.map((name, i) => [name, tries[i].tries ?? []])),
    Object.fromEntries(names.map((name, i) => [name, 'error' in told[i] ? null : told[i]])),
  );
  return stepCardOf({ run: row, step, detail, agents, unchecked: () => true, now: new Date() });
}

/** The glance a diamond shows, open beside its bar. */
const glanceOf = (page: Page) => page.locator('[data-slot="tooltip"] [data-step-glance]') satisfies Locator;

/** Whether `bar` holds the focus. */
const focusedOn = (bar: Locator) => bar.evaluate((found) => found === document.activeElement) satisfies Promise<boolean>;

/**
 * That the glance reads the four facts the rule gives for the step: its agent and model, its word and since, its try and round with its
 * spend, and its last line; that it is under a set height and never scrolls; and that it holds none of the session's static facts.
 */
async function glanceReads(page: Page, want: StepCardFacts, where: string) {
  const glance = glanceOf(page);
  await expectVisible(glance, `${where}: the glance is open`);
  const box = await glance.evaluate((found) => ({
    height: found.getBoundingClientRect().height,
    cut: found.scrollHeight - found.clientHeight,
  }));
  if (box.height >= GLANCE_HEIGHT || box.cut > 0)
    throw new Refused(`${where}: the glance is a few lines, under ${GLANCE_HEIGHT} pixels and never scrolling — ${JSON.stringify(box)}`);
  await expectCount(glance.locator('[data-step-facts]'), 0, `${where}: the session's static facts are not in the glance`);
  await expectNone(async () => {
    const who = (await glance.locator('[data-glance="who"]').textContent()) ?? '';
    const state = (await glance.locator('[data-glance="state"]').textContent()) ?? '';
    const place =
      (await glance
        .locator('[data-glance="place"]')
        .textContent()
        .catch(() => '')) ?? '';
    const note = want.note ? ((await glance.locator('[data-glance="note"]').textContent()) ?? '') : '';
    const missing = [
      who.includes(want.agent?.name ?? 'no agent') ? null : `agent ${want.agent?.name}`,
      want.model === null || who.includes(want.model) ? null : `model ${want.model}`,
      state.includes(want.tag.word) ? null : `word ${want.tag.word}`,
      want.place === null || place.includes(want.place) ? null : `round ${want.place}`,
      want.spend === null || place.includes(want.spend.said) ? null : `spend ${want.spend.said}`,
      want.note === null || note.includes(want.note.text.slice(0, 20)) ? null : `note ${want.note.text}`,
    ].filter(Boolean);
    return missing.length === 0 ? null : `${where}: the glance lacks ${missing.join(', ')}`;
  }, `${where}: the glance reads the step's agent, model, word, since, round, spend and last line as the api answers them`);
}

/** That the step's bar of the run is open in the frame's side sheet, and shut by its Close button. */
async function sheetOpens(page: Page, run: string, step: string, where: string) {
  const sheet = stepBar(page, run, step);
  await expectVisible(sheet, `${where}: the step opens in the side sheet`);
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  await expectCount(sheet, 0, `${where}: Close shuts the sheet`);
}

/**
 * By the pointer: hovering a diamond shows the glance, which reads as the rule gives; moving off closes it; a click opens the step in the
 * side sheet.
 */
async function byThePointer(page: Page, bar: Locator, run: string, step: string, want: StepCardFacts) {
  await page.mouse.move(0, 0);
  await bar.hover();
  await glanceReads(page, want, 'by the pointer');
  await photograph(page, path.join(OUT, `runs-preview-glance-${await themeOf(page)}.png`));
  await page.mouse.move(0, 0);
  await expectCount(glanceOf(page), 0, 'the pointer gone, the glance closes');
  await bar.click();
  await sheetOpens(page, run, step, 'by the pointer');
  await page.mouse.move(0, 0);
}

/** By the keyboard: the focus on a diamond shows the glance, and Enter opens the step in the side sheet. */
async function byTheKeyboard(page: Page, bar: Locator, run: string, step: string, want: StepCardFacts) {
  await page.mouse.move(0, 0);
  await page.keyboard.press('Shift');
  await bar.focus();
  if (!(await focusedOn(bar))) throw new Refused('the diamond takes the focus');
  await glanceReads(page, want, 'by the keyboard');
  await page.keyboard.press('Enter');
  await sheetOpens(page, run, step, 'by the keyboard');
  await bar.evaluate((found) => (found as HTMLElement).blur());
}

/** At a gate: a waiting card's diamond that waits on you shows its glance too, and a click opens its step. */
async function atAGate(page: Page) {
  const card = page.locator('section[data-section="waiting"] article[data-run]').first();
  const bar = card.locator('[data-step-bar][aria-label$="waiting"]').first();
  const run = (await card.getAttribute('data-run')) ?? '';
  const step = (await bar.getAttribute('data-step-bar')) ?? '';
  await page.mouse.move(0, 0);
  await bar.hover();
  await expectVisible(glanceOf(page), 'a diamond at its gate shows its glance');
  await page.mouse.move(0, 0);
  await bar.click();
  await sheetOpens(page, run, step, 'at a gate');
  await page.mouse.move(0, 0);
}

/** The breakdown a Clock cell's preview opens, wherever on the page it stands. */
const breakdownOf = (page: Page) => page.locator('[data-slot="tooltip"] [data-breakdown]') satisfies Locator;

/**
 * The Clock cell's own preview, beside the rail's: on a resting pointer and on focus it opens the breakdown, Escape and the focus
 * leaving close it, and it does not fight the rail's card — the pointer moving from a clock onto a bar leaves the card open and the
 * breakdown gone. Read in a laptop's window and at a phone's, where the rail's bars open a sheet instead and the clock's preview is
 * the same.
 */
async function theClockPreview(page: Page) {
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
      .filter({ has: page.locator('[data-step-bar]') })
      .first();
    const bar = barred.locator('[data-step-bar]').first();
    await barred.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await barred.locator('td[data-clock] button').hover();
    await expectVisible(breakdownOf(page), "the clock's breakdown opens on the row the rail's bars stand in");
    await bar.hover();
    await expectVisible(glanceOf(page), "the pointer slid onto a bar of the same row opens the step's glance");
    await expectCount(breakdownOf(page), 0, 'and the breakdown is gone: the two tooltips do not stand over each other');
    await page.mouse.move(0, 0);
    await expectCount(glanceOf(page), 0, 'the pointer gone, the glance closes');
  } finally {
    await page.setViewportSize(size);
  }
}

export default {
  /**
   * A step's diamond on the runs page: each is a button named by its step and word. Hovered or focused it shows a small card of a few
   * lines that never scrolls — the agent and model, the word and since, the round and spend, the last line — as the api answers them,
   * with none of the session's static facts. A click, or Enter, opens that step in the frame's side sheet, which Close shuts. The Clock
   * cell's own preview opens beside it, by the pointer and by the keyboard, at both widths, and the two do not fight. Writes nothing.
   */
  name: 'runs-preview',
  route: '/runs',
  expect: async (page) => {
    const { bar, run, step } = await aBar(page);
    const want = await expected(page, run, step);
    await byThePointer(page, bar, run, step, want);
    await byTheKeyboard(page, bar, run, step, want);
    await atAGate(page);
    await theClockPreview(page);
  },
} satisfies PageSpec;
