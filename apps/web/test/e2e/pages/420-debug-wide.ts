import path from 'node:path';
import type { Locator } from 'playwright';
import { openDebug, sidebar, themeOf } from '../board.ts';
import { expectCount, expectInView, expectTexts, expectVisible, idle, Refused, settled } from '../checks.ts';
import { FAKE, SESSION } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The smallest a state's name may be shown full width, in the page's own pixels: the size of the page's small print. */
const NAME_PX = 12;

/** The smallest an event on a route taken may be shown full width, in the page's own pixels. */
const EVENT_PX = 10;

/** The text size `element` is shown at, in the page's own pixels: its font's size scaled by the zoom its canvas draws it at. */
const shownPx = (element: Locator): Promise<number> =>
  element.evaluate((e) => {
    const el = e as HTMLElement;
    return (parseFloat(getComputedStyle(el).fontSize) * el.getBoundingClientRect().height) / el.offsetHeight;
  });

/** The smallest text size any element of `elements` is shown at, in the page's own pixels. */
const smallestPx = async (elements: Locator): Promise<number> => Math.min(...(await Promise.all((await elements.all()).map(shownPx))));

export default {
  /**
   * The Debug panel fits the lifecycle into its own width and height, too small to read; Full width opens the same graph in a sheet as
   * wide as the window, at its own size. Scrubbed in the panel to working, the sheet lights working and the two routes taken, its names at
   * a size a person reads — measured as shown, larger than the panel's — and its lit state in view. Scrubbed to the end in the sheet,
   * completed is lit, the sheet's body follows it down, and the panel shows the same entry once the sheet is closed. Reads the store as
   * seeded and writes nothing.
   */
  name: 'debug-wide',
  route: `/runs/${FAKE.id}/steps/${SESSION.step}`,
  expect: async (page) => {
    await sidebar(page);
    const { panel, lifecycle } = await openDebug(page, `${FAKE.id}-${SESSION.step}`);
    await panel.getByRole('list', { name: 'The path' }).locator('li').nth(2).getByRole('button').click();
    await expectVisible(lifecycle.locator('[data-state="working"][data-lit]'), 'scrubbed in the panel to its third entry: working lit');
    await idle(page);
    await settled(page);
    const inPanel = await shownPx(lifecycle.locator('[data-state="working"] [data-state-name]'));

    await panel.getByRole('button', { name: 'Full width' }).click();
    const sheet = page.getByRole('dialog');
    await expectVisible(
      sheet.getByRole('heading', { name: "The task's path through the runtime's lifecycle" }),
      'Full width opens a sheet',
    );
    const wide = sheet.locator('[data-machine="lifecycle"]');
    await expectVisible(wide, 'drawing the lifecycle');
    await expectCount(wide.locator('[data-state][data-lit]'), 1, 'one state lit in the sheet');
    const lit = wide.locator('[data-state="working"][data-lit]');
    await expectVisible(lit, 'the one the panel shows: working');
    const taken = wide.locator('[data-route][data-taken]');
    await expectCount(taken, 2, 'and the two routes taken to get there');
    await expectTexts(sheet.locator('[data-shown]'), ['Entry 3 of 5'], 'the sheet shows the entry the panel shows');
    await settled(page);

    const inSheet = await shownPx(lit.locator('[data-state-name]'));
    if (inSheet < NAME_PX)
      throw new Refused(`full width, the lit state's name is shown at ${NAME_PX} px or more — it is ${inSheet.toFixed(1)} px`);
    if (!(inPanel < inSheet))
      throw new Refused(
        `the sheet shows the name larger than the panel does — ${inSheet.toFixed(1)} px full width, ${inPanel.toFixed(1)} px in the panel`,
      );
    const events = await smallestPx(taken.locator('[data-edge-line]'));
    if (events < EVENT_PX)
      throw new Refused(
        `full width, the events on the routes taken are shown at ${EVENT_PX} px or more — the smallest is ${events.toFixed(1)} px`,
      );
    const body = sheet.locator('[data-wide-body]');
    await expectInView(lit, body, 'the lit state lies in the sheet’s view');
    await sheet.screenshot({ path: path.join(OUT, `debug-wide-open-${await themeOf(page)}.png`) });

    await sheet.getByRole('slider', { name: "The path's entry shown" }).press('End');
    const completed = wide.locator('[data-state="completed"][data-lit]');
    await expectVisible(completed, 'scrubbed to the end in the sheet: completed lit');
    await expectCount(taken, 4, 'with the four routes taken');
    await expectTexts(sheet.locator('[data-shown]'), ['Entry 5 of 5, the newest'], 'the sheet says it shows the newest');
    await expectInView(completed, body, 'the sheet’s body follows the lit state down into view');
    await settled(page);
    await sheet.screenshot({ path: path.join(OUT, `debug-wide-scrubbed-${await themeOf(page)}.png`) });

    await sheet.getByRole('button', { name: 'Close' }).click();
    await expectCount(page.getByRole('dialog'), 0, 'the sheet closed');
    await expectTexts(panel.locator('[data-shown]'), ['Entry 5 of 5, the newest'], 'the panel shows the entry scrubbed to in the sheet');
    await expectVisible(lifecycle.locator('[data-state="completed"][data-lit]'), 'completed lit in the panel too');
  },
} satisfies PageSpec;
