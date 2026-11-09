import fs from 'node:fs';
import path from 'node:path';
import type { Locator } from 'playwright';
import { fed, photograph, sidebar, themeOf, isRunAction } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { budgetWord } from '../../../src/lib/money.ts';
import { BUDGETING, writeBudgeting } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** Whether `r` is the POST of the approval of the gated step. */
const approving = (r: { request: () => { method: () => string }; url: () => string }) =>
  r.request().method() === 'POST' && isRunAction(new URL(r.url()).pathname, BUDGETING.id, `/steps/${BUDGETING.gated}/approve`);

/** The JSON of the approval file `file`, or nothing where it is not there. */
const approvalIn = (file: string): { budgets?: Record<string, number> } =>
  fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};

/** The rows of `budgets`, the one above its step's own budget saying so and the other not. */
async function expectRows(budgets: Locator, usd: { above: string; under: string }, when: string): Promise<void> {
  const { above, under } = BUDGETING;
  await expectCount(budgets.locator('[data-budget]'), 2, `${when}: a row for each step the gate budgets`);
  const high = budgets.locator(`[data-budget="${above.step}"]`);
  const low = budgets.locator(`[data-budget="${under.step}"]`);
  await expectVisible(
    high.locator('[data-above-words]', { hasText: `above the workflow's ${budgetWord(above.budget)}` }),
    `${when}: ${above.step}'s ${usd.above} is said above the workflow's own $${above.budget}, never applied silently`,
  );
  await expectVisible(high.locator('[data-own]', { hasText: `its own budget ${budgetWord(above.budget)}` }), `${when}: its own budget`);
  await expectVisible(high.locator('[data-why]', { hasText: above.why }), `${when}: and why the step proposed it`);
  await expectVisible(
    low.locator('[data-own]', { hasText: `its own budget ${budgetWord(under.budget)}` }),
    `${when}: ${under.step}'s own budget`,
  );
  await expectCount(low.locator('[data-above-words]'), 0, `${when}: ${under.step}'s ${usd.under} is under it, and says nothing above`);
  await expectVisible(budgets.locator('[data-said]'), `${when}: the run's line, what it spent and the most it may cost under these caps`);
}

export default {
  /**
   * A gate whose step proposes the budgets of the steps after it as data: drawn beside Approve, a row a step — its amount in a field, its
   * own budget, `above the workflow's $40` where it is above it, why — and the run's line. Review's amount changed from $8 to $6,
   * Approve sends that change alone (`budgets: [{ step: 'review', usd: 6 }]`); the api writes the caps into the approval, and the step,
   * read again, shows the caps its approval set (`gate.budgets.from === 'approved'`), implement's $60 still said above. Taken back, and
   * the run with it.
   */
  name: 'gate-budgets',
  route: '/runs',
  expect: async (page) => {
    await sidebar(page);
    const written = writeBudgeting(store!);
    const { id, gated, above, under } = BUDGETING;
    const asks = path.join(store!, 'runs', `${id}.asks`);
    try {
      await page.goto(new URL(`/runs/${id}`, page.url()).href, { waitUntil: 'load' });
      await idle(page);
      const theme = await themeOf(page);
      const gate = page.locator(`section[aria-label="The gate of ${gated}"]`);
      const proposed = gate.locator('section[data-gate-budgets="proposed"]');
      await expectVisible(proposed, `${gated}'s gate draws the budgets it proposes`);
      await expectRows(proposed, { above: `$${above.usd}`, under: `$${under.usd}` }, 'proposed');
      const field = (step: string) => proposed.getByRole('spinbutton', { name: `The budget of ${step}, in dollars` });
      for (const one of [above, under])
        if ((await field(one.step).inputValue()) !== String(one.usd))
          throw new Refused(`${one.step}'s field holds the proposal, ${one.usd} — it holds ${await field(one.step).inputValue()}`);
      await settled(page);
      await photograph(gate, path.join(OUT, `gate-budgets-proposed-${theme}.png`));

      await field(under.step).fill(String(under.given));
      const approve = gate.getByRole('button', { name: 'Approve', exact: true });
      const [approved] = await Promise.all([page.waitForResponse(approving, { timeout: WAIT_MS }), approve.click()]);
      const sent = approved.request().postDataJSON() as { budgets?: unknown };
      if (JSON.stringify(sent.budgets) !== JSON.stringify([{ step: under.step, usd: under.given }]))
        throw new Refused(`the approval sends the budget the person changed and no other — it sent ${JSON.stringify(sent)}`);
      if (approved.status() !== 202)
        throw new Refused(`the api takes the approval with its budgets — it answered ${approved.status()}: ${await approved.text()}`);
      const file = approvalIn(path.join(asks, `approve-${gated}-1`));
      if (file.budgets?.[above.step] !== above.usd || file.budgets[under.step] !== under.given || Object.keys(file.budgets).length !== 2)
        throw new Refused(`the approval holds the proposal's caps with the person's over them — it holds ${JSON.stringify(file)}`);

      const caps = page.locator(`section[aria-label="The approval of ${gated}"] section[data-gate-budgets="approved"]`);
      await expectVisible(caps, `read again, ${gated}'s approval shows the caps it set`);
      await expectRows(caps, { above: `$${above.usd}`, under: `$${under.given}` }, 'approved');
      await expectVisible(
        caps.locator(`[data-budget="${under.step}"] [data-amount]`, { hasText: `$${under.given.toFixed(2)}` }),
        `${under.step}'s cap is the amount the person gave`,
      );
      await expectVisible(
        caps.locator(`[data-budget="${above.step}"] [data-amount]`, { hasText: `$${above.usd.toFixed(2)}` }),
        `${above.step}'s is the proposal`,
      );
      await expectCount(caps.locator('input'), 0, 'approved, the caps are read only');
      await settled(page);
      await photograph(caps, path.join(OUT, `gate-budgets-approved-${theme}.png`));
    } finally {
      await page.goto(new URL('/runs', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      for (const file of written) fs.rmSync(file, { recursive: true, force: true });
      fed(id, 'removed');
    }
    await expectCount(page.locator(`a[href="/runs/${id}"]`), 0, 'taken back and said on the feed: the run is gone from the list');
  },
} satisfies PageSpec;
