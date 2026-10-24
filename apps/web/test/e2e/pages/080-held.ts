import fs from 'node:fs';
import path from 'node:path';
import { fed, photograph, sidebar, themeOf } from '../board.ts';
import { expectCount, expectUncut, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { HELD } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  /**
   * The board continues a session the harness blocked, as `wf retry` does. Its node spends its one narrow line on the wait, read whole.
   * Continue is refused first, in a page of its own, where a file `wf retry` did not write sits at try 2's ask name (`strayAsk`): the
   * package's sentence is beside the button, word for word, and nothing is written or stopped. Then it is taken: the ask written as a nudge
   * with nothing said, the session left to the tick, and what the tick does with it said in the banner and in the Decide section. The page
   * takes the ask back, so every page after it, in either theme, reads the store as seeded.
   */
  name: 'held',
  route: `/runs/${HELD.id}`,
  expect: async (page) => {
    await sidebar(page);
    const said = `blocked by the harness: ${HELD.wait} · ${HELD.line}`;
    const banner = page.locator('section[aria-label="Waiting on you"]');
    const need = banner.locator(`[data-need="harness"][data-step="${HELD.blocked}"]`);
    await expectVisible(
      need.getByText(`${HELD.blocked} is ${said}`),
      'the banner names the harness, what it waits for, and what the session said last',
    );
    await expectVisible(
      need.locator('[data-advice]', { hasText: HELD.advice }),
      'and under them where a person answers the wait: in Claude Code, naming the session',
    );
    await expectCount(banner.getByText(/^Waiting on you:/), 0, "nobody is waiting on you in the package's words: the step asked nothing");

    const graph = page.locator(`section[aria-label="The run's steps as a graph"]`);
    const node = graph.locator(`.react-flow__node[data-id="${HELD.blocked}"]`);
    await expectVisible(
      node.locator('[data-state="needs-human"]', { hasText: 'asks you' }),
      "the step's chip, needs-human, reads asks you",
    );
    const nodeNeed = node.locator('[data-need="harness"]');
    await expectVisible(
      nodeNeed.filter({ hasText: new RegExp(`^${HELD.wait}$`) }),
      'its node spends its one narrow line on what the harness waits for',
    );
    await expectUncut(nodeNeed, "and says it whole: the line is the node's width, and the wait has to fit it");
    if ((await nodeNeed.getAttribute('title')) !== said)
      throw new Refused(`the whole of it is on hover — the node's title is ${JSON.stringify(await nodeNeed.getAttribute('title'))}`);
    await expectCount(node.locator('[data-advice]'), 0, 'and not where to answer it: a node has one line, and the banner says that');
    await expectCount(node.locator('[data-gate-band]'), 0, 'and is no human gate: nothing was asked of a person');

    const retried = (r: { request: () => { method: () => string }; url: () => string }) =>
      r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/runs/${HELD.id}/steps/${HELD.blocked}/retry`;
    const asks = path.join(store!, 'runs', `${HELD.id}.asks`);
    const file = path.join(asks, `retry-${HELD.blocked}-2`);
    const journal = path.join(store!, 'engine', 'tasks', `${HELD.id}-${HELD.blocked}.jsonl`);
    const seeded = fs.readFileSync(journal, 'utf8');

    fs.mkdirSync(asks, { recursive: true });
    fs.writeFileSync(file, '{}\n');
    const refused = await page.context().newPage();
    try {
      const { problems } = watch(refused);
      await refused.goto(page.url(), { waitUntil: 'load' });
      await idle(refused);
      const refusedNeed = refused.locator(`section[aria-label="Waiting on you"] [data-need="harness"][data-step="${HELD.blocked}"]`);
      const refusedButton = refusedNeed.getByRole('button', { name: 'Continue' });
      await expectVisible(refusedButton, `Continue for ${HELD.blocked}, with a file that is no ask at its try's name`);
      const [answered] = await Promise.all([refused.waitForResponse(retried, { timeout: WAIT_MS }), refusedButton.click()]);
      const { error } = (await answered.json()) as { error?: string };
      if (
        answered.status() !== 409 ||
        !error?.startsWith(`try 2 of ${HELD.blocked} cannot be asked for: `) ||
        !error.includes('it is not an ask')
      ) {
        throw new Refused(
          `the package refuses to write over the file at try 2's name — the api answered ${answered.status()}: ${JSON.stringify(error)}`,
        );
      }
      await expectVisible(refusedNeed.locator('[data-refused]'), 'the refusal is shown beside Continue, not swallowed');
      const shown = await refusedNeed.locator('[data-refused] p.font-mono').textContent();
      if (shown !== error)
        throw new Refused(
          `the refusal beside Continue is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`,
        );
      await expectVisible(refusedButton, 'and Continue stays, to press again');
      const there = fs.readdirSync(asks);
      if (there.length !== 1 || fs.readFileSync(file, 'utf8') !== '{}\n')
        throw new Refused(`nothing is written on a refusal — ${asks} holds ${there.join(', ')}`);
      if (fs.readFileSync(journal, 'utf8') !== seeded) throw new Refused(`nothing is stopped on a refusal — ${journal} changed`);
      await settled(refused);
      await photograph(refused, path.join(OUT, `held-refused-${await themeOf(refused)}.png`), { fullPage: true });
      await idle(refused);
      const expected = `request answered 409: POST ${answered.url()}`;
      const seen = problems();
      const others = seen.filter(
        (p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 409\b/.test(p),
      );
      if (!seen.includes(expected) || others.length)
        throw new Refused(
          `the refused page saw its one refusal as the browser reports it (its answer, and the line Chromium writes to the console for one) and nothing else — it saw:\n    ${seen.join('\n    ')}`,
        );
    } finally {
      await refused.close();
      fs.rmSync(file, { force: true });
    }

    const button = need.getByRole('button', { name: 'Continue' });
    await expectVisible(button, 'the banner offers Continue for a session the harness blocked');
    await expectVisible(
      need.getByRole('textbox', { name: `What to tell ${HELD.blocked}, if anything` }),
      'and a box for anything to tell it',
    );
    if (!(await button.isEnabled())) throw new Refused('Continue is enabled with nothing written: a nudge needs no message');
    await expectCount(banner.locator('[data-copy], [data-unblock]'), 0, 'no command to copy: the board continues the session itself');
    await expectCount(
      page.locator('section[aria-label="Decide"]'),
      0,
      'no Decide section before the try is asked: nothing to decide while the run runs',
    );

    const [response] = await Promise.all([page.waitForResponse(retried, { timeout: WAIT_MS }), button.click()]);
    if (response.status() !== 202)
      throw new Refused(`the api takes Continue, through the board's proxy — it answered ${response.status()}: ${await response.text()}`);
    const took = (await response.json()) as { try?: unknown; file?: unknown; stopFirst?: unknown };
    if (took.try !== 2 || took.file !== file || took.stopFirst !== true) {
      throw new Refused(`the api answers with the try, its ask file and the package's stopFirst — it answered ${JSON.stringify(took)}`);
    }
    const written = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
    if (written?.step !== HELD.blocked || written?.try !== 2 || written?.mode !== 'nudge' || 'message' in written) {
      throw new Refused(`the ask is written as wf retry writes a nudge with nothing said — ${file} holds ${JSON.stringify(written)}`);
    }
    if (fs.readFileSync(journal, 'utf8') !== seeded) throw new Refused(`the api stops no session, the tick does — ${journal} changed`);

    const note = 'try 2 asked (--nudge) — stopping its blocked session, then the tick files it';
    await expectVisible(
      need.locator('[data-note]', { hasText: note }),
      `the banner says the session is stopped, then the try filed, in wf ls's words (${note})`,
    );
    await expectCount(need.getByRole('button', { name: 'Continue' }), 0, 'and offers Continue no more: the try is asked');
    await expectCount(
      need.locator('[data-advice]'),
      0,
      'nor where to answer the prompt: the next tick stops that session, and the note says what was asked',
    );
    const decide = page.locator('section[aria-label="Decide"]');
    await expectVisible(
      decide.locator(`[data-offer="asked"][data-step="${HELD.blocked}"] [data-note]`, { hasText: note }),
      'the Decide section is drawn, as for any run with a try asked, and says it too',
    );
    const section = page.locator('article > section', { has: page.getByRole('heading', { level: 2, name: HELD.blocked, exact: true }) });
    await expectVisible(section.locator('[data-note]', { hasText: note }), `and ${HELD.blocked}'s own section`);
    await settled(page);
    await photograph(page, path.join(OUT, `held-asked-${await themeOf(page)}.png`), { fullPage: true });

    fs.rmSync(asks, { recursive: true, force: true });
    fed(HELD.id, HELD.blocked, 'needs-human');
    await expectVisible(
      need.getByRole('button', { name: 'Continue' }),
      'with the ask taken back, Continue is back once the run is read again',
    );
    await expectCount(page.locator('section[aria-label="Decide"]'), 0, 'and the Decide section goes with the try');
    await settled(page);
  },
} satisfies PageSpec;
