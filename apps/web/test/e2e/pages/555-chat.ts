import path from 'node:path';
import { chatFieldOf, chatPanelOf, dockFaceOf, dockOf, herChat, openChat, photograph, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';
import { cuesOf, dockWords, faceOf, type Presence } from '../../../src/lib/presence.ts';

/** The four things the canvas offers a person to start with. */
const STARTERS = ['What is waiting on me?', 'What is at work?', 'What did today cost?', 'Start a run'];

/**
 * Her face docked and closed: her expression and every cue beside it are the ones her presence picks (`faceOf`, `cuesOf`) from what the
 * api answers of her, her face says what pressing it does (`dockWords`), and no panel is drawn until it is pressed. Read against the
 * api rather than against a presence written here: the seed's own waiting runs are hers to show, and their count moves with the seed.
 */
async function expectClosed(page: Parameters<PageSpec['expect']>[0]): Promise<void> {
  const dock = dockOf(page);
  await expectVisible(dock, 'her face is docked at the bottom right of the page');
  if ((await dock.getAttribute('data-nemia-dock')) !== 'closed') throw new Refused('the panel is closed until her face is pressed');
  const read = (await page.request.get(new URL('/api/nemia/chat', page.url()).href).then((r) => r.json())) as {
    presence: { up: boolean; answering: boolean; waitsOnYou: number; unread: number };
  };
  const api = read.presence;
  if (!api.up) throw new Refused(`her session reads up on the api — it answered ${JSON.stringify(api)}`);
  const presence: Presence = { waitsOnYou: api.waitsOnYou, notSent: false, down: false, answering: api.answering, unread: api.unread };
  const wearing = await dock.locator('[data-nemia-face]').getAttribute('data-nemia-face');
  if (wearing !== faceOf(presence))
    throw new Refused(`her face wears the expression her presence picks, ${faceOf(presence)} — it wears ${wearing}`);
  await expectTexts(
    dock.locator('[data-cue]'),
    cuesOf(presence).map((cue) => cue.words),
    'every cue that holds stands beside her face, in the owner’s order',
  );
  const label = await dockFaceOf(page).getAttribute('aria-label');
  if (label !== dockWords(presence, false)) throw new Refused(`her face says what pressing it does — it says ${label}`);
  await expectCount(chatPanelOf(page), 0, 'no panel is drawn until it is opened');
}

/** Her greeting, her level and what is at work, and the four chips. */
async function expectEmpty(panel: ReturnType<typeof chatPanelOf>): Promise<void> {
  const empty = panel.locator('[data-chat-empty]');
  await expectVisible(empty.getByText('I keep your factories running.'), 'her greeting');
  await expectVisible(empty.getByText('ask before what is yours to decide', { exact: false }), 'what she is for');
  await expectVisible(empty.locator('[data-chat-tag]', { hasText: 'Semi-auto' }), 'her level');
  const tags = await empty.locator('[data-chat-tag]').allTextContents();
  if (!tags.some((tag) => /^\d+ (?:factory|factories)$/.test(tag)))
    throw new Refused(`the tags say how many factories — ${tags.join(', ')}`);
  if (!tags.some((tag) => /^\d+ runs? at work$/.test(tag))) throw new Refused(`and how many runs are at work — ${tags.join(', ')}`);
  await expectVisible(empty.getByText('Start with', { exact: true }), 'the things to start with');
  for (const words of STARTERS) await expectVisible(empty.locator('[data-chat-chip]', { hasText: words }), `the chip ${words}`);
}

export default {
  /**
   * Her face docked and closed on a page of the board (state 1), the panel it opens with nothing said yet (state 2) — her greeting, her
   * level, what is at work and the four chips — a draft written in it (state 3), where Shift+Enter makes a new line and Enter sends, the
   * words then drawn as the person's own bubble, the panel grown to the whole space, and the same panel opened as a page of its own at
   * `/chat`, where her face is not docked. Her level, her task and her chat are written by the page and taken back after.
   */
  name: 'chat',
  route: '/',
  expect: async (page) => {
    const back = herChat({ session: 'up', said: [] });
    try {
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      await expectClosed(page);
      await settled(page);
      await photograph(page, path.join(OUT, `chat-closed-${await themeOf(page)}.png`), { fullPage: true });

      const panel = await openChat(page);
      await expectVisible(panel.getByRole('heading', { name: 'Nemia' }), 'her name in the header');
      await expectVisible(panel.locator('[data-chat-where]', { hasText: 'Up: her session runs' }), 'where she is');
      await expectEmpty(panel);
      await settled(page);
      await photograph(page, path.join(OUT, `chat-empty-${await themeOf(page)}.png`), { fullPage: true });

      const field = chatFieldOf(page);
      await field.fill('Start the two kit cards as one batch');
      await field.press('Shift+Enter');
      await field.type('and tell me when its check is green');
      const draft = await field.inputValue();
      if (!draft.includes('\n')) throw new Refused(`Shift+Enter makes a new line — the field holds ${JSON.stringify(draft)}`);
      await settled(page);
      await photograph(page, path.join(OUT, `chat-writing-${await themeOf(page)}.png`), { fullPage: true });

      const [sent] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/nemia/chat/send', {
          timeout: WAIT_MS,
        }),
        field.press('Enter'),
      ]);
      if (sent.status() !== 201)
        throw new Refused(`Enter sends what was written — the api answered ${sent.status()}: ${await sent.text()}`);
      await expectVisible(
        panel.locator('[data-chat-bubble="person"]', { hasText: draft.split('\n')[0] }),
        "the words are the person's bubble",
      );
      if ((await field.inputValue()) !== '') throw new Refused('the field is emptied once the words are sent');

      await panel.getByRole('button', { name: 'Grow to the whole space' }).click();
      await expectVisible(chatPanelOf(page).and(page.locator('[data-chat-panel="grown"]')), 'the panel grows to the whole space');
      await settled(page);
      await photograph(page, path.join(OUT, `chat-grown-${await themeOf(page)}.png`), { fullPage: true });

      await panel.getByRole('link', { name: 'Open as a page' }).click();
      await page.waitForURL((url) => url.pathname === '/chat', { timeout: WAIT_MS });
      await idle(page);
      await expectVisible(page.locator('[data-chat-page] [data-chat-panel="page"]'), 'the same panel, as a page of its own');
      await expectCount(dockOf(page), 0, 'and her face is not docked over it: the page is the panel');
      await expectCount(page.locator('[data-chat-panel] button[aria-label="Close"]'), 0, 'a page closes on nothing, being a page');
      await settled(page);
      await photograph(page, path.join(OUT, `chat-page-${await themeOf(page)}.png`), { fullPage: true });
    } finally {
      back();
    }
    await page.goto(new URL('/', page.url()).href, { waitUntil: 'load' });
    await idle(page);
    await expectVisible(
      dockOf(page).locator('[data-cue]', { hasText: 'Down' }),
      'taken back, she has no session, and a Down cue stands beside her face',
    );
  },
} satisfies PageSpec;
