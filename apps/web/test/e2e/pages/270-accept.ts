import fs from 'node:fs';
import path from 'node:path';
import { fed, photograph, sidebar, themeOf } from '../board.ts';
import { expectCount, expectVisible, Refused, settled, WAIT_MS } from '../checks.ts';
import { LOOPING } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  /**
   * `nemia approve` of a loop out of rounds as a button: review on round 3 of 3 and asking again, approved as it stands from its run's
   * Answer section with a reason, through `POST …/approve`. The api calls the package's `accept()`, which writes the acceptance as
   * `nemia approve` does and nothing else, and the page reads the run move: the loop is over on the person's word, and nobody is waited on. Taken back, so every page after this one, and
   * this one in the other theme, reads the store as seeded.
   */
  name: 'accept',
  route: `/runs/${LOOPING.id}`,
  expect: async (page) => {
    await sidebar(page);
    const { id, exhausted: step } = LOOPING;
    const asks = path.join(store!, 'runs', `${id}.asks`);
    const recordFile = path.join(store!, 'runs', `${id}.json`);
    if (fs.existsSync(asks))
      throw new Refused(`the store is as seeded before the page presses anything — ${asks} holds ${fs.readdirSync(asks).join(', ')}`);
    const seededRecord = fs.readFileSync(recordFile, 'utf8');
    const decide = page.locator('section[aria-label="Decide"]');
    const row = decide.locator(`section[aria-label="Answer"] [data-offer="enough"][data-kind="approve"][data-step="${step}"]`);
    const form = row.locator(`form[aria-label="Approve ${step} as it stands"]`);
    const reason = form.getByRole('textbox', { name: `Why ${step}'s work is good enough as it stands` });
    const press = form.getByRole('button', { name: 'Approve as it stands', exact: true });
    const copied = decide.locator('[data-command="approve"]');
    const graph = page.locator(`section[aria-label="The run's steps as a graph"]`);
    const chip = graph.locator(`.react-flow__node[data-id="${step}"] [data-state="exhausted"]`);
    const section = page.locator('article > section', { has: page.getByRole('heading', { level: 2, name: step, exact: true }) });
    const waiting = page.getByText(`Waiting on you: ${step}`);

    await expectVisible(
      row.locator('code', { hasText: `nemia approve ${id} ${step} --message "<why>"` }),
      `the Answer section offers ${step}'s own approve line, with the reason a loop's requires`,
    );
    await expectVisible(
      copied.locator('code', { hasText: `nemia approve ${id} ${step} --message "<why>"` }),
      `the Commands section offers nemia approve ${id} ${step} to copy, as nemia decide prints it, labelled approve`,
    );
    await expectCount(copied.locator('form, textarea'), 0, 'and only copies it');
    await expectVisible(reason, `a box for why ${step}'s work is good enough as it stands`);
    if (await press.isEnabled())
      throw new Refused(
        'Approve as it stands is disabled while there is no reason, as the CLI waits for --message — it was enabled with none',
      );
    await reason.fill('   ');
    if (await press.isEnabled()) throw new Refused('Approve as it stands is disabled while the reason is only whitespace — it was enabled');
    await expectVisible(chip, `${step} reads rounds exhausted before it is accepted`);

    const message = 'Good enough to ship: the two findings left are for a later run.';
    await reason.fill(message);
    const accepted = (r: { request: () => { method: () => string }; url: () => string }) =>
      r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/runs/${id}/steps/${step}/approve`;
    try {
      const [response] = await Promise.all([page.waitForResponse(accepted, { timeout: WAIT_MS }), press.click()]);
      if (response.status() !== 202)
        throw new Refused(
          `the api takes the acceptance, through the board's proxy — it answered ${response.status()}: ${await response.text()}`,
        );
      const took = (await response.json()) as { step?: unknown; try?: unknown; at?: unknown; message?: unknown; file?: unknown };
      const file = path.join(asks, `accept-${step}-3`);
      if (took.step !== step || took.try !== 3 || typeof took.at !== 'string' || took.message !== message || took.file !== file) {
        throw new Refused(
          `the api answers with the step, the try accepted, when, the words and the acceptance's file — it answered ${JSON.stringify(took)}`,
        );
      }
      const written = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
      if (JSON.stringify(written) !== JSON.stringify({ step, try: 3, at: took.at, message }) || fs.readdirSync(asks).length !== 1) {
        throw new Refused(
          `the acceptance is written as nemia approve writes it, and nothing else — ${asks} holds ${fs.readdirSync(asks).join(', ')}, and ${file} ${JSON.stringify(written)}`,
        );
      }
      if (fs.readFileSync(recordFile, 'utf8') !== seededRecord)
        throw new Refused(`the api writes nothing of the run's record — ${recordFile} changed`);

      await expectVisible(
        section.locator('[data-note]', { hasText: `accepted as it stands at ${took.at}, its findings open` }),
        `${step}'s note says it was accepted as it stands, as wf ls says it`,
      );
      await expectCount(chip, 0, `${step} no longer reads rounds exhausted`);
      await expectCount(waiting, 0, `the run's page no longer says ${step} is waiting on you`);
      await expectCount(row, 0, 'and the Answer section offers its approval no more');
      await settled(page);
      await photograph(page, path.join(OUT, `accept-accepted-${await themeOf(page)}.png`), { fullPage: true });
    } finally {
      fs.rmSync(asks, { recursive: true, force: true });
      fed(id, step, 'rounds exhausted');
    }

    await expectVisible(chip, `with the acceptance taken back, ${step} reads rounds exhausted again`);
    await expectVisible(waiting, `and ${step} is waiting on you again`);
    await expectVisible(
      row.locator('code', { hasText: `nemia approve ${id} ${step}` }),
      'and the Answer section offers its approval again',
    );
    await settled(page);
  },
} satisfies PageSpec;
