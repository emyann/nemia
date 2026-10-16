import path from 'node:path';
import type { Page } from 'playwright';
import { chatFieldOf, chatPanelOf, dockOf, herChat, openChat, photograph, themeOf } from '../board.ts';
import { expectCount, expectNone, expectTexts, expectVisible, idle, Refused, settled, watch } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** Where the person's words are sent, which this page refuses for as long as the daemon is to read as unreachable. */
const SEND = '/api/nemia/chat/send';

/** The line Chromium writes to the console for a resource it could not reach at all, which names no address. */
const REFUSED_LINE = 'console error: Failed to load resource: net::ERR_CONNECTION_REFUSED';

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
  const band = panel.locator('[data-chat-band="lost"]');
  await expectVisible(band, 'and a line says the daemon does not answer');
  if ((await band.getAttribute('role')) !== 'alert') throw new Refused('said as an alarm: the board has lost the daemon');
  const said = (await band.textContent()) ?? '';
  if (!said.includes('The board tries again every few seconds; nothing you wrote is lost.'))
    throw new Refused(`and that the board keeps trying — it says ${JSON.stringify(said)}`);
}

/** The panel's top edge is on the screen, so the header's Close, Grow and Open as a page can be reached. */
async function expectHeld(panel: ReturnType<typeof chatPanelOf>): Promise<void> {
  const box = await panel.boundingBox();
  if (box === null || box.y < 0) throw new Refused(`the panel stands inside the window — its top is at ${box?.y ?? 'nowhere'}`);
}

/** The composer, and a message Enter sends: answers the panel it was written in. */
async function wrote(page: Page, words: string): Promise<ReturnType<typeof chatPanelOf>> {
  const panel = await openChat(page);
  const field = chatFieldOf(page);
  await field.fill(words);
  await field.press('Enter');
  return panel;
}

export default {
  /**
   * A message the api would not take: kept in this browser, drawn as not sent with the daemon said unreachable, changed, kept through a
   * reload, and taken exactly once when the api answers again — the board trying it on its own, with no press of the person's.
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
      await down.route(isSend, (route) => route.abort('connectionrefused'));
      await down.goto(page.url(), { waitUntil: 'load' });
      await idle(down);

      const panel = await wrote(down, WROTE);
      await expectKept(panel, WROTE);
      await expectCount(panel.locator('[data-chat-bubble="person"]'), 0, 'and no bubble of theirs stands for a message nobody has');
      await expectVisible(dockOf(down).locator('[data-cue]', { hasText: 'Not sent' }), 'a cue beside her face says one was not sent');
      await expectHeld(panel);
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
      await expectCount(chatPanelOf(down).locator('[data-chat-band="lost"]'), 0, 'the daemon answering, nothing is lost any more');
      if (took !== 1) throw new Refused(`the api takes it once and no more — it took it ${took} times`);
      await settled(down);
      await photograph(down, path.join(OUT, `chat-kept-taken-${await themeOf(down)}.png`), { fullPage: true });

      const unexpected = problems().filter((problem) => !problem.includes(SEND) && problem !== REFUSED_LINE);
      if (unexpected.length > 0)
        throw new Refused(`the only failures are the sends this page refused — it also saw:\n${unexpected.join('\n')}`);
      if (problems().length === 0) throw new Refused('the sends this page refused are seen by its watch — or it proves nothing');
    } finally {
      await down.close();
      back();
    }
  },
} satisfies PageSpec;
