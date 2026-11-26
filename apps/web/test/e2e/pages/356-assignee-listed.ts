import type { Page } from 'playwright';
import { runPath } from '../board.ts';
import { cardOf } from '../canvas.ts';
import { expectCount, expectVisible, idle, Refused } from '../checks.ts';
import { GATED } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { dropStoredMarker, storedMarker } from '../world.ts';

/** Who the page gives the run to, and why. */
const WHO = 'ann';
const WHY = 'reading the plan';

/** The three sections of the Runs page, by their names. */
const section = (page: Page, name: 'waiting' | 'in-flight') => page.locator(`section[data-section="${name}"]`);

/** What the count chip of a section says: the count the api answered. */
const countOf = async (page: Page, name: 'waiting' | 'in-flight') =>
  Number(await section(page, name).locator('[data-count-chip]').getAttribute('data-count-chip'));

/** The run's assignee endpoint, sent from the page as the board sends a write: `method`, with `body` where there is one. */
async function sent(page: Page, method: 'POST' | 'DELETE', body?: object) {
  const address = `${await runPath(page, GATED.id)}/assignee`;
  return page.evaluate(
    async ([url, verb, text]) => {
      const res = await fetch(url, { method: verb, headers: { 'content-type': 'application/json' }, ...(text ? { body: text } : {}) });
      return { status: res.status, text: await res.text() };
    },
    [address, method, body === undefined ? '' : JSON.stringify(body)] as const,
  );
}

export default {
  /**
   * A run in someone's hand is theirs to answer, and the board says so wherever it lists the run. GATED waits at its plan's gate: before,
   * its card is under Waiting on you, which is what the bell counts, and it has no row in flight. Given to ann (`POST …/assignee`, as
   * `nemia assign` does), it leaves Waiting on you — the count chip is one fewer, and no card of it is left there — and is a row in In
   * flight, with the grey line that says who has it and why, beside its ask, which stays asked; on the Factory's floor its card is not
   * yellow's and says who has it. Given back (`DELETE`), it is under Waiting on you again, with no line, and the counts are as they were.
   * The assignee the page leaves is taken back, as `nemia assign --off` takes it.
   */
  name: 'assignee-listed',
  route: '/runs',
  expect: async (page) => {
    const { id } = GATED;
    const marker = () => storedMarker(id, 'assignee');
    const waiting = section(page, 'waiting');
    const flight = section(page, 'in-flight');
    if (marker() !== null) throw new Refused(`no assignee on ${id} before the page gives it — its record is there`);
    try {
      await expectVisible(waiting.locator(`article[data-run="${id}"]`), `${id} waits on you at its gate: a card under Waiting on you`);
      await expectCount(flight.locator(`tr[data-run="${id}"]`), 0, 'and no row in flight');
      const [before, inFlight] = [await countOf(page, 'waiting'), await countOf(page, 'in-flight')];

      const put = await sent(page, 'POST', { to: WHO, why: WHY });
      if (put.status !== 200) throw new Refused(`the api gives the run to ${WHO} — it answered ${put.status}: ${put.text}`);
      if (marker() === null) throw new Refused('the api wrote the assignee record — it is not there');
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      await expectCount(waiting.locator(`article[data-run="${id}"]`), 0, `in someone's hand, ${id} is not under Waiting on you`);
      const row = flight.locator(`tr[data-run="${id}"]`);
      await expectVisible(row, `${id} is a row of the runs in flight`);
      await expectVisible(row.locator('[data-assignee]'), 'with the line that says who has it');
      const who = (await row.locator('[data-assignee-who]').textContent()) ?? '';
      if (!who.includes(WHO)) throw new Refused(`the line names who has it — it says ${JSON.stringify(who)}`);
      const why = (await row.locator('[data-assignee-why]').textContent()) ?? '';
      if (!why.includes(WHY)) throw new Refused(`and why — it says ${JSON.stringify(why)}`);
      const counts = [await countOf(page, 'waiting'), await countOf(page, 'in-flight')];
      if (JSON.stringify(counts) !== JSON.stringify([before - 1, inFlight + 1]))
        throw new Refused(
          `the counts follow: one fewer waiting on you, one more in flight — they say ${counts}, from ${before} and ${inFlight}`,
        );

      await page.goto(new URL('/factories/default', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      const card = cardOf(page, id);
      await expectVisible(card.locator('[data-assignee-chip]'), "on the floor, the run's card says who has it");
      await expectCount(card.locator('text="waiting on you"'), 0, 'and does not say it waits on you');

      const back = await sent(page, 'DELETE');
      if (back.status !== 200) throw new Refused(`the api takes the run back — it answered ${back.status}: ${back.text}`);
      if (marker() !== null) throw new Refused('giving it back removed the assignee record — it is still there');
      await page.goto(new URL('/runs', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      await expectVisible(waiting.locator(`article[data-run="${id}"]`), `given back, ${id} is under Waiting on you again`);
      await expectCount(flight.locator(`tr[data-run="${id}"]`), 0, 'and no longer a row in flight');
      const again = [await countOf(page, 'waiting'), await countOf(page, 'in-flight')];
      if (JSON.stringify(again) !== JSON.stringify([before, inFlight]))
        throw new Refused(`the counts are as they were — they say ${again}, from ${before} and ${inFlight}`);
    } finally {
      dropStoredMarker(id, 'assignee');
      dropStoredMarker(id, 'unassigned');
    }
  },
} satisfies PageSpec;
