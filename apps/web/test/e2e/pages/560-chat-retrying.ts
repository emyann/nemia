import path from 'node:path';
import { herChat, herChatUnreadable, openChat, photograph, themeOf } from '../board.ts';
import { CHAT_STREAM, expectCount, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** What she said, which the panel draws and must go on drawing while her chat cannot be read. */
const SAID = [{ text: 'The night runs are through; two gates wait on you.' }] as const;

export default {
  /**
   * Her chat while the api cannot read it and reads it again on its beat. The page plants her talk, opens her panel, waits for the
   * stream to be answered, and then writes a line her chat's record cannot read: the api's next read refuses, and its stream says so
   * with `retrying` rather than giving up. Her panel draws the quiet band — a note at rest, never the red one that ends a page — keeps
   * what she said, and takes the band away by itself on the beat that reads again. Her chat and that line are the page's, taken back
   * after it.
   */
  name: 'chat-retrying',
  route: '/',
  expect: async (page) => {
    const back = herChat({ said: SAID, session: 'up', read: 'm:1:e0:0' });
    try {
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      const streamed = page.waitForResponse((r) => new URL(r.url()).pathname === CHAT_STREAM, { timeout: WAIT_MS });
      const panel = await openChat(page);
      await expectVisible(panel.getByText(SAID[0].text, { exact: false }), 'her words are drawn');
      await streamed;
      const broken = herChatUnreadable();
      try {
        const band = panel.locator('[data-band="retrying"]');
        await expectVisible(band, 'the panel says the api is reading her chat again, on its own beat');
        if ((await band.getAttribute('role')) !== 'status')
          throw new Refused('and says it as a state, not an alarm: nothing is lost, and the stream is still open');
        await expectCount(panel.locator('[data-band="unreadable"]'), 0, 'the band that ends her chat is not drawn');
        await expectCount(panel.locator('[data-chat-empty]'), 0, 'nor her greeting, which stands only where there is nothing to say');
        await expectVisible(panel.getByText(SAID[0].text, { exact: false }), 'and what she said stays on the page');
        await settled(page);
        await photograph(page, path.join(OUT, `chat-retrying-band-${await themeOf(page)}.png`), { fullPage: true });
      } finally {
        broken();
      }
      await expectCount(panel.locator('[data-band="retrying"]'), 0, 'the band goes by itself once the read works again');
    } finally {
      back();
    }
    await page.reload({ waitUntil: 'load' });
    await idle(page);
  },
} satisfies PageSpec;
