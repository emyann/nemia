import path from 'node:path';
import { chatFieldOf, herChat, openChat, photograph, themeOf, type HerAsk } from '../board.ts';
import { expectCount, expectNone, expectVisible, idle, settled } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** Her one question with its choices explained, the form of the canvas's board 7: the one drawing the composer's words answer. */
const ASK: HerAsk = {
  id: 'call-words',
  questions: [
    {
      question: 'What the board shows as an old closeout’s one line?',
      header: 'Summary',
      options: [
        { label: 'Cut it on read', description: 'The first line, cut at a word to 120 characters.', recommended: true },
        { label: 'First line as it is', description: 'The board cuts it by its layout.', recommended: false },
      ],
    },
  ],
};

/** What the person writes instead of either choice, and what the composer invites with the question waiting and once it is answered. */
const WORDS = 'Neither: cut it on write, and keep the whole line';
const [ASKING_WORDS, HER_TURN] = ['Or answer in your own words', 'She is answering. Write the next one, or stop her'];

export default {
  /**
   * Her one question answered in the person's own words, from the composer: the half of board 7 no choice of hers covers. While the
   * question waits the composer invites their words, and what they write answers that question — it is not said to her as the next
   * message — so the ask keeps their words as the answer, its tag turns to answered, and the composer says again what where she is
   * says, nothing of hers waiting on them.
   *
   * Everything here is the real road: the question is written where the keeper writes it, and the words go through
   * `POST /api/nemia/chat/answer` to her chat's own file, which the stream brings back as the choice on the ask. Her task, her level
   * and her chat's files are taken back after.
   */
  name: 'chat-asks-words',
  route: '/',
  expect: async (page) => {
    const back = herChat({ session: 'answering', said: [{ text: 'I am reading the six runs that wait on you.' }], asks: [ASK] });
    try {
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      const panel = await openChat(page);
      const ask = panel.locator('[data-chat-ask="form"]');
      await expectVisible(ask, 'her question is drawn as the form, and takes the answer from the composer as well');
      const field = chatFieldOf(page);
      await expectNone(
        async () => {
          const said = await field.getAttribute('placeholder');
          return said === ASKING_WORDS ? null : `the composer says ${JSON.stringify(said)}`;
        },
        `the composer invites ${JSON.stringify(ASKING_WORDS)} while her one question waits`,
      );
      await field.fill(WORDS);
      await field.press('Enter');
      await expectVisible(
        panel.locator('[data-chat-chose]', { hasText: `You chose: ${WORDS}` }),
        'their own words answer the question itself, and the ask keeps them as the answer',
      );
      await expectVisible(panel.locator('[data-chat-tag="answered"]'), 'its tag says it is answered');
      await expectCount(panel.locator('[data-chat-bubble="person"]'), 0, 'and nothing of it was said to her as the next message');
      await expectNone(async () => {
        const said = await field.getAttribute('placeholder');
        return said === HER_TURN ? null : `the composer still says ${JSON.stringify(said)}`;
      }, 'nothing waits on them any more, and the composer is what where she is says, her turn in flight');
      await settled(page);
      await photograph(page, path.join(OUT, `chat-asks-words-answered-${await themeOf(page)}.png`), { fullPage: true });
    } finally {
      back();
    }
  },
} satisfies PageSpec;
