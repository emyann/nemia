import path from 'node:path';
import { chatFieldOf, herChat, openChat, photograph, themeOf, type HerAsk } from '../board.ts';
import { expectCount, expectNone, expectVisible, idle, Refused, settled } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** Her one question, its two choices explained, as the keeper copied her call into the chat: the canvas's board 7. */
const ASK: HerAsk = {
  id: 'call-asks',
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

/** The choice the person makes, and what the composer invites while her question waits on them. */
const CHOSE = 'Cut it on read';
const ASKING_WORDS = 'Or answer in your own words';

export default {
  /**
   * A question of hers with its choices explained, answered from her chat: the canvas's board 7. The form draws a row for each choice
   * with why it is one and the Recommended tag her words marked, the Answer is off until a choice is made, and the composer invites
   * the person's own words while the question waits on them. Answered, the ask keeps her words and says what they chose, and nothing
   * waits on them any more.
   *
   * Everything here is the real road: the question is written where the keeper writes it, and the answer goes through
   * `POST /api/nemia/chat/answer` to her chat's own file, which the stream brings back as the choice on the ask. Her task, her level
   * and her chat's files are taken back after.
   */
  name: 'chat-asks',
  route: '/',
  expect: async (page) => {
    const back = herChat({ session: 'answering', said: [{ text: 'I am reading the six runs that wait on you.' }], asks: [ASK] });
    try {
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      const panel = await openChat(page);
      const ask = panel.locator('[data-chat-ask="form"]');
      await expectVisible(ask, 'her question is drawn as the form, its choices explaining themselves');
      await expectVisible(ask.locator('[data-chat-tag="asks you"]'), 'and its tag says it waits on the person');
      await expectVisible(ask.getByText('1 of 1 · Summary'), 'the fieldset names the question by its header');
      await expectVisible(ask.getByText('The first line, cut at a word to 120 characters.'), 'each choice says why it is one');
      await expectVisible(ask.locator('[data-chat-recommended]'), 'and the one her words recommended carries the tag');
      const answer = ask.getByRole('button', { name: 'Answer', exact: true });
      if (!(await answer.isDisabled())) throw new Refused('the Answer is off until a choice is made');
      await expectNone(
        async () => {
          const said = await chatFieldOf(page).getAttribute('placeholder');
          return said === ASKING_WORDS ? null : `the composer says ${JSON.stringify(said)}`;
        },
        `the composer invites ${JSON.stringify(ASKING_WORDS)} while her question waits`,
      );
      await settled(page);
      await photograph(page, path.join(OUT, `chat-asks-asking-${await themeOf(page)}.png`), { fullPage: true });

      await ask.locator(`[data-chat-option="${CHOSE}"]`).click();
      await expectVisible(answer, 'a choice made, the Answer is there to press');
      if (await answer.isDisabled()) throw new Refused('and it is on, the question being answered');
      await answer.click();
      await expectVisible(
        panel.locator('[data-chat-chose]', { hasText: `You chose: ${CHOSE}` }),
        'the answer reaches her chat, which draws the choice on the ask',
      );
      await expectCount(ask.getByRole('button', { name: 'Answer', exact: true }), 0, 'and asks nothing more of the person');
      await expectVisible(panel.locator('[data-chat-tag="answered"]'), 'its tag says it is answered');
      await settled(page);
      await photograph(page, path.join(OUT, `chat-asks-answered-${await themeOf(page)}.png`), { fullPage: true });
    } finally {
      back();
    }

    const cut = herChat({ session: 'up', asks: [{ ...ASK, cut: true }] });
    try {
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      const panel = await openChat(page);
      await expectVisible(
        panel.locator('[data-chat-ask="form"]'),
        'a question whose call was cut with nothing answered is still drawn: the person may answer it, and her answer comes as words',
      );
      await expectNone(
        async () => {
          const said = await chatFieldOf(page).getAttribute('placeholder');
          return said === ASKING_WORDS ? `the composer still invites ${JSON.stringify(said)}` : null;
        },
        'but the composer waits on nobody for it: nothing of hers is held open for the words to answer',
      );
    } finally {
      cut();
    }
  },
} satisfies PageSpec;
