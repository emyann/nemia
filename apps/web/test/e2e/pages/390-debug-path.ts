import path from 'node:path';
import { photograph, sidebar, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled } from '../checks.ts';
import { FAKE, SESSION } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The path of FAKE's implement as its seeded journal has it: each state, the entry that put it there. */
const WORDS = ['submitted ← filed', 'starting ← starting', 'working ← spawned', 'ending ← ended', 'completed ← settled'];

/** The routes of the lifecycle that path takes, as the drawing names them. */
const TAKEN = ['submitted->starting', 'starting->working', 'working->ending', 'ending->completed'];

export default {
  /**
   * A settled step's Debug panel: closed as the page opens, with nothing of the lifecycle drawn; opened, its task's path, each state its
   * journal says with the entry that put it there, drawn over the lifecycle's graph — the state it stands in lit and the routes it took
   * to get there drawn over the graph's. A person scrubs back, by an entry of the timeline or the slider's keys, and the lit state and
   * the routes taken move back with them. Its lifecycle is a drawing: a click on a state inspects nothing. Reads the store as seeded and
   * writes nothing.
   */
  name: 'debug-path',
  route: `/runs/${FAKE.id}/steps/${SESSION.step}`,
  expect: async (page) => {
    await sidebar(page);
    const panel = page.getByRole('region', { name: 'Debug' });
    const trigger = panel.getByRole('button', { name: /Debug$/ });
    await expectVisible(trigger, 'the step has a Debug panel');
    if ((await trigger.getAttribute('aria-expanded')) !== 'false')
      throw new Refused(`the Debug panel is closed as the page opens — aria-expanded is ${await trigger.getAttribute('aria-expanded')}`);
    await expectCount(panel.locator('[data-machine]'), 0, 'closed, it draws nothing of the lifecycle');

    const url = new URL(`/api/runs/${FAKE.id}/steps/${SESSION.step}/path`, page.url()).href;
    const served = (await (await page.request.get(url)).json()) as { taskId: string; path: Array<{ state: string; event: string }> };
    const said = served.path.map((s) => `${s.state} ← ${s.event}`);
    if (served.taskId !== `${FAKE.id}-${SESSION.step}` || said.join(' | ') !== WORDS.join(' | '))
      throw new Refused(`the api serves the seeded journal's path — ${served.taskId}: ${said.join(', ')}`);

    await trigger.click();
    await expectVisible(panel.locator(`[data-path="${served.taskId}"]`), 'opened, the panel draws the current try’s task');
    const lifecycle = panel.locator('[data-machine="lifecycle"]');
    await expectVisible(lifecycle, 'over the lifecycle’s graph');
    const entries = panel.getByRole('list', { name: 'The path' }).locator('li');
    await expectCount(entries, WORDS.length, 'one entry of the timeline for each entry of the path');
    const read = await entries.evaluateAll((all) => all.map((li) => li.querySelector('[data-said]')?.textContent));
    if (read.join(' | ') !== WORDS.join(' | '))
      throw new Refused(`the timeline reads each state and the entry that put it there, in order — it reads ${read.join(', ')}`);
    const lit = lifecycle.locator('[data-state][data-lit]');
    await expectCount(lit, 1, 'one state lit');
    await expectVisible(lifecycle.locator('[data-state="completed"][data-lit]'), 'the state the task stands in: completed');
    await expectTexts(
      panel.locator('[data-shown]'),
      [`Entry ${WORDS.length} of ${WORDS.length}, the newest`],
      'the timeline shows the newest entry',
    );
    const taken = lifecycle.locator('[data-route][data-taken]');
    await expectCount(taken, TAKEN.length, 'each route the path took drawn over the graph');
    for (const route of TAKEN) await expectVisible(lifecycle.locator(`[data-route="${route}"][data-taken]`), `${route} taken`);
    await idle(page);
    await settled(page);
    await photograph(panel, path.join(OUT, `debug-path-open-${await themeOf(page)}.png`));

    await entries.nth(2).getByRole('button').click();
    await expectVisible(lifecycle.locator('[data-state="working"][data-lit]'), 'scrubbed to its third entry: working lit');
    await expectCount(lit, 1, 'and it alone');
    await expectCount(taken, 2, 'and only the two routes taken to get there');
    await expectVisible(entries.nth(2).and(page.locator('[aria-current="step"]')), 'the entry shown is marked');

    await panel.getByRole('slider', { name: "The path's entry shown" }).press('ArrowLeft');
    await expectVisible(lifecycle.locator('[data-state="starting"][data-lit]'), 'a step back on the slider: starting lit');
    await expectCount(taken, 1, 'one route taken');
    await expectTexts(panel.locator('[data-shown]'), [`Entry 2 of ${WORDS.length}`], 'the timeline says which entry it shows');
    await settled(page);
    await photograph(panel, path.join(OUT, `debug-path-scrubbed-${await themeOf(page)}.png`));

    const before = new URL(page.url()).searchParams.get('bar');
    await lifecycle.locator('[data-state="working"]').click({ force: true });
    await expectCount(lifecycle.locator('[data-inspected]'), 0, "a click on a state of the panel's lifecycle inspects nothing");
    await expectCount(page.locator('aside[data-bar^="state:"]'), 0, 'and shows no state in the bar');
    const after = new URL(page.url()).searchParams.get('bar');
    if (after !== before) throw new Refused(`and leaves the address's bar as it was, ${before} — it is ${after}`);
  },
} satisfies PageSpec;
