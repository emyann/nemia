import path from 'node:path';
import { chatFieldOf, herChat, herStopped, herTurnOver, openChat, photograph, themeOf, type HerLine } from '../board.ts';
import { expectCount, expectNone, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** Where the turn she is answering is ended, which this page answers itself, as the api answers it of a session it could reach. */
const STOP = '/api/nemia/chat/stop';

/** Her session's transcript: her words, and a call still at work, which is the turn there is to end. */
const SAID: readonly HerLine[] = [
  { text: 'I am reading the six runs that wait on you, oldest first.' },
  { tool: 'Read', says: 'docs/architecture.md', result: 'read 420 lines' },
  { tool: 'Task', says: 'gather what each of the six waits for' },
];

/** What the person writes while she answers, which her outbox takes all the same. */
const WROTE = 'Leave the kit cards to me.';

/** What the composer's field invites, by where she is: the stop offered while she answers, and nothing of it once her turn is over. */
const ANSWERING_WORDS = 'She is answering. Write the next one, or stop her';
const OPEN_WORDS = 'Tell Nemia what to do, or ask';

/** The composer's field says `words`. */
async function expectInvites(page: Parameters<PageSpec['expect']>[0], words: string): Promise<void> {
  await expectNone(
    async () => {
      const said = await chatFieldOf(page).getAttribute('placeholder');
      return said === words ? null : `it says ${JSON.stringify(said)}`;
    },
    `the composer invites ${JSON.stringify(words)}`,
  );
  if (await chatFieldOf(page).isDisabled()) throw new Refused('and it takes what is written: the field stays live');
}

export default {
  /**
   * Stopping the turn Nemia is answering, from her chat's composer: while she answers the one button is the stop, the field stays live
   * so Enter still sends her the next words, and pressing the stop asks the api once. Her turn over, the button is the send again and a
   * quiet `Stopped` marker stands on the record.
   *
   * The stop route is this page's own: ending a turn needs a session attached to the Agent SDK with a holder of its own, which no
   * seeded store has, so the page answers the route as the api answers it — the stop written on her chat's own file and her session
   * listed waiting for its next words — and everything the board does with it, the projection and the stream included, is the real one.
   * Her task, her level, the stop and the message the api took are taken back after.
   */
  name: 'chat-stop',
  route: '/',
  expect: async (page) => {
    const back = herChat({ session: 'answering', said: SAID });
    const isStop = (url: URL) => url.pathname === STOP;
    let asked = 0;
    try {
      await page.route(isStop, async (route) => {
        asked += 1;
        const at = new Date().toISOString();
        herStopped(at);
        herTurnOver();
        await route.fulfill({ json: { at, attempt: 1 } });
      });
      await page.reload({ waitUntil: 'load' });
      await idle(page);

      const panel = await openChat(page);
      await expectVisible(panel.locator('[data-chat-where]', { hasText: 'Answering' }), 'the header says she is answering');
      await expectInvites(page, ANSWERING_WORDS);
      const stop = panel.getByRole('button', { name: 'Stop her answer' });
      await expectVisible(stop, 'and the composer’s one button is the stop, which ends her turn and leaves her session up');
      await expectCount(panel.getByRole('button', { name: 'Send' }), 0, 'there being nothing to send and a turn to end');
      await settled(page);
      await photograph(page, path.join(OUT, `chat-stop-answering-${await themeOf(page)}.png`), { fullPage: true });

      await chatFieldOf(page).fill(WROTE);
      await chatFieldOf(page).press('Enter');
      await expectVisible(
        panel.locator('[data-chat-bubble="person"]', { hasText: WROTE }),
        'Enter still sends while she answers: the words go to her outbox and stand as the person’s own',
      );
      await expectVisible(stop, 'and the button is the stop still, a message sent being no answer of hers');

      await Promise.all([page.waitForResponse((answer) => isStop(new URL(answer.url())), { timeout: WAIT_MS }), stop.click()]);
      if (asked !== 1) throw new Refused(`pressing the stop asks the api once — it asked ${asked} times`);
      await expectVisible(panel.getByRole('button', { name: 'Send' }), 'her turn over, the composer’s button is the send again');
      await expectCount(panel.getByRole('button', { name: 'Stop her answer' }), 0, 'and there is no turn left to end');
      await expectInvites(page, OPEN_WORDS);
      await expectTexts(panel.locator('[data-chat-marker]'), ['Stopped'], 'a quiet marker stands on the record where the turn was ended');
      await settled(page);
      await photograph(page, path.join(OUT, `chat-stop-stopped-${await themeOf(page)}.png`), { fullPage: true });
    } finally {
      await page.unroute(isStop);
      back();
    }
  },
} satisfies PageSpec;
