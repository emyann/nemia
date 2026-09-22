import fs from 'node:fs';
import path from 'node:path';
import type { Response } from 'playwright';
import { fed, themeOf } from '../board.ts';
import { cardOf, expectClearOfEachOther, expectClearOfPanels } from '../canvas.ts';
import { expectCount, expectVisible, Refused, settled, WAIT_MS } from '../checks.ts';
import { GATED } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  // A run held at a gate in its middle, on the default floor: nothing of it moves, the api reads it failed with nothing to decide about its
  // result, and it waits on a person all the same — so its card stays, says what it asks, and takes the answer. Before, the card left the
  // floor the moment its plan reached its gate. The approval is written, then taken back, so every page after reads the store as seeded.
  name: 'factory-mid-gate',
  route: '/',
  expect: async (page) => {
    const { id, gated } = GATED;
    const asks = path.join(store!, 'runs', `${id}.asks`);
    const approved = (r: Response) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/runs/${id}/steps/${gated}/approve`;
    await expectCount(page.getByRole('switch', { name: 'Show finished', checked: false }), 1, 'Show finished is off');
    // The floor as the grid lays it out, whatever the page before left open.
    await page.getByRole('button', { name: 'Reset layout' }).click();
    await settled(page);
    await expectClearOfEachOther(page);
    await expectClearOfPanels(page, 'after a Reset layout');

    const card = cardOf(page, id);
    await expectVisible(card, `a run held at ${gated}'s gate, in the middle of the run, is on the default floor: it waits on a person (${id})`);
    await expectVisible(card.getByText('waiting on you', { exact: true }), 'and says it waits on you');
    await expectVisible(card.locator(`[data-gate-line="${gated}"]`, { hasText: `approve what ${gated} handed on, or send it back` }), `and what approving ${gated} does`);
    await expectVisible(card.locator('[data-state="awaiting-approval"]', { hasText: 'awaiting approval' }), `and ${gated}'s chip, awaiting approval`);
    await settled(page);
    await page.screenshot({ path: path.join(OUT, `factory-mid-gate-${await themeOf(page)}.png`), fullPage: true });

    // Approved on the card, where it is: a press a person can make, clear of the legend, then the popover's.
    try {
      await card.locator('[data-answer="Approve"]').click();
      const approval = page.getByRole('dialog', { name: `Approve ${gated}` });
      await expectVisible(approval.getByText(`What waits on ${gated} is filed next, handed what it handed on.`), 'the popover says what approving files');
      const [response] = await Promise.all([
        page.waitForResponse(approved, { timeout: WAIT_MS }),
        approval.getByRole('button', { name: 'Approve', exact: true }).click(),
      ]);
      if (response.status() !== 202) throw new Refused(`the api takes the approval — it answered ${response.status()}: ${await response.text()}`);
      const file = path.join(asks, `approve-${gated}-1`);
      const written = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : undefined;
      if (written?.step !== gated || written?.try !== 1 || 'message' in written) {
        throw new Refused(`the approval is written as wf approve writes it, with no words — ${file} holds ${JSON.stringify(written)}`);
      }
      await expectVisible(card.locator('[data-taken]', { hasText: `approved — the next pass files what waits on ${gated}` }), 'the card says it is approved, and what comes next');
      await settled(page);
      await page.screenshot({ path: path.join(OUT, `factory-mid-gate-approved-${await themeOf(page)}.png`), fullPage: true });
    } finally {
      fs.rmSync(asks, { recursive: true, force: true });
      fed(id, gated, 'awaiting approval');
    }
    await expectVisible(card.locator('[data-answer="Approve"]'), 'with the approval taken back, the card offers the gate again, and the page ends as it began');
  },
} satisfies PageSpec;
