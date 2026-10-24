import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The custom instruction her rules come from, as a person wrote it. */
const INSTRUCTION =
  'Merge on your own when everyone agrees. Retry implement on your own while a run has cost under $20. Write to me in French.';

/** What she proposed from it: a rule the machinery holds, and the words it cannot, kept as guidance. */
const PROPOSAL = {
  at: '2026-10-06T12:00:00.000Z',
  rules: [{ id: 'retry-implement', answer: 'retry', steps: ['implement'], when: ['withinBudget'], under: 20 }],
  guidance: ['Write to me in French.'],
  digest: createHash('sha256').update(INSTRUCTION).digest('hex').slice(0, 16),
};

/** Press `control`, wait for the api's answer to the rule's write by `method`, and refuse any but a 200: the body the board sent. */
async function wrote(page: Page, control: Locator, method: 'PUT' | 'DELETE', what: string): Promise<unknown> {
  const [answer] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === method && new URL(r.url()).pathname.startsWith('/api/policy/nemia/rules/'), {
      timeout: WAIT_MS,
    }),
    control.click(),
  ]);
  if (answer.status() !== 200) throw new Refused(`${what} — the api answered ${answer.status()}: ${await answer.text()}`);
  await idle(page);
  return answer.request().postDataJSON();
}

/** Refuse a confirm whose body is not the words `rule` reads on the board. */
async function expectWordsSent(sent: unknown, rule: Locator, what: string): Promise<void> {
  const words = (await rule.locator('[data-auto-words]').textContent()) ?? '';
  if (JSON.stringify(sent) !== JSON.stringify({ words }))
    throw new Refused(`${what} sends the words the person read, ${JSON.stringify(words)} — it sent ${JSON.stringify(sent)}`);
}

export default {
  /**
   * Her rules at Auto on the store's Settings, beside the custom instruction they come from: the default in force, marked Default, since
   * nothing is confirmed; what she proposed, a Confirm on it, and the words kept as guidance. A confirm puts the rule in force beside the
   * default and marks it so among what she proposed, sending the words the person read; a drop of the default leaves the rule alone in
   * force and offers the default back, which puts the builtin rule back. The instruction, the proposal and the person's list are written by
   * the page and taken back after.
   */
  name: 'auto-rules',
  route: '/settings',
  expect: async (page) => {
    const instruction = path.join(store!, 'custom-instructions', 'nemia.md');
    const auto = path.join(store!, 'auto');
    try {
      fs.mkdirSync(path.dirname(instruction), { recursive: true });
      fs.writeFileSync(instruction, `${INSTRUCTION}\n`);
      fs.mkdirSync(auto, { recursive: true });
      fs.writeFileSync(path.join(auto, 'nemia.proposed.json'), JSON.stringify(PROPOSAL));
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      const part = page.locator('[data-nemia-section] [data-auto-rules]');
      const words = part.locator('[data-custom-instructions] textarea');
      await expectVisible(words, 'her rules sit beside your instruction, written there');
      if ((await words.inputValue()) !== INSTRUCTION)
        throw new Refused(`as you wrote it — it reads ${JSON.stringify(await words.inputValue())}`);
      const inForce = part.locator('[data-auto-in-force]');
      await expectVisible(
        inForce.getByText('In force: the default, since you confirmed none'),
        'the default is in force, nothing confirmed',
      );
      await expectVisible(inForce.locator('[data-auto-rule="default"] [data-auto-default]'), 'marked Default');
      await expectVisible(
        inForce.locator('[data-auto-rule="default"]', { hasText: 'its check passed' }),
        'in words generated from its conditions',
      );
      const proposed = part.locator('[data-auto-proposed="true"] [data-auto-rule="retry-implement"]');
      await expectVisible(proposed.locator('[data-auto-confirm]'), 'what she proposed waits on your Confirm');
      if (await part.locator('[data-auto-stale]').count()) throw new Refused('a proposal from the instruction as it stands is not stale');
      await expectVisible(
        part.locator('[data-auto-guidance]', { hasText: 'Write to me in French.' }),
        'the words she cannot hold are guidance',
      );
      await settled(page);
      await photograph(part, path.join(OUT, `auto-rules-proposed-${await themeOf(page)}.png`));
      const sent = await wrote(page, proposed.locator('[data-auto-confirm]'), 'PUT', 'the proposed rule is confirmed');
      await expectWordsSent(sent, proposed, 'a confirm');
      await expectVisible(inForce.locator('[data-auto-rule="retry-implement"]'), 'the rule confirmed is in force');
      await expectVisible(inForce.locator('[data-auto-rule="default"]'), 'beside the default');
      await expectVisible(proposed.locator('[data-auto-confirmed]'), 'and reads in force among what she proposed');
      await wrote(page, inForce.locator('[data-auto-rule="default"] [data-auto-drop]'), 'DELETE', 'the default is dropped');
      if (await inForce.locator('[data-auto-rule="default"]').count()) throw new Refused('a dropped default is out of force');
      await expectVisible(inForce.locator('[data-auto-default-back]'), 'and offered back');
      await settled(page);
      await photograph(part, path.join(OUT, `auto-rules-confirmed-${await themeOf(page)}.png`));
      const back = await wrote(page, inForce.locator('[data-auto-default-back]'), 'PUT', 'the default is put back');
      await expectWordsSent(back, inForce.locator('[data-auto-rule="default"]'), 'a put-back');
      await expectVisible(inForce.locator('[data-auto-rule="default"] [data-auto-default]'), 'the builtin default is in force again');
    } finally {
      fs.rmSync(instruction, { force: true });
      fs.rmSync(auto, { recursive: true, force: true });
    }
    await page.reload({ waitUntil: 'load' });
    await idle(page);
    await expectVisible(
      page.locator('[data-auto-in-force]').getByText('In force: the default, since you confirmed none'),
      'taken back, the default is in force again',
    );
  },
} satisfies PageSpec;
