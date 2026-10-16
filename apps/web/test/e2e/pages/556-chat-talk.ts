import path from 'node:path';
import type { Route } from 'playwright';
import { chatPanelOf, dockOf, expectPanelHeld, herChat, herEvent, openChat, photograph, themeOf, type HerLine } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT } from '../world.ts';

/** Her session's transcript: her words, her tool calls, and a last call with no result, which is the one at work. */
const SAID: readonly HerLine[] = [
  {
    text:
      'I am keeping the two kit cards moving. The first is at its design gate and the second waits on it, so I am holding the second ' +
      'until the first lands; neither has cost more than a dollar so far, and nothing of theirs waits on you yet.',
  },
  { tool: 'Read', says: 'docs/architecture.md', result: 'read 420 lines' },
  { tool: 'Bash', says: 'npx turbo run test --force', result: 'all green' },
  {
    text:
      'Both checks are green, and both runs are back at work after their merges. The runs are on [the runs page](/runs), and the ' +
      'factory is [Nemia](/factories).',
  },
  { tool: 'Grep', says: 'waitsOnYou', result: '6 matches' },
  {
    text:
      'Six runs wait on you. The oldest is the kit card, which has waited since this morning; the other five are gates I may not ' +
      'answer for you. I will keep the two kit cards moving while you read them, and say so here when either moves.',
  },
  { tool: 'Read', says: 'packages/agent-orchestrator/docs/features.md', result: 'read 180 lines' },
  { tool: 'Bash', says: 'nemia runs --json', result: '6 waiting' },
  { tool: 'Task', says: 'watch the two runs to their gates' },
];

/** What the person wrote that the api took: the first delivered by the keeper, the second still in the outbox. */
const WROTE = [
  { id: 'o-1', at: new Date(Date.now() - 300_000).toISOString(), text: 'Merge it when the check is green.' },
  { id: 'o-2', at: new Date(Date.now() - 60_000).toISOString(), text: 'And start the two kit cards as one batch.' },
];

/** The words her links are drawn as buttons on, and the pages they lead to. */
const LINKS = [
  { words: 'the runs page', href: '/runs' },
  { words: 'Nemia', href: '/factories' },
];

/** Her steps, as a Trace: the last call of the session she is answering in is the one running, and the composer offers the stop. */
async function expectWorking(panel: ReturnType<typeof chatPanelOf>): Promise<void> {
  const turn = panel.locator('[data-chat-turn="running"]');
  await expectVisible(turn, 'her steps stand as a Trace, the turn she is in drawn open');
  await expectVisible(
    turn.locator('[data-chat-step="running"]', { hasText: 'Task: watch the two runs to their gates' }),
    'the latest step runs',
  );
  await expectCount(turn.locator('[data-chat-step="running"]'), 1, 'and it alone runs: every step before it is done');
  await expectCount(
    panel.locator('[data-chat-composer]').getByRole('button', { name: 'Stop her answer' }),
    1,
    'her turn can be ended from the panel, which `chat-stop` presses',
  );
  const field = panel.locator('[data-chat-composer] textarea');
  const placeholder = await field.getAttribute('placeholder');
  if (placeholder !== 'She is answering. Write the next one, or stop her')
    throw new Refused(`the composer asks for the next message, or the stop, while she answers — it says ${placeholder}`);
  if (await field.isDisabled()) throw new Refused('and it takes it: a message written while she answers waits in her outbox');
}

/** Her answer: the sentence plain, and each page she named a filled button under it. */
async function expectAnswer(panel: ReturnType<typeof chatPanelOf>): Promise<void> {
  const bubble = panel.locator('[data-chat-message="agent"]', { hasText: 'Both checks are green' });
  const words = (await bubble.locator('[data-chat-bubble="agent"]').textContent()) ?? '';
  if (!words.includes('on the runs page, and the factory is Nemia.'))
    throw new Refused(`her sentence reads plain, the link's own words in its place — it reads ${JSON.stringify(words)}`);
  if (words.includes('](')) throw new Refused(`and holds no markdown of its own — it reads ${JSON.stringify(words)}`);
  const buttons = bubble.getByRole('link');
  await expectTexts(
    buttons,
    LINKS.map((link) => link.words),
    'each page she named is a button under her words',
  );
  for (const [i, link] of LINKS.entries()) {
    const href = await buttons.nth(i).getAttribute('href');
    if (href !== link.href) throw new Refused(`the button on ${link.words} leads to ${link.href} — it leads to ${href}`);
  }
}

export default {
  /**
   * Nemia answering, read back: her steps as a Trace with the latest running, her answer with the pages she named as buttons under it,
   * the keeper's words as one quiet marker, the person's own words as bubbles, and what is new since the read mark said over a line and
   * on the pill that jumps to it. The read mark the panel posts is held until the pill is read, then let through, and her chat is taken
   * back after.
   */
  name: 'chat-talk',
  route: '/',
  expect: async (page) => {
    const back = herChat({
      session: 'answering',
      said: SAID,
      read: herEvent(SAID, 0),
      outbox: WROTE,
      told: [
        { text: 'Woken: a gate waits on the person' },
        { text: 'The person writes from the board: Merge it when the check is green.', delivers: 'o-1' },
      ],
    });
    let held: Route | null = null;
    try {
      await page.route(
        (url) => url.pathname === '/api/nemia/chat/read',
        (route) => {
          held = route;
        },
      );
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      await expectVisible(dockOf(page).locator('[data-cue]', { hasText: '2 new' }), 'two answers of hers are unread, and a cue says so');

      const panel = await openChat(page);
      await expectVisible(panel.locator('[data-chat-where]', { hasText: 'Answering' }), 'the header says she is answering');
      await expectWorking(panel);
      await expectPanelHeld(page);
      await settled(page);
      await photograph(page, path.join(OUT, `chat-talk-working-${await themeOf(page)}.png`), { fullPage: true });

      await expectAnswer(panel);
      await expectTexts(
        panel.locator('[data-chat-marker]'),
        ['Woken: a gate waits on the person'],
        "the keeper's words are one quiet marker",
      );
      await expectTexts(
        panel.locator('[data-chat-bubble="person"]'),
        WROTE.map((wrote) => wrote.text),
        'and the outbox alone is drawn as the person',
      );
      await expectVisible(
        panel.locator('[data-chat-new]', { hasText: '2 new' }),
        'a line stands over the first answer the person has not read',
      );
      await settled(page);
      await photograph(page, path.join(OUT, `chat-talk-answer-${await themeOf(page)}.png`), { fullPage: true });

      await panel.locator('[data-chat-talk]').evaluate((box) => {
        box.scrollTop = 0;
      });
      const jump = panel.locator('[data-chat-jump]');
      await expectVisible(jump, 'scrolled back, a pill offers the latest');
      await expectTexts(jump, ['2 new · Jump to the latest'], 'saying how many answers are new');
      await settled(page);
      await photograph(page, path.join(OUT, `chat-talk-back-${await themeOf(page)}.png`), { fullPage: true });

      await jump.click();
      if (held === null) throw new Refused('the panel posts the read mark once her latest message is on screen');
      await Promise.all([
        page.waitForResponse((r) => new URL(r.url()).pathname === '/api/nemia/chat/read', { timeout: WAIT_MS }),
        (held as Route).continue(),
      ]);
      await expectCount(panel.locator('[data-chat-new]'), 0, 'and once the api has it, nothing is new any more');
      await expectCount(dockOf(page).locator('[data-cue]', { hasText: 'new' }), 0, 'nor is the cue beside her face');
    } finally {
      await page.unroute((url) => url.pathname === '/api/nemia/chat/read');
      back();
    }
  },
} satisfies PageSpec;
