import path from 'node:path';
import type { Page } from 'playwright';
import { chatFieldOf, chatPanelOf, expectCues, expectPanelHeld, herChat, openChat, photograph, themeOf } from '../board.ts';
import { expectCount, expectNone, expectTexts, expectVisible, idle, Refused, settled, watch } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** Where the person's words are sent, which this page refuses for as long as the daemon is to read as unreachable. */
const SEND = '/api/nemia/chat/send';

/** Where her chat is read, which this page refuses first of all, to see what the board says of a chat it cannot read. */
const READ = '/api/nemia/chat';

/** The line Chromium writes to the console for a resource it could not reach at all, which names no address. */
const REFUSED_LINE = 'console error: Failed to load resource: net::ERR_CONNECTION_REFUSED';

/** The line Chromium writes to the console for an answer of the api's that refused, which names no address. */
const REFUSAL_LINE = 'console error: Failed to load resource: the server responded with a status of 422 (Unprocessable Entity)';

/** What the api answers a message it refuses, in its own words. */
const REFUSED_WHY = 'The message came with no token: paste one on the token page, then send it again.';

/** What the person writes that the api refuses. */
const REFUSED_WROTE = 'Land the kit cards once they are green.';

/** Past the first of the board's beats of trying a lost message again (`CHAT_RETRY_MS`, 3 s): a refused one is not tried on it. */
const PAST_ONE_BEAT_MS = 3_500;

/** What the person writes, and what they change it to before the api is back. */
const WROTE = 'Start the two kit cards as one batch.';
const CHANGED = 'Start the two kit cards as one batch, and tell me when their checks are green.';

/** The message the browser kept, with the three things the person may do with it. */
async function expectKept(panel: ReturnType<typeof chatPanelOf>, words: string): Promise<void> {
  const kept = panel.locator('[data-chat-kept]');
  await expectVisible(kept, 'the api would not take the message, so this browser keeps it');
  await expectTexts(kept.locator('[data-chat-bubble="kept"]'), [words], 'drawn as the person’s own words, failing');
  await expectTexts(kept.locator('[data-chat-tag="kept"]'), ['Not sent'], 'tagged as not sent');
  await expectTexts(kept.getByRole('button'), ['Send again', 'Edit', 'Discard'], 'send it again, change it, or throw it away');
  const band = panel.locator('[data-band="lost"]');
  await expectVisible(band, 'and a line says the daemon does not answer');
  if ((await band.getAttribute('role')) !== 'alert') throw new Refused('said as an alarm: the board has lost the daemon');
  const said = (await band.textContent()) ?? '';
  if (!said.includes('The board tries again every few seconds; nothing you wrote is lost.'))
    throw new Refused(`and that the board keeps trying — it says ${JSON.stringify(said)}`);
}

/** The composer, and a message Enter sends: answers the panel it was written in. */
async function wrote(page: Page, words: string, open = false): Promise<ReturnType<typeof chatPanelOf>> {
  const panel = open ? chatPanelOf(page) : await openChat(page);
  const field = chatFieldOf(page);
  await field.fill(words);
  await field.press('Enter');
  return panel;
}

export default {
  /**
   * A message the api would not take: kept in this browser, drawn as not sent with the daemon said unreachable, changed, kept through a
   * reload, and taken exactly once when the api answers again — the board trying it on its own, with no press of the person's. Then a
   * message the api answers and refuses: kept with the api's own words, no band, and never sent again but on the person's press.
   *
   * The refusal is this page's own: the send is aborted, as a daemon that is gone aborts it, so it runs on a page of its own whose watch
   * expects exactly those failures. Her task and her level are the page's, taken back after; the message the api finally takes goes with
   * them.
   */
  name: 'chat-kept',
  route: '/',
  expect: async (page) => {
    const back = herChat({ session: 'up' });
    const down = await page.context().newPage();
    try {
      const { problems } = watch(down);
      const isSend = (url: URL) => url.pathname === SEND;
      let took = 0;
      down.on('response', (answer) => {
        if (isSend(new URL(answer.url())) && answer.status() === 201) took += 1;
      });
      const isRead = (url: URL) => url.pathname === READ;
      await down.route(isRead, (route) => route.abort('connectionrefused'));
      await down.route(isSend, (route) => route.abort('connectionrefused'));
      await down.goto(page.url(), { waitUntil: 'load' });

      const unread = await openChat(down);
      const band = unread.locator('[data-band="unreadable"]');
      await expectVisible(band, 'the api refusing the read, the panel says the board cannot read her chat');
      if ((await band.getAttribute('role')) !== 'alert') throw new Refused('said as an alarm: the board has what it cannot read');
      await expectCount(
        unread.locator('[data-chat-empty]'),
        0,
        'and no greeting with a level and counts beside it: the board would be saying what it does not know',
      );
      await settled(down);
      await photograph(down, path.join(OUT, `chat-kept-unread-${await themeOf(down)}.png`), { fullPage: true });
      await down.unroute(isRead);
      await expectVisible(unread.locator('[data-chat-empty]'), 'the api answering again, her chat reads, and the greeting is drawn');
      await idle(down);

      const panel = await wrote(down, WROTE, true);
      await expectKept(panel, WROTE);
      await expectCount(panel.locator('[data-chat-bubble="person"]'), 0, 'and no bubble of theirs stands for a message nobody has');
      await expectCues(down, (words) => words.includes('Not sent'), 'a cue at her face says one was not sent');
      await expectPanelHeld(down);
      for (const chip of await panel.locator('[data-chat-chip]').all())
        if (!(await chip.isDisabled()))
          throw new Refused('a chip is off while a message is kept: pressing one would take the place of the words nobody has yet');
      await settled(down);
      await photograph(down, path.join(OUT, `chat-kept-notsent-${await themeOf(down)}.png`), { fullPage: true });

      await panel.locator('[data-chat-kept]').getByRole('button', { name: 'Send again' }).click();
      await expectKept(panel, WROTE);

      await panel.locator('[data-chat-kept]').getByRole('button', { name: 'Edit' }).click();
      const field = panel.locator('[data-chat-kept] textarea');
      await expectVisible(field, 'Edit gives the words back to be changed');
      await field.fill(CHANGED);
      await settled(down);
      await photograph(down, path.join(OUT, `chat-kept-editing-${await themeOf(down)}.png`), { fullPage: true });
      await expectPanelHeld(down);
      await panel.locator('[data-chat-kept]').getByRole('button', { name: 'Keep the change' }).click();
      await expectKept(panel, CHANGED);

      await down.reload({ waitUntil: 'load' });
      await idle(down);
      await expectKept(await openChat(down), CHANGED);

      await down.unroute(isSend);
      await expectNone(
        async () => ((await chatPanelOf(down).locator('[data-chat-kept]').count()) === 0 ? null : 'the message is still kept'),
        'the api answering again, the board sends what it kept on its own',
        20_000,
      );
      await expectVisible(
        chatPanelOf(down).locator('[data-chat-bubble="person"]', { hasText: CHANGED }),
        'and it stands as the person’s own words, the api holding it',
      );
      await expectCount(chatPanelOf(down).locator('[data-band="lost"]'), 0, 'the daemon answering, nothing is lost any more');
      if (took !== 1) throw new Refused(`the api takes it once and no more — it took it ${took} times`);
      await settled(down);
      await photograph(down, path.join(OUT, `chat-kept-taken-${await themeOf(down)}.png`), { fullPage: true });

      let refusals = 0;
      await down.route(isSend, (route) => {
        refusals += 1;
        return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: REFUSED_WHY }) });
      });
      const refused = await wrote(down, REFUSED_WROTE, true);
      const kept = refused.locator('[data-chat-kept]');
      await expectTexts(kept.locator('[data-chat-bubble="kept"]'), [REFUSED_WROTE], 'the api refusing the message, it is kept');
      await expectTexts(kept.locator('[data-chat-kept-why="refused"]'), [REFUSED_WHY], 'and its line is the api’s own words');
      await expectCount(kept.locator('[data-chat-kept-why="lost"]'), 0, 'never that the board lost the daemon');
      await expectTexts(kept.getByRole('button'), ['Send again', 'Edit', 'Discard'], 'the person may still act on what it says');
      await expectCount(refused.locator('[data-band="lost"]'), 0, 'a refusal raises no band of its own');
      if ((await chatFieldOf(down).getAttribute('placeholder')) === 'Waiting for the daemon')
        throw new Refused('the composer waits on no daemon: the api answered, and refused');
      await down.waitForTimeout(PAST_ONE_BEAT_MS);
      if (refusals !== 1) throw new Refused(`a refused message is never sent again on its own — it was sent ${refusals} times`);
      await settled(down);
      await photograph(down, path.join(OUT, `chat-kept-refused-${await themeOf(down)}.png`), { fullPage: true });
      await kept.getByRole('button', { name: 'Send again' }).click();
      await expectNone(
        async () => (refusals === 2 ? null : `it was sent ${refusals} times`),
        'Send again sends it, once, on the person’s press',
      );
      await expectTexts(kept.locator('[data-chat-kept-why="refused"]'), [REFUSED_WHY], 'refused again, it says so again');
      await kept.getByRole('button', { name: 'Discard' }).click();
      await expectCount(refused.locator('[data-chat-kept]'), 0, 'Discard throws it away');
      await down.unroute(isSend);

      const unexpected = problems().filter(
        (problem) =>
          !problem.includes(SEND) &&
          !problem.includes(`${READ} `) &&
          !problem.endsWith(READ) &&
          problem !== REFUSED_LINE &&
          problem !== REFUSAL_LINE,
      );
      if (unexpected.length > 0)
        throw new Refused(`the only failures are the sends this page refused — it also saw:\n${unexpected.join('\n')}`);
      if (problems().length === 0) throw new Refused('the sends this page refused are seen by its watch — or it proves nothing');
    } finally {
      await down.close();
      back();
    }
  },
} satisfies PageSpec;
