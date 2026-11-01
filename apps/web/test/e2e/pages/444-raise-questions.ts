import fs from 'node:fs';
import path from 'node:path';
import { fed, photograph, sidebar, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { ASKING, writeAsking } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  /**
   * A raise of a step that signed off blocked past its budget, asking a question as data: its row draws the question to answer by
   * choosing, with the recommended answer offered and a note beside it, and its button waits — disabled, what is unanswered on hover —
   * until it is answered. Chosen, the answer goes with the budget, and the api writes the try's ask as `nemia retry --budget` would, the
   * answer its words. The ask is taken back, and the run with it.
   */
  name: 'raise-questions',
  route: '/runs',
  expect: async (page) => {
    await sidebar(page);
    const written = writeAsking(store!);
    const { id, raised, tone } = ASKING;
    try {
      await page.goto(new URL(`/runs/${id}`, page.url()).href, { waitUntil: 'load' });
      await idle(page);
      const row = page.locator(`section[aria-label="Answer"] [data-offer="raise"][data-step="${raised}"]`);
      await expectVisible(row.locator(`fieldset[data-question="${tone.title}"]`), `${raised}'s raise asks its question as a field`);
      await expectCount(row.getByRole('textbox', { name: `Your answer to ${raised}` }), 0, 'answered by choosing, not in a box of words');
      const button = row.getByRole('button', { name: 'Raise the budget and answer' });
      if (await button.isEnabled()) throw new Refused('Raise the budget and answer waits for the answer — it was enabled with none');
      if ((await button.getAttribute('title')) !== `Not answered: ${tone.title}`)
        throw new Refused(`the button says what is not answered — it says ${await button.getAttribute('title')}`);
      await row.getByRole('button', { name: 'Choose the recommended answers' }).click();
      await expectVisible(row.locator('button[type="submit"]:enabled'), 'answered, the raise is offered');
      const amount = await row.getByRole('spinbutton', { name: new RegExp(`^The cap to raise ${raised} to, in dollars`) }).inputValue();
      if (amount !== '2') throw new Refused(`the box starts at the first whole dollar above ${ASKING.spent} — it starts at ${amount}`);
      await settled(page);
      await photograph(row, path.join(OUT, `raise-questions-answered-${await themeOf(page)}.png`));

      const [sent] = await Promise.all([
        page.waitForResponse(
          (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/runs/${id}/steps/${raised}/retry`,
          { timeout: WAIT_MS },
        ),
        button.click(),
      ]);
      if (sent.status() !== 202)
        throw new Refused(`the api takes the raise with its answer — it answered ${sent.status()}: ${await sent.text()}`);
      const file = path.join(store!, 'runs', `${id}.asks`, `retry-${raised}-2`);
      const ask = (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}) as {
        mode?: string;
        budget?: number;
        message?: string;
      };
      const told = [
        'Answers to your questions:',
        `1. ${tone.title}\n   Chose: ${tone.recommended} — ${tone.options[1].meaning}`,
        'Answered by: person, on the board',
      ].join('\n\n');
      if (ask.mode !== 'continue' || ask.budget !== 2 || ask.message !== told)
        throw new Refused(`the try is asked with the budget, the answer its words — ${file} holds ${JSON.stringify(ask)}`);
    } finally {
      await page.goto(new URL('/runs', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      for (const file of written) fs.rmSync(file, { recursive: true, force: true });
      fed(id, 'removed');
    }
    await expectCount(page.locator(`a[href="/runs/${id}"]`), 0, 'taken back and said on the feed: the run is gone from the list');
  },
} satisfies PageSpec;
