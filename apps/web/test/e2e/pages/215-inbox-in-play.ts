import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { fed, photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { FACTORIES, GATED, hiringStarts, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store, takeBackRuns } from '../world.ts';

/** The card this page files in the factory, starts from the Inbox, and sees ended once its run is called off. */
const CARD = 'show-the-cards-in-play-e2e0';
/** Its first line, and the brief its start is prefilled with. */
const BODY = 'Show the cards in play\n\nA card started from the Inbox, whose run is then called off.';
/** The label it carries, whose page lists it while it is in play. */
const LABEL = { key: 'team', value: 'in-play-e2e' } as const;
/** A second card, started as a copy of GATED's run, which waits on a person at its gate. */
const WAITING = 'wait-on-the-plan-e2e0';
/** That copy's id. */
const WAITING_RUN = 'wait-on-the-plan-run-e2e0';

/** A card on the Inbox page, by its name. */
const cardIn = (page: Page, name: string): Locator => page.locator(`section[aria-label="Cards"] li[data-card="${name}"]`);

/** The segment of the Inbox page's In play / Ended switch, by its label's first word. */
const segment = (page: Page, which: 'In play' | 'Ended'): Locator =>
  page.locator('section[aria-label="Cards"] [data-slot="segmented-button"]').getByRole('radio', { name: new RegExp(`^${which}`) });

/** The count a segment says (`In play · 4`), read off its `data-cards-count`. */
async function countOf(page: Page, which: 'in play' | 'ended'): Promise<number> {
  const text = (await page.locator(`[data-cards-count="${which}"]`).textContent()) ?? '';
  const n = /·\s*(\d+)/.exec(text)?.[1];
  if (n === undefined) throw new Refused(`the ${which} segment says how many cards it holds, as "· N" — it says ${JSON.stringify(text)}`);
  return Number(n);
}

/** Refuses unless both segments say `inPlay` and `ended`. */
async function expectCounts(page: Page, inPlay: number, ended: number, why: string): Promise<void> {
  const got = [await countOf(page, 'in play'), await countOf(page, 'ended')];
  if (got[0] !== inPlay || got[1] !== ended)
    throw new Refused(`${why}: In play · ${inPlay} and Ended · ${ended} — they say In play · ${got[0]} and Ended · ${got[1]}`);
}

async function load(page: Page, route: string): Promise<void> {
  await page.goto(new URL(route, page.url()).href, { waitUntil: 'load' });
  await idle(page);
}

export default {
  /**
   * The Inbox lists the cards still in play by default, and those whose run ended under Ended (`?cards=ended`), each segment counted. A
   * card filed in the factory and started from the board reads under In play, its run's phase on a chip (`at work`, or `waiting its turn`
   * with no daemon to take it); once its run is called off — its `.cancelled` marker written beside the record, as `wf cancel` writes it,
   * the board having no Call off of its own — In play no longer lists it, Ended does, as `called off`, and each count has moved by one.
   * Before, the card's own page and its label's page show the same chip; after, a second card, started as a copy of GATED's run, which
   * waits at its gate, reads `waits on you`. The runs, the claim, the cards and the factory's hires are taken back.
   */
  name: 'inbox-in-play',
  route: '/inbox',
  expect: async (page) => {
    const inbox = path.join(store!, 'inbox');
    const runsDir = path.join(store!, 'runs');
    const cardFile = path.join(inbox, `${CARD}.md`);
    const runsBefore = fs.readdirSync(runsDir).sort();
    const theme = await themeOf(page);
    const other = await page.context().newPage();
    const unhire = hiringStarts(store!);
    try {
      fs.writeFileSync(
        cardFile,
        `---\nworkflow: ${WORKFLOWS.good.name}\nfactory: ${FACTORIES.hiring.name}\nlabels:\n  ${LABEL.key}: ${LABEL.value}\n---\n${BODY}\n`,
      );
      const { problems } = watch(other);
      await other.goto(page.url(), { waitUntil: 'load' });
      await idle(other);
      await expectVisible(segment(other, 'In play'), 'the Inbox offers In play and Ended, above the cards');
      if ((await segment(other, 'In play').getAttribute('aria-checked')) !== 'true')
        throw new Refused('with no ?cards= in the address, In play is the segment picked');
      const item = cardIn(other, CARD);
      await expectVisible(item, `${CARD}, filed and not started, is in play`);
      await expectCount(item.locator('[data-card-state]'), 0, 'and carries no chip: a card not started says its state by its buttons');
      const inPlay = await countOf(other, 'in play');
      const ended = await countOf(other, 'ended');

      await item.getByRole('button', { name: 'Start' }).click();
      const form = item.locator(`form[aria-label="Start ${CARD}"]`);
      await expectVisible(form, `Start opens ${CARD}'s start form, in its factory`);
      const [started] = await Promise.all([
        other.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/runs', { timeout: WAIT_MS }),
        form.getByRole('button', { name: 'Start' }).click(),
      ]);
      if (started.status() !== 201) throw new Refused(`the api starts the card — it answered ${started.status()}: ${await started.text()}`);
      const { id } = (await started.json()) as { id: string };
      await other.waitForURL(`**/runs/${id}`, { timeout: WAIT_MS });

      await load(other, '/inbox');
      const live = cardIn(other, CARD);
      await expectVisible(live.locator(`[data-started-as] a[href="/runs/${id}"]`), `started, ${CARD} is still in play, linked to ${id}`);
      const chip = live.locator('[data-started-as] [data-card-state]');
      await expectVisible(chip, "and carries its run's phase on a chip");
      const phase = await chip.getAttribute('data-card-state');
      const word = (await chip.textContent())?.trim();
      if (!((phase === 'running' && word === 'at work') || (phase === 'pending' && word === 'waiting its turn')))
        throw new Refused(
          `the chip says the run in flight as a person would, "at work" or "waiting its turn" — it says ${JSON.stringify(word)} for ${phase}`,
        );
      await expectCounts(other, inPlay, ended, 'started, the card stays in play: neither count moves');
      await settled(other);
      await photograph(other, path.join(OUT, `inbox-in-play-started-${theme}.png`), { fullPage: true });

      await load(other, `/inbox/${CARD}`);
      await expectVisible(
        other.locator(`[data-started-as]:has(a[href="/runs/${id}"]) [data-card-state="${phase}"]`),
        `the card's own page says it started as ${id}, with the same chip`,
      );
      await settled(other);
      await photograph(other, path.join(OUT, `inbox-in-play-card-${theme}.png`), { fullPage: true });

      await load(other, `/labels/${LABEL.key}/${LABEL.value}`);
      await expectVisible(
        other.locator(`[data-section="in play"] [data-card="${CARD}"] [data-card-state="${phase}"]`),
        `its label's page lists it in play, with the same chip`,
      );
      await settled(other);
      await photograph(other, path.join(OUT, `inbox-in-play-label-${theme}.png`), { fullPage: true });

      fs.writeFileSync(path.join(runsDir, `${id}.cancelled`), new Date().toISOString());
      fed(id, 'cancelled');
      await load(other, '/inbox');
      await expectCount(cardIn(other, CARD), 0, `its run called off, ${CARD} leaves In play`);
      await expectCounts(other, inPlay - 1, ended + 1, 'and each count moves by one');

      await segment(other, 'Ended').click();
      await other.waitForURL((url) => url.searchParams.get('cards') === 'ended', { timeout: WAIT_MS });
      await idle(other);
      const over = cardIn(other, CARD);
      await expectVisible(over.locator(`[data-started-as] a[href="/runs/${id}"]`), `under Ended, ${CARD} is listed, linked to ${id}`);
      await expectVisible(
        over.locator('[data-card-state="cancelled"]', { hasText: /^called off$/ }),
        'its chip says the run was called off, never cancelled',
      );
      await expectCount(over.getByRole('button', { name: 'Start' }), 0, 'and it offers no Start');
      await expectCounts(other, inPlay - 1, ended + 1, 'the counts say the same under Ended');
      await settled(other);
      await photograph(other, path.join(OUT, `inbox-in-play-ended-${theme}.png`), { fullPage: true });

      await load(other, '/inbox?cards=ended');
      await expectVisible(cardIn(other, CARD), 'Ended is kept in the address: a load of ?cards=ended lists it again');

      const gated = JSON.parse(fs.readFileSync(path.join(runsDir, `${GATED.id}.json`), 'utf8')) as Record<string, unknown>;
      fs.writeFileSync(path.join(inbox, `${WAITING}.md`), 'Wait on the plan\n\nA card whose run waits at its gate.\n');
      fs.writeFileSync(path.join(runsDir, `${WAITING_RUN}.json`), JSON.stringify({ ...gated, id: WAITING_RUN, from: { inbox: WAITING } }));
      await load(other, '/inbox');
      await expectVisible(
        cardIn(other, WAITING).locator('[data-card-state="waiting"]', { hasText: /^waits on you$/ }),
        'a card whose run waits on a person is in play, its chip saying it waits on you',
      );
      await settled(other);
      await photograph(other, path.join(OUT, `inbox-in-play-waiting-${theme}.png`), { fullPage: true });
      await idle(other);
      const seen = problems();
      if (seen.length)
        throw new Refused(
          `no console error and no failed request while a card is started and its run called off — ${seen.length} seen:\n    ${seen.join('\n    ')}`,
        );
    } finally {
      await other.close();
      takeBackRuns(runsDir, runsBefore);
      fs.rmSync(cardFile, { force: true });
      fs.rmSync(path.join(inbox, `${WAITING}.md`), { force: true });
      unhire();
    }
  },
} satisfies PageSpec;
