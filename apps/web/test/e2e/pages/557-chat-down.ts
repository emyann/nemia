import path from 'node:path';
import { chatFieldOf, chatPanelOf, dockOf, herChat, openChat, photograph, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** The composer's words while she is down, and the words it says when she is up and at rest. */
const WAITING = 'Write now; she reads it when she is up';

/** Her session down: why she stopped, where it is started, and that what the person writes waits for her in the outbox. */
async function expectDown(page: Parameters<PageSpec['expect']>[0], words: string): Promise<void> {
  const panel = await openChat(page);
  const band = panel.locator('[data-band="stopped"]');
  await expectVisible(band, 'the panel says her session stopped');
  if ((await band.getAttribute('role')) !== 'status') throw new Refused('and says it as a state, not an alarm: nothing failed');
  const said = (await band.textContent()) ?? '';
  if (!said.includes('Your factories still tick; gates still come to you. What you write waits for her.'))
    throw new Refused(`it says what still runs without her — it says ${JSON.stringify(said)}`);
  if (!said.includes(words)) throw new Refused(`and why she stopped (${words}) — it says ${JSON.stringify(said)}`);
  const start = panel.locator('[data-chat-start]');
  await expectTexts(start, ['Start her session'], 'and offers to start her session');
  if ((await start.getAttribute('href')) !== '/settings') throw new Refused('which leads to her settings, where her level is set');
  const placeholder = await chatFieldOf(page).getAttribute('placeholder');
  if (placeholder !== WAITING) throw new Refused(`the composer takes words for her all the same — it says ${placeholder}`);
}

export default {
  /**
   * Nemia down, twice over: her task filed with no session of hers on the daemon, and her level at Manual, which keeps her none and
   * ends the session she has. Either way a Down cue stands beside her face, her panel says why she stopped and where it is started,
   * and what the person writes is taken by the api and waits in her outbox. Her level and her task are the page's, taken back after.
   */
  name: 'chat-down',
  route: '/',
  expect: async (page) => {
    const back = herChat({ session: 'none' });
    try {
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      await expectVisible(dockOf(page).locator('[data-cue]', { hasText: 'Down' }), 'a Down cue stands beside her face');
      await expectDown(page, 'Filed: her session is starting.');
      await settled(page);
      await photograph(page, path.join(OUT, `chat-down-filed-${await themeOf(page)}.png`), { fullPage: true });

      const field = chatFieldOf(page);
      await field.fill('Start the kit cards when you are back.');
      const [sent] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/nemia/chat/send', {
          timeout: WAIT_MS,
        }),
        field.press('Enter'),
      ]);
      if (sent.status() !== 201)
        throw new Refused(`the api takes what was written while she is down — it answered ${sent.status()}: ${await sent.text()}`);
      await expectVisible(
        chatPanelOf(page).locator('[data-chat-bubble="person"]', { hasText: 'Start the kit cards when you are back.' }),
        'and it waits in her outbox, drawn as the person’s own words',
      );
      await expectCount(chatPanelOf(page).locator('[data-chat-kept]'), 0, 'nothing is kept in the browser: the api has it');
      await settled(page);
      await photograph(page, path.join(OUT, `chat-down-waiting-${await themeOf(page)}.png`), { fullPage: true });
      back();

      const manual = herChat({ level: 'manual', session: 'up' });
      try {
        await page.reload({ waitUntil: 'load' });
        await idle(page);
        await expectDown(page, 'Stopping: the keeper ends her session at its next beat.');
        await settled(page);
        await photograph(page, path.join(OUT, `chat-down-manual-${await themeOf(page)}.png`), { fullPage: true });
      } finally {
        manual();
      }
    } finally {
      back();
    }
  },
} satisfies PageSpec;
