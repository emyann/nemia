import fs from 'node:fs';
import path from 'node:path';
import { fed, herChat, openChat, photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { ASKING, writeAsking } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** Her brief, naming the gated step and the step held on its budget by their links, as `bring-what-waits` teaches her. */
const BRIEF = [
  `Two steps wait on you. [${ASKING.gated} of ${ASKING.id}](/runs/${ASKING.id}?step=${ASKING.gated}) asks how the card is cut;`,
  `I would take Shape first, and send the answers with the approval.`,
  `[${ASKING.raised} of ${ASKING.id}](/runs/${ASKING.id}?step=${ASKING.raised}) is over its budget.`,
].join(' ');

export default {
  /**
   * A step her message links to is drawn under her words as the run's page's own part for it, read live: the gated step's gate, its
   * brief and its questions, and the step held on its budget, the Decide section's raise. Her bubble holds her words and none of the
   * step's questions. Answered in the chat, the approval goes to the step through the run's page's route, and the part then reads the
   * step as approved. Each part is pictured whole at the dock's width too, in a window tall enough that the dock holds it, since what a
   * person presses is below the dock's fold. The link's button still opens the run's page with the step's bar. Every write is taken
   * back, and the run with it.
   */
  name: 'chat-brought',
  route: '/runs',
  expect: async (page) => {
    const written = writeAsking(store!);
    const back = herChat({ session: 'up', said: [{ text: BRIEF }] });
    const { id, gated, raised, cut, where } = ASKING;
    try {
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      const panel = await openChat(page);
      const gate = panel.locator(`[data-chat-brought="gate"][data-run="${id}"][data-step="${gated}"]`);
      await expectVisible(
        gate.locator(`section[aria-label="What ${gated} asks of you"]`),
        "the gated step's gate, as the inspector draws it",
      );
      const asked = gate.locator(`section[aria-label="What ${gated} asks"]`);
      await expectCount(asked.locator('fieldset[data-question]'), 2, 'a field for each question the step asks');
      const bubble = panel.locator('[data-chat-bubble="agent"]');
      for (const title of [cut.title, where.title])
        await expectCount(bubble.filter({ hasText: title }), 0, `her words hold no copy of the step's question ${JSON.stringify(title)}`);

      const raise = panel.locator(`[data-chat-brought="answer"][data-step="${raised}"]`);
      await expectVisible(
        raise.locator(`[data-offer="raise"][data-step="${raised}"]`),
        'the step over its budget, the Decide row that raises it',
      );

      const approve = gate.getByRole('button', { name: 'Approve', exact: true });
      if (await approve.isEnabled()) throw new Refused('Approve waits for every answer, as on the run page');
      await gate.scrollIntoViewIfNeeded();
      await settled(page);
      const theme = await themeOf(page);
      await photograph(panel, path.join(OUT, `chat-brought-waiting-${theme}.png`));
      const size = page.viewportSize() ?? { width: 1280, height: 800 };
      await page.setViewportSize({ width: size.width, height: 2400 });
      for (const [part, what] of [
        [gate, 'gate'],
        [raise, 'raise'],
      ] as const) {
        await part.scrollIntoViewIfNeeded();
        await settled(page);
        await photograph(part, path.join(OUT, `chat-brought-${what}-${theme}.png`));
      }
      await page.setViewportSize(size);

      await asked.getByRole('button', { name: 'Choose the recommended answers' }).click();
      await asked.locator(`fieldset[data-question="${where.title}"] label[data-option="${where.options[1].label}"]`).click();
      const [approved] = await Promise.all([
        page.waitForResponse(
          (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/runs/${id}/steps/${gated}/approve`,
          { timeout: WAIT_MS },
        ),
        approve.click(),
      ]);
      if (approved.status() !== 202) throw new Refused(`the api takes the approval from the chat — it answered ${approved.status()}`);
      fed(id, gated, 'approved');
      const settledPart = panel.locator(`[data-chat-brought="settled"][data-step="${gated}"]`);
      await expectVisible(settledPart.locator(`section[aria-label="The approval of ${gated}"]`), 'read again, the step shows its approval');
      await expectCount(settledPart.getByRole('button', { name: 'Approve', exact: true }), 0, 'and offers no answer the api would refuse');
      await settledPart.scrollIntoViewIfNeeded();
      await settled(page);
      await photograph(panel, path.join(OUT, `chat-brought-answered-${await themeOf(page)}.png`));

      await panel.getByRole('link', { name: `${gated} of ${id}`, exact: true }).click();
      await page.waitForURL((url) => url.pathname === `/runs/${id}` && (url.searchParams.get('bar') ?? '') === `step:${id}/${gated}`, {
        timeout: WAIT_MS,
      });
    } finally {
      back();
      await page.goto(new URL('/runs', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      for (const file of written) fs.rmSync(file, { recursive: true, force: true });
      fs.rmSync(path.join(store!, 'runs', `${id}.asks`), { recursive: true, force: true });
      fed(id, 'removed');
    }
  },
} satisfies PageSpec;
