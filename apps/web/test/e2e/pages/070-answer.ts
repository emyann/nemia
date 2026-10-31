import fs from 'node:fs';
import path from 'node:path';
import { fed, photograph, sidebar, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { FAKE } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** What the `answer` page answers FAKE's blocked step with. */
const ANSWER = 'Keep it off the floor: a finished run is under Show finished.';

export default {
  /**
   * The board's second write: an answer refused, shown in the package's words, and then one taken, asked for through the api, with the
   * step's row saying what `wf ls` says. The refusal comes first, in a page of its own whose one refusal is the point: a file `wf retry`
   * did not write sits at the name try 2's ask goes under, which no tick honours, so the step still waits on you and its box is there, and
   * the package refuses to write over it, naming the file and saying it is not an ask (`strayAsk`). Its sentence is beside the box, word
   * for word, the answer still in the box, and nothing written, through the redraw that the decision read after it makes: the page holds
   * that read until the refusal is answered. Each file is taken back, so every page after this one, in either theme, reads the store as
   * seeded.
   */
  name: 'answer',
  route: `/runs/${FAKE.id}`,
  expect: async (page) => {
    await sidebar(page);
    const retried = (r: { request: () => { method: () => string }; url: () => string }) =>
      r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/runs/${FAKE.id}/steps/${FAKE.blocked}/retry`;
    const asks = path.join(store!, 'runs', `${FAKE.id}.asks`);
    const file = path.join(asks, `retry-${FAKE.blocked}-2`);

    fs.mkdirSync(asks, { recursive: true });
    fs.writeFileSync(file, '{}\n');
    const refused = await page.context().newPage();
    const decisionRead = (url: URL) => url.pathname === `/api/runs/${FAKE.id}/decision`;
    let release = (): void => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      const { problems } = watch(refused);
      await refused.route(decisionRead, async (route) => {
        await released;
        await route.continue();
      });
      await refused.goto(page.url(), { waitUntil: 'load' });
      const refusedRow = refused.locator(`section[aria-label="Answer"] [data-step="${FAKE.blocked}"]`);
      const refusedBox = refusedRow.getByRole('textbox', { name: `Your answer to ${FAKE.blocked}` });
      await expectVisible(refusedBox, `the answer box for ${FAKE.blocked}, with a file that is no ask at its try's name`);
      await refusedBox.fill(ANSWER);
      const [answered] = await Promise.all([
        refused.waitForResponse(retried, { timeout: WAIT_MS }),
        refusedRow.getByRole('button', { name: 'Answer and continue' }).click(),
      ]);
      const { error } = (await answered.json()) as { error?: string };
      if (
        answered.status() !== 409 ||
        !error?.startsWith(`try 2 of ${FAKE.blocked} cannot be asked for: `) ||
        !error.includes('it is not an ask')
      ) {
        throw new Refused(
          `the package refuses to write over the file at try 2's name — the api answered ${answered.status()}: ${JSON.stringify(error)}`,
        );
      }
      const decided = refused.waitForResponse((r) => decisionRead(new URL(r.url())), { timeout: WAIT_MS });
      release();
      await decided;
      await expectVisible(
        refused.locator('section[aria-label="Decide"] section[aria-label="Commands"]'),
        'what there is to decide is drawn after the refusal: its row is drawn again',
      );
      await expectVisible(refusedRow.locator('[data-refused]'), 'the refusal is shown beside the box, not swallowed');
      const shown = await refusedRow.locator('[data-refused] p.font-mono').textContent();
      if (shown !== error)
        throw new Refused(
          `the refusal beside the box is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`,
        );
      if ((await refusedBox.inputValue()) !== ANSWER) throw new Refused('the answer stays in the box after a refusal, to send again');
      const there = fs.readdirSync(asks);
      if (there.length !== 1 || fs.readFileSync(file, 'utf8') !== '{}\n')
        throw new Refused(`nothing is written on a refusal — ${asks} holds ${there.join(', ')}`);
      await settled(refused);
      await photograph(refused, path.join(OUT, `answer-refused-${await themeOf(refused)}.png`), { fullPage: true });
      await idle(refused);
      const expected = `request answered 409: POST ${answered.url()}`;
      const seen = problems();
      const others = seen.filter(
        (p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 409\b/.test(p),
      );
      if (!seen.includes(expected) || others.length)
        throw new Refused(
          `the refused page saw its one refusal, as its answer and the line Chromium writes to the console for one, and nothing else — it saw:\n    ${seen.join('\n    ')}`,
        );
    } finally {
      release();
      await refused.unrouteAll({ behavior: 'ignoreErrors' });
      await refused.close();
      fs.rmSync(file, { force: true });
    }

    const decide = page.locator('section[aria-label="Decide"]');
    const row = decide.locator(`section[aria-label="Answer"] [data-step="${FAKE.blocked}"]`);
    const box = row.getByRole('textbox', { name: `Your answer to ${FAKE.blocked}` });
    await expectVisible(box, `the answer box for ${FAKE.blocked}`);
    const send = row.getByRole('button', { name: 'Answer and continue' });
    if (await send.isEnabled()) throw new Refused('Answer and continue is disabled while there is no answer — it was enabled with none');
    await box.fill(ANSWER);
    const [response] = await Promise.all([page.waitForResponse(retried, { timeout: WAIT_MS }), send.click()]);
    if (response.status() !== 202)
      throw new Refused(`the api takes the answer, through the board's proxy — it answered ${response.status()}: ${await response.text()}`);

    const note = 'try 2 asked (--continue, with your answer) — the next tick files it';
    await expectVisible(
      decide.locator(`[data-asked][data-step="${FAKE.blocked}"] [data-note]`, { hasText: note }),
      `the step's row says what wf ls says once the run is read again (${note})`,
    );
    const section = page.locator('article > section', { has: page.getByRole('heading', { level: 2, name: FAKE.blocked, exact: true }) });
    await expectVisible(section.locator('[data-note]', { hasText: note }), `${FAKE.blocked}'s section says it too`);
    await expectCount(
      page.locator(`section[aria-label="Waiting on you"] [data-step="${FAKE.blocked}"]`),
      0,
      'and the banner no longer names it: nobody waits on you for it',
    );
    const written = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
    if (written?.mode !== 'nudge' || written?.message !== ANSWER) {
      throw new Refused(`the ask is written as wf retry writes it, with the answer — ${file} holds ${JSON.stringify(written)}`);
    }
    await settled(page);
    await photograph(page, path.join(OUT, `answer-asked-${await themeOf(page)}.png`), { fullPage: true });

    fs.rmSync(asks, { recursive: true, force: true });
    fed(FAKE.id, FAKE.blocked, 'blocked');
    await expectVisible(box, `with the ask taken back, ${FAKE.blocked} waits on you again, and its box is back once the run is read again`);
  },
} satisfies PageSpec;
