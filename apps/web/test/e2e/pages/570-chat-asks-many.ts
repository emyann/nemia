import path from 'node:path';
import { herChat, openChat, photograph, themeOf, type HerAsk } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** Her three questions, as her closeout's design asked them: the canvas's board 7b. */
const ASK: HerAsk = {
  id: 'call-many',
  questions: [
    {
      question: 'What the board shows as an old closeout’s one line?',
      header: 'Summary',
      options: [
        { label: 'Cut it on read', description: 'The first line, cut at a word to 120 characters.', recommended: true },
        { label: 'First line as it is', description: 'The board cuts it by its layout.', recommended: false },
      ],
    },
    {
      question: 'Is a value artifact handed to the next step?',
      header: 'Values',
      options: [
        { label: 'Hand them', description: 'Inside the step’s closeout, beside its files.', recommended: true },
        { label: 'Board only', description: 'Shown to the person alone.', recommended: false },
      ],
    },
    {
      question: 'A field declared by both an agent and its step: refused in this slice, or the next?',
      header: 'First filing',
      options: [
        { label: 'The next slice brings it', description: 'This slice freezes at start.', recommended: true },
        { label: 'Prove it in this slice', description: 'A re-resolve at the first filing just to refuse.', recommended: false },
      ],
    },
  ],
};

/** What the person chooses, question by question. */
const CHOSE = ['Cut it on read', 'Hand them', 'Prove it in this slice'];

export default {
  /**
   * Her several questions, answered one tab at a time: the canvas's board 7b. A tab for each question and one more for Submit, the
   * choices numbered with the Recommended tag, a row that takes the person's own words, Next and `N OF M` under them, and on the last
   * tab the recap, where **Submit is refused until every question is answered** — the rule this page is for, pressed in both states.
   * Every answer is filed as one write, which her chat draws as the choice on the ask.
   *
   * Her task, her level and her chat's files are taken back after.
   */
  name: 'chat-asks-many',
  route: '/',
  expect: async (page) => {
    const back = herChat({ session: 'answering', said: [{ text: 'The design signed off with three questions.' }], asks: [ASK] });
    try {
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      const panel = await openChat(page);
      const ask = panel.locator('[data-chat-ask="many"]');
      await expectVisible(ask, 'her three questions are drawn as the flow, never as one form');
      await expectCount(ask.locator('[data-chat-qtab]'), 4, 'a tab for each question, and one more for Submit');
      await expectVisible(ask.locator('[data-chat-qtab="on"]', { hasText: 'Summary' }), 'the first question is the one in hand');
      await expectVisible(ask.getByText('1.', { exact: false }), 'its choices are numbered');
      await expectVisible(ask.locator('[data-chat-recommended]'), 'and the one her words recommended carries the tag');
      await expectVisible(ask.locator('[data-chat-own]'), 'a row takes the person’s own words');
      await expectVisible(ask.locator('[data-chat-of]', { hasText: '1 OF 3' }), 'and the count says where they are');
      await expectCount(ask.getByRole('button', { name: 'Back' }), 0, 'there is nothing behind the first question');
      await settled(page);
      await photograph(page, path.join(OUT, `chat-asks-many-asking-${await themeOf(page)}.png`), { fullPage: true });

      await ask.locator('[data-chat-qtab]').last().click();
      const submit = ask.locator('[data-chat-submit]');
      await expectVisible(submit, 'the last tab is the recap, with the Submit under it');
      if (!(await submit.isDisabled())) throw new Refused('REFUSED: Submit is off while a question is not answered');
      await expectVisible(ask.locator('[data-chat-left]', { hasText: '3 not answered' }), 'and the recap says how many are left');
      await expectCount(ask.getByText('Not answered yet'), 3, 'each question’s line says it is not answered yet');
      await settled(page);
      await photograph(page, path.join(OUT, `chat-asks-many-recap-${await themeOf(page)}.png`), { fullPage: true });

      for (const [i, label] of CHOSE.entries()) {
        await ask.locator('[data-chat-qtab]').nth(i).click();
        await ask.locator(`[data-chat-option="${label}"]`).click();
      }
      await ask.locator('[data-chat-qtab]').last().click();
      await expectVisible(ask.locator('[data-chat-left]', { hasText: 'All answered' }), 'every question answered, the recap says so');
      if (await submit.isDisabled()) throw new Refused('Submit is on once every question is answered');
      await settled(page);
      await photograph(page, path.join(OUT, `chat-asks-many-answered-${await themeOf(page)}.png`), { fullPage: true });

      await submit.click();
      await expectVisible(
        panel.locator('[data-chat-chose]', { hasText: `You chose: ${CHOSE.join(' · ')}` }),
        'the one write carries every answer, and her chat draws them on the ask',
      );
      await expectCount(panel.locator('[data-chat-qtab]'), 0, 'which asks nothing more of the person');
    } finally {
      back();
    }
  },
} satisfies PageSpec;
