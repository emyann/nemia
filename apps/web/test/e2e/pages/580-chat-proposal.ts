import path from 'node:path';
import { herChat, openChat, photograph, themeOf, type HerAsk } from '../board.ts';
import { expectCount, expectVisible, idle, settled } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** Her proposal: one question whose choices need no explaining, so each is said whole by its own button (boards 5 and 6). */
const ASK: HerAsk = {
  id: 'call-proposal',
  questions: [
    {
      question: 'The week’s quota is at 87% with 78% of the week gone. Hold new starts in every factory until Wednesday 7:00 AM?',
      header: 'Quota',
      options: [
        { label: 'Hold new starts', description: '', recommended: false },
        { label: 'Keep going', description: '', recommended: false },
      ],
    },
  ],
};

/** The action the person takes. */
const CHOSE = 'Hold new starts';

export default {
  /**
   * Her proposal in the chat, taken from it: the canvas's boards 5 and 6. Her words stand in her own bubble, each choice is a button
   * of its own with nothing else asked, and the tag says she proposes. Taken, the tag turns to `Proposed` and the line under her words
   * says what the person chose — board 6 — with no button left to press.
   *
   * Her task, her level and her chat's files are taken back after.
   */
  name: 'chat-proposal',
  route: '/',
  expect: async (page) => {
    const back = herChat({ session: 'answering', said: [{ text: 'I am watching the week’s quota.' }], asks: [ASK] });
    try {
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      const panel = await openChat(page);
      const ask = panel.locator('[data-chat-ask="actions"]');
      await expectVisible(ask, 'a choice with nothing to explain is drawn as her actions, never as a form');
      await expectVisible(ask.locator('[data-chat-tag="proposes"]'), 'and the tag says she proposes');
      await expectVisible(ask.locator(`[data-chat-action="${CHOSE}"]`), 'each choice is a button that says it whole');
      await expectVisible(ask.locator('[data-chat-action="Keep going"]'), 'the other among them');
      await expectCount(ask.locator('[data-chat-option]'), 0, 'and nothing of the radio form is drawn');
      await settled(page);
      await photograph(page, path.join(OUT, `chat-proposal-proposes-${await themeOf(page)}.png`), { fullPage: true });

      await ask.locator(`[data-chat-action="${CHOSE}"]`).click();
      await expectVisible(
        panel.locator('[data-chat-chose]', { hasText: `You chose: ${CHOSE}` }),
        'the action reaches her chat, which says what the person chose',
      );
      await expectVisible(panel.locator('[data-chat-tag="proposed"]'), 'and her tag says it is proposed, not proposing');
      await expectCount(panel.locator('[data-chat-action]'), 0, 'with no action left to take');
      await settled(page);
      await photograph(page, path.join(OUT, `chat-proposal-decided-${await themeOf(page)}.png`), { fullPage: true });
    } finally {
      back();
    }
  },
} satisfies PageSpec;
