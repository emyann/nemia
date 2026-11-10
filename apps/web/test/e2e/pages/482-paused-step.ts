import type * as RunObject from 'objects';
import path from 'node:path';
import type { Page } from 'playwright';
import type { Parked, Paused } from '../../../src/lib/api/pause.ts';

import { parkedSentence } from '../../../src/lib/pause.ts';
import { PERSON } from '../../../src/lib/words.ts';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled } from '../checks.ts';
import { FAKE } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** A step of a run's object, as its status holds it. */
type Step = RunObject.RunStepStatus;

/** The tool the parked session's last call ran, which its hover names. */
const TOOL = 'Bash';

/**
 * What the package says of a step whose session the store's pause parked after a tool call (`Paused` in the package's feed/reason.ts):
 * its codes, which the board draws by, and its words, which it only shows.
 */
const PARKED_WORDS = {
  phase: 'running',
  reason: 'Paused',
  on: null,
  via: null,
  message: `paused after its call to ${TOOL}`,
  verdict: null,
  note: null,
} as const satisfies Partial<Step>;

/** The session the pause parked, as `GET /api/pause` names it. */
const PARKED: Parked = { run: FAKE.id, step: FAKE.refused, after: TOOL };

/** The pause standing, with the store's timeout, nothing finishing under it, and FAKE's step parked. */
const PAUSED: Paused = {
  pause: { at: new Date().toISOString(), by: 'ann', why: 'restarting the daemon', timeoutMs: 600_000 },
  finishing: [],
  parked: [PARKED],
  staged: [],
  held: [],
};

/** Whether `url` is the read of FAKE's run, never one of its steps'. */
const fakeRead = (url: URL) => url.pathname === `/api/runs/${FAKE.id}`;

/** Whether `url` is the read of the store's pause, never what a pause at once would stop. */
const pauseRead = (url: URL) => url.pathname === '/api/pause';

/** The top bar's pause: its one button. */
const pauseOf = (page: Page) => page.locator('header[data-frame-header] button[data-pause]');

export default {
  /**
   * A step whose session the store's pause parked between two tool calls, on its run's page: the api's reads of FAKE's run and of the
   * pause held with `route`, its refused step worded as the package words a parked step, and the pause standing with that step parked and
   * nothing finishing. The step's chip on the graph reads `paused`, its hover what that means and the call it stopped after; the top
   * bar's pause reads Paused, and its popover names the parked step by that call. Which sessions park, and when, is the runtime's and the
   * package's judgement, proven in their own tests (`packages/agent-orchestrator/src/pause/pause.test.ts`). The page writes nothing to
   * the store.
   */
  name: 'paused-step',
  route: '/factories/default',
  expect: async (page) => {
    const theme = await themeOf(page);
    await page.route(fakeRead, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const read = (await (await route.fetch()).json()) as RunObject.Run;
      const steps = read.status.steps.map((s) => (s.name === FAKE.refused ? { ...s, ...PARKED_WORDS } : s));
      return route.fulfill({ json: { ...read, status: { ...read.status, steps } } });
    });
    await page.route(pauseRead, (route) => (route.request().method() === 'GET' ? route.fulfill({ json: PAUSED }) : route.fallback()));
    try {
      await page.goto(new URL(`/runs/${FAKE.id}`, page.url()).href, { waitUntil: 'load' });
      await idle(page);
      const graph = page.locator(`section[aria-label="The run's steps as a graph"]`);
      const chip = graph.locator(`.react-flow__node[data-id="${FAKE.refused}"] [data-state="paused"]`);
      await expectTexts(chip, [PERSON.paused.rail], 'a step the pause parked is drawn paused');
      const title = (await chip.getAttribute('title')) ?? '';
      if (!title.startsWith(PERSON.paused.meaning))
        throw new Refused(`its hover says what paused means — it says ${JSON.stringify(title)}`);
      if (!title.includes(PARKED_WORDS.message))
        throw new Refused(`its hover names the call it stopped after, ${TOOL} — it says ${JSON.stringify(title)}`);

      const button = pauseOf(page);
      await expectTexts(button.and(page.locator('[data-pause="paused"]')), ['Paused'], 'with nothing finishing, the pause reads Paused');
      await button.click();
      const popover = page.locator('[data-pause-popover]');
      await expectVisible(popover, 'the button opens its popover');
      await expectTexts(popover.getByRole('heading'), ['Paused'], "the popover's heading is the state, Paused");
      await expectTexts(popover.locator('[data-pause-parked] li'), [parkedSentence(PARKED)], 'and names the parked step by its call');
      await expectCount(popover.locator('[data-pause-finishing]'), 0, 'nothing is finishing under the pause');
      await settled(page);
      await photograph(page, path.join(OUT, `paused-step-popover-${theme}.png`));
      await page.keyboard.press('Escape');
      await expectCount(popover, 0, 'Escape closes the popover');
      await settled(page);
      await photograph(graph, path.join(OUT, `paused-step-run-${theme}.png`));
    } finally {
      await page.unroute(fakeRead);
      await page.unroute(pauseRead);
    }
    await page.goto(new URL('/factories/default', page.url()).href, { waitUntil: 'load' });
    await idle(page);
  },
} satisfies PageSpec;
