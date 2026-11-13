import type { Page } from 'playwright';
import { FINISHED_SELECTOR, OPEN_SELECTOR, UNDECIDED_SELECTOR } from '../../../src/lib/api/runs.ts';
import { showFinished } from '../canvas.ts';
import { expectVisible, idle, Refused } from '../checks.ts';
import { AGENTS, FACTORIES, GATED, hiringStarts, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { store } from '../world.ts';

/** The factory whose floor and start form the page reads: the one that holds runs. */
const FACTORY = FACTORIES.hiring.name;

/** A request to a list of the runs, every factory's or one factory's, by its path. */
const LIST = /^\/api\/(?:runs|namespaces\/[^/]+\/runs)$/;

/** What a reader asked of the api: each request's path and its decoded query. */
type Heard = { path: string; query: URLSearchParams };

/** Goes to `to` in this tab and waits for its reads. */
async function visit(page: Page, to: string): Promise<void> {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

/**
 * Refuses a reader that asked for a list of the runs with no `fieldSelector` (the whole list), or that did not ask for each selector of
 * `wanted`.
 */
function judge(reader: string, heard: readonly Heard[], wanted: readonly string[]): void {
  const lists = heard.filter((one) => LIST.test(one.path));
  const whole = lists.filter((one) => !one.query.has('fieldSelector'));
  if (whole.length)
    throw new Refused(`${reader} asks no list of the runs without a fieldSelector — it asked ${whole.map((one) => one.path).join(', ')}`);
  for (const selector of wanted)
    if (!lists.some((one) => one.query.get('fieldSelector') === selector))
      throw new Refused(
        `${reader} asks for ${selector} — it asked ${lists.map((one) => `${one.path}?${one.query}`).join(', ') || 'no list'}`,
      );
}

export default {
  /**
   * Every reader that once asked for every run asks for the light reads alone: the Overview and its strip, a factory's floor with Show
   * finished on, the start form's Wait for and Reads pickers, a run's Hold popover, and an agent's Try panel. Each asks for the runs not
   * finished (`status.state!=finished`), and those finished (`status.state=finished`) where it shows the finished, and no list of the runs
   * without a `fieldSelector`; the floor asks besides for the finished runs nobody decided (`status.outcome=undecided`), which it shows
   * whether Show finished is on or not. The checkout's `dev` is made able to start in `hiring` (`hiringStarts`) for the start form, and
   * taken back.
   */
  name: 'light-readers',
  route: '/agents',
  expect: async (page) => {
    let heard: Heard[] = [];
    const hear = (request: { url: () => string }) => {
      const url = new URL(request.url());
      heard.push({ path: url.pathname, query: url.searchParams });
    };
    const reading = async (reader: string, wanted: readonly string[], read: () => Promise<void>) => {
      heard = [];
      await read();
      await idle(page);
      judge(reader, heard, wanted);
    };
    page.on('request', hear);
    try {
      await reading('the Overview', [OPEN_SELECTOR, FINISHED_SELECTOR], async () => {
        await visit(page, '/');
        await expectVisible(page.locator(`[data-factory="${FACTORY}"]`).first(), `the Overview draws ${FACTORY}'s block`);
      });

      await reading("a factory's floor, Show finished on", [OPEN_SELECTOR, UNDECIDED_SELECTOR, FINISHED_SELECTOR], async () => {
        await visit(page, `/factories/${FACTORY}`);
        await showFinished(page);
        await expectVisible(page.locator('.react-flow__node').first(), 'the floor draws a card');
      });

      const starts = hiringStarts(store!);
      try {
        await reading("the start form's Wait for and Reads", [OPEN_SELECTOR, FINISHED_SELECTOR], async () => {
          await visit(page, `/workflows/repo/${WORKFLOWS.good.name}?factory=${FACTORY}`);
          await expectVisible(page.locator('ul[aria-label="Runs to wait on"] li[data-run]').first(), 'Wait for offers a run');
          await expectVisible(page.locator('ul[aria-label="Runs to read"] li[data-run]').first(), 'Reads offers a run');
        });
      } finally {
        starts();
      }

      await reading("a run's Hold popover", [OPEN_SELECTOR, FINISHED_SELECTOR], async () => {
        await visit(page, `/runs/${GATED.id}`);
        await page.locator('[data-hold-open]').click();
        const dialog = page.getByRole('dialog', { name: `Hold ${GATED.id}` });
        await expectVisible(dialog.locator('[data-hold-run]').first(), 'the Hold popover offers a run to wait on');
        await page.keyboard.press('Escape');
      });

      await reading("an agent's Try panel", [OPEN_SELECTOR, FINISHED_SELECTOR], async () => {
        await visit(page, `/agents/yours/${AGENTS.seeded.name}`);
        await expectVisible(page.locator('section[data-try-agent]'), 'the Try panel is drawn');
      });
    } finally {
      page.off('request', hear);
      await visit(page, '/agents');
    }
  },
} satisfies PageSpec;
