import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { fed, photograph, themeOf } from '../board.ts';
import { cardOf, expectClearOfEachOther, expectClearOfPanels, holdEdgeOf, photographCard } from '../canvas.ts';
import { expectCount, expectVisible, idle, literal, Refused, settled } from '../checks.ts';
import { GATED, HELD } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store, unreadName } from '../world.ts';

export default {
  /**
   * A run a person holds until another lands (`wf hold`), on the board, its floor laid out by Reset layout whatever the page before left
   * open: GATED, at plan's gate, held until HELD, a run in flight on the same repository and branch, which `wf hold` takes (`holdRefusal`).
   * Its card says the hold's word where its gate was, with how to lift it on hover, no Approve and not waiting on you; its steps read held;
   * an edge comes into it from HELD's card, drawn as an `--after` edge is. Its page says the hold and how to lift it, links HELD, and
   * offers no answer. The hold is written as `wf hold` writes it, then taken back as `wf hold --off` does and said on the feed, so every
   * page after reads the store as seeded — and the card, read again, offers its gate as it did. That hold is one older code wrote, with
   * no why and no name, and reads the plain line; the one written next has both (`heldWithWords`). HELD's repository is one no machine
   * has: the hold names it unread, in its place's words (`unreadName`).
   */
  name: 'hold',
  route: '/factories/default',
  expect: async (page) => {
    const { id, gated } = GATED;
    const until = HELD.id;
    const hold = path.join(store!, 'runs', `${id}.hold`);
    const word = `held until ${unreadName(until)} lands`;
    const advice = `nothing of ${id} is filed, and nothing is asked of you, until nemia decide says ${until} has landed; to go on before then: nemia hold ${id} --off`;
    await page.getByRole('button', { name: 'Reset layout' }).click();
    await settled(page);
    const card = cardOf(page, id);
    const edge = holdEdgeOf(page, until, id);
    await expectVisible(card.locator('[data-answer="Approve"]'), `before the hold, ${id}'s card offers ${gated}'s gate`);
    await expectCount(edge, 0, 'and no hold edge comes into it');

    try {
      if (fs.existsSync(hold)) throw new Refused(`no hold on ${id} before the page writes one — ${hold} is there`);
      fs.writeFileSync(hold, JSON.stringify({ at: new Date().toISOString(), until: [until] }, null, 2), { flag: 'wx' });
      fed(id, 'held');

      const said = card.locator('[data-holding="on-runs"]');
      await expectVisible(said.filter({ hasText: new RegExp(`^${literal(word)}$`) }), `the card says ${word}`);
      const title = await said.getAttribute('title');
      if (title !== `${word}\n${advice}`)
        throw new Refused(`the card's hold says itself whole and how to lift it on hover — it says ${JSON.stringify(title)}`);
      await expectCount(card.locator('[data-answer="Approve"]'), 0, 'and offers no Approve: the package refuses it on a held run');
      await expectCount(card.locator(`[data-gate-line="${gated}"]`), 0, 'nor says what approving would do');
      await expectCount(card.getByText('waiting on you', { exact: true }), 0, 'and does not say it waits on you');
      await expectVisible(card.getByText('held', { exact: true }), 'its badge says held');
      for (const step of GATED.steps) {
        await expectVisible(
          card.locator(`ul[aria-label="Steps"] [data-step="${step}"][data-state="held"]`),
          `${step}'s pill on its rail is held`,
        );
      }
      await expectCount(edge, 1, `an edge comes into ${id}'s card from ${until}'s, which it is held until`);
      if ((await edge.locator('path').count()) < 1)
        throw new Refused("the hold edge is drawn: it has a path, counted, since a straight edge's path is hidden to Playwright");
      await expectVisible(cardOf(page, until), `${until}'s card is on the floor, for the edge to leave from`);
      await expectClearOfEachOther(page);
      await expectClearOfPanels(page, 'with a run held');
      await settled(page);
      const theme = await themeOf(page);
      await photograph(page, path.join(OUT, `hold-held-${theme}.png`), { fullPage: true });
      await photographCard(page, card, path.join(OUT, `hold-card-${theme}.png`));

      await page.goto(new URL(`/runs/${id}`, page.url()).href, { waitUntil: 'load' });
      await idle(page);
      const section = page.locator('section[aria-label="Held"]');
      await expectVisible(section.locator('p.font-mono', { hasText: new RegExp(`^${literal(word)}$`) }), `the run's page says ${word}`);
      await expectVisible(section.locator('[data-advice]', { hasText: new RegExp(`^${literal(advice)}$`) }), 'and how to lift it');
      await expectVisible(section.getByRole('link', { name: until, exact: true }), `and links ${until}`);
      const step = page.locator(`article > section#step-${gated}`);
      await expectVisible(step.locator('[data-state="held"]'), `${gated}'s chip is held on its page`);
      await expectCount(step.getByRole('button', { name: 'Approve', exact: true }), 0, `and ${gated}'s section offers no Approve`);
      await expectCount(page.locator('section[aria-label="Decide"]'), 0, 'and the page no Decide section');
      await expectCount(page.getByText('waiting on you', { exact: true }), 0, 'and nothing on it says it waits on you');
      await expectCount(page.locator('[data-gate-band]'), 0, 'and no step of it has a gate band');
      await settled(page);
      await photograph(page, path.join(OUT, `hold-run-${theme}.png`), { fullPage: true });
    } finally {
      fs.rmSync(hold, { force: true });
      fed(id, gated, 'awaiting approval');
    }

    await expectCount(page.locator('section[aria-label="Held"]'), 0, 'with the hold lifted, the run page says no hold');
    await expectVisible(
      page.locator(`article > section#step-${gated}`).getByRole('button', { name: 'Approve', exact: true }),
      `and offers ${gated}'s Approve again`,
    );
    await page.goto(new URL('/factories/default', page.url()).href, { waitUntil: 'load' });
    await idle(page);
    await expectVisible(card.locator('[data-answer="Approve"]'), `and on the Factory, ${id}'s card offers its gate again`);
    await expectCount(card.locator('[data-holding]'), 0, 'and says no hold');
    await expectCount(edge, 0, 'and no hold edge comes into it');
    await heldWithWords(page);
  },
} satisfies PageSpec;

/**
 * GATED held until HELD as `wf hold --why … --by operator` writes it: its card on the Factory, its row on Runs, its page and its gate's
 * note each say the hold's why and who put it beside `held until`, in the package's words, the card clamped to its two lines and whole
 * on hover; the note names HELD off the hold alone, where it stands unread. The hold is then taken back, and the run's page says no hold.
 */
async function heldWithWords(page: Page): Promise<void> {
  const { id, gated } = GATED;
  const hold = path.join(store!, 'runs', `${id}.hold`);
  const why = `merge conflicts in five files with ${HELD.id}'s branch: rebase on it once it lands, then go on`;
  const word = `held until ${unreadName(HELD.id)} lands (why: ${why}; by operator)`;
  const noted = `held until ${HELD.id} lands (why: ${why}; by operator); its approval is asked once the hold lifts`;
  const whole = new RegExp(`^${literal(word)}$`);
  try {
    if (fs.existsSync(hold)) throw new Refused(`no hold on ${id} before the page writes one with words — ${hold} is there`);
    fs.writeFileSync(hold, JSON.stringify({ at: new Date().toISOString(), until: [HELD.id], why, by: 'operator' }, null, 2), {
      flag: 'wx',
    });
    fed(id, 'held');
    const theme = await themeOf(page);

    await page.goto(new URL('/factories/default', page.url()).href, { waitUntil: 'load' });
    await idle(page);
    const card = cardOf(page, id);
    const said = card.locator('[data-holding="on-runs"]');
    await expectVisible(said.filter({ hasText: whole }), `the card says ${word}`);
    const title = await said.getAttribute('title');
    if (!title?.startsWith(`${word}\n`))
      throw new Refused(`the card's hold says its why whole on hover — it says ${JSON.stringify(title)}`);
    await settled(page);
    await photographCard(page, card, path.join(OUT, `hold-said-card-${theme}.png`));

    await page.goto(new URL('/runs', page.url()).href, { waitUntil: 'load' });
    await idle(page);
    await expectVisible(
      page.locator(`[data-runs-page] [data-run="${id}"] [data-run-steps][aria-label*=" held"]`),
      `on Runs, which says less, ${id} is drawn with its steps held on its rail`,
    );
    await expectCount(page.locator('[data-runs-page] [data-holding]'), 0, 'and the hold in its own words is on its page');
    await settled(page);
    await photograph(page, path.join(OUT, `hold-said-runs-${theme}.png`), { fullPage: true });

    await page.goto(new URL(`/runs/${id}`, page.url()).href, { waitUntil: 'load' });
    await idle(page);
    await expectVisible(page.locator('section[aria-label="Held"] p.font-mono', { hasText: whole }), `the run's page says ${word}`);
    await expectVisible(
      page.locator(`article > section#step-${gated} [data-note]`, {
        hasText: new RegExp(`^${literal(noted)}$`),
      }),
      `and ${gated}'s note, at the gate the hold keeps back, says it too`,
    );
    await settled(page);
    await photograph(page, path.join(OUT, `hold-said-run-${theme}.png`), { fullPage: true });
  } finally {
    fs.rmSync(hold, { force: true });
    fed(id, gated, 'awaiting approval');
  }
  await expectCount(page.locator('section[aria-label="Held"]'), 0, 'with the hold with words lifted, the run page says no hold');
}
