import fs from 'node:fs';
import path from 'node:path';
import { chatFieldOf, herChat, openChat, photograph, themeOf } from '../board.ts';
import { expectCount, expectNone, expectVisible, idle, Refused, settled } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** A permission's three choices, as the runtime offers them, each with its one line. */
const [ALLOW, ALWAYS, DENY] = [
  { label: 'Allow once', description: 'Run this call, and ask again next time.', recommended: false },
  { label: 'Always allow', description: 'Run it, and calls like it, without asking.', recommended: false },
  { label: 'Deny', description: 'Refuse the call; she is told it was refused.', recommended: false },
];

/** What the SDK hands over with a Bash call that would prompt: its title, why, and the command as typed, spaces and quotes kept. */
const RUN = {
  title: 'Claude wants to run a command',
  description: 'Removes the build folder before the next build',
  decisionReason: 'No rule allows Bash(rm *)',
  command: 'rm -rf  ./dist && echo "cleaned"',
};

/** What it hands over with an edit outside her folder: no Always offered, and the SDK leaning to no. */
const EDIT = {
  title: 'Claude wants to edit a file outside its folder',
  blockedPath: '/etc/hosts',
};

/** What the person writes instead of a choice: it denies the call, and is what she reads of why. */
const WORDS = 'Not dist: clean out/ instead';

/**
 * Her chat's asks file with two permissions of hers on it, as the keeper copies a held call into it (`kind: 'permission'`, the
 * orchestrator's `chat.store.ts`): the edit first, then the run. Taken back with her folder by `herChat`'s take-back.
 */
function permissions(): void {
  const chat = path.join(store!, 'nemia', 'chat');
  fs.mkdirSync(chat, { recursive: true });
  const at = (seconds: number) => new Date(Date.now() - 200_000 + seconds * 1000).toISOString();
  const ask = (title: string, options: readonly (typeof ALLOW)[]) => [
    { question: title, header: 'Permission', options, multiSelect: false },
  ];
  const lines = [
    {
      id: 'call-edit',
      at: at(0),
      kind: 'permission',
      questions: ask(EDIT.title, [ALLOW, DENY]),
      permission: { tool: 'Edit', title: EDIT.title, blockedPath: EDIT.blockedPath, always: false, defaultToNo: true },
    },
    {
      id: 'call-run',
      at: at(10),
      kind: 'permission',
      questions: ask(RUN.title, [ALLOW, ALWAYS, DENY]),
      permission: { tool: 'Bash', ...RUN, always: true, defaultToNo: false },
    },
  ];
  fs.writeFileSync(path.join(chat, 'asks.jsonl'), lines.map((line) => `${JSON.stringify(line)}\n`).join(''));
}

export default {
  /**
   * A call of hers that would prompt, served in her chat as a question is: the form draws what the SDK handed over — the title as the
   * question, why it is asked and why it prompts, the path it reaches, a Bash call's command as typed — over the choices `Allow once`,
   * `Always allow` where the SDK offers it, and `Deny`, picked already where the SDK leans to no. Answered with that pick, then the
   * other answered in the person's own words, each answer is filed and drawn on its ask.
   *
   * Everything here is the real road: the permissions are written where the keeper writes them, and each answer goes through
   * `POST /api/nemia/chat/answer` to her chat's own file, which the stream brings back as the choice on the ask. Her task, her level
   * and her chat's files are taken back after.
   */
  name: 'chat-permission',
  route: '/',
  expect: async (page) => {
    const back = herChat({ session: 'answering', said: [{ text: 'I am cleaning the build before the next one.' }] });
    try {
      permissions();
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      const panel = await openChat(page);
      const forms = panel.locator('[data-chat-ask="form"]');
      await expectCount(forms, 2, 'each permission is drawn as the form a question is');
      const [edit, run] = [forms.filter({ hasText: EDIT.title }), forms.filter({ hasText: RUN.title })];

      await expectVisible(run.locator('[data-chat-tag="asks to run"]'), 'its tag says she asks to run a call');
      await expectVisible(run.getByText('1 of 1 · Permission'), 'the fieldset names it by its header');
      await expectVisible(run.locator('[data-chat-permission="description"]', { hasText: RUN.description }), 'the SDK’s description');
      await expectVisible(run.locator('[data-chat-permission="reason"]', { hasText: RUN.decisionReason }), 'and why it prompts');
      const command = run.locator('[data-chat-permission="command"]');
      await expectVisible(command, 'the command is drawn');
      if ((await command.textContent()) !== RUN.command) throw new Refused('the command is drawn as typed, its spaces and quotes kept');
      await expectCount(run.locator('[data-chat-option]'), 3, 'Allow once, Always allow and Deny');
      if ((await run.locator('[data-chat-option][data-selected="true"]').count()) !== 0)
        throw new Refused('nothing is picked where the SDK does not lean to no');

      await expectVisible(edit.locator('[data-chat-permission="path"]', { hasText: EDIT.blockedPath }), 'the path it reaches');
      await expectCount(edit.locator('[data-chat-permission="command"]'), 0, 'no command where the call is no Bash');
      await expectCount(edit.locator('[data-chat-option]'), 2, 'no Always allow where the SDK suppressed it');
      await expectCount(edit.locator(`[data-chat-option="${ALWAYS.label}"]`), 0, 'and the two left are Allow once and Deny');
      await expectVisible(edit.locator(`[data-chat-option="${DENY.label}"][data-selected="true"]`), 'Deny is picked already');
      const answer = edit.getByRole('button', { name: 'Answer', exact: true });
      if (await answer.isDisabled()) throw new Refused('and the Answer is on, the pick being made');
      await settled(page);
      await photograph(page, path.join(OUT, `chat-permission-asking-${await themeOf(page)}.png`), { fullPage: true });

      await answer.click();
      await expectVisible(
        edit.locator('[data-chat-chose]', { hasText: `You chose: ${DENY.label}` }),
        'the pick is filed, and her chat draws it on the ask',
      );
      await expectVisible(edit.locator('[data-chat-tag="answered"]'), 'its tag says it is answered');

      const field = chatFieldOf(page);
      await expectNone(async () => {
        const said = await field.getAttribute('placeholder');
        return said === 'Or answer in your own words' ? null : `the composer says ${JSON.stringify(said)}`;
      }, 'one permission left waiting, the composer invites the person’s own words');
      await field.fill(WORDS);
      await field.press('Enter');
      await expectVisible(
        run.locator('[data-chat-chose]', { hasText: `You chose: ${WORDS}` }),
        'their words answer the permission, filed as the answer',
      );
      await expectCount(panel.locator('[data-chat-bubble="person"]'), 0, 'and nothing of it was said to her as the next message');
      await settled(page);
      await photograph(page, path.join(OUT, `chat-permission-answered-${await themeOf(page)}.png`), { fullPage: true });
    } finally {
      back();
    }
  },
} satisfies PageSpec;
