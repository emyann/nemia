import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The repository's agent the page writes custom instructions for, the words it saves, and the words the package refuses. */
const CUSTOM = {
  agent: 'implementer',
  words: 'Write every commit message in the imperative, under sixty columns.',
  frontmatter: '---\nmodel: opus\n---\nBe bold.',
} as const;

const route = `/api/custom-instructions/${CUSTOM.agent}`;

const answered = (page: Page, method: 'PUT' | 'DELETE') =>
  page.waitForResponse((r) => r.request().method() === method && new URL(r.url()).pathname === route, { timeout: WAIT_MS });

/**
 * On a second page, words opening with a frontmatter block are saved: the api answers 422 with the package's sentence, the panel shows it
 * word for word, nothing is written, and the page's watch sees that one refusal and nothing else.
 */
async function refusedOn(page: Page, file: string): Promise<void> {
  const refused = await page.context().newPage();
  try {
    const { problems } = watch(refused);
    await refused.goto(page.url(), { waitUntil: 'load' });
    await idle(refused);
    const panel = refused.locator('section[data-custom-instructions]');
    await panel.getByRole('textbox', { name: 'Words' }).fill(CUSTOM.frontmatter);
    const [put] = await Promise.all([answered(refused, 'PUT'), panel.getByRole('button', { name: 'Save' }).click()]);
    const { error } = (await put.json()) as { error?: string };
    if (put.status() !== 422 || !error?.includes('opens with a frontmatter block'))
      throw new Refused(`the package refuses words opening with ---, as 422 — the api answered ${put.status()}: ${JSON.stringify(error)}`);
    const shown = panel.locator('[data-custom-refused] p.font-mono');
    await expectVisible(shown, 'the refusal is shown under the words, not swallowed');
    if ((await shown.textContent()) !== error)
      throw new Refused(`the panel shows the package's sentence, verbatim — it shows ${JSON.stringify(await shown.textContent())}`);
    if (fs.existsSync(file)) throw new Refused(`nothing is written on a refusal — ${file} is there`);
    await settled(refused);
    await photograph(
      refused.locator('section[data-custom-instructions]'),
      path.join(OUT, `custom-instructions-refused-${await themeOf(refused)}.png`),
    );
    await idle(refused);
    const expected = `request answered 422: PUT ${put.url()}`;
    const seen = problems();
    const others = seen.filter(
      (p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 422\b/.test(p),
    );
    if (!seen.includes(expected) || others.length)
      throw new Refused(`the refused page saw its one refusal and nothing else — it saw:\n    ${seen.join('\n    ')}`);
  } finally {
    await refused.close();
  }
}

export default {
  /**
   * A person's custom instructions for the repository's `implementer`, on its page, between the form and Try. The panel says a run already
   * started keeps the words it froze, and that there are none yet, in the store's `custom-instructions/`. Words opening with a frontmatter
   * block are refused in the package's words, on a page of their own. Saved, the words are the file's, and read again on a reload; cleared,
   * asked twice, the file is gone and the panel says none again — so each visit reads the store as seeded.
   */
  name: 'custom-instructions',
  route: `/agents/repo/${CUSTOM.agent}`,
  expect: async (page) => {
    const file = path.join(store!, 'custom-instructions', `${CUSTOM.agent}.md`);
    if (fs.existsSync(file)) throw new Refused(`the store holds no custom instructions before the page writes any — ${file} is there`);
    const panel = page.locator('section[data-custom-instructions]');
    try {
      await expectVisible(
        panel.locator('[data-custom-frozen]', { hasText: 'A run already started keeps the words it froze' }),
        'the panel says a run already started keeps the words it froze',
      );
      await expectVisible(panel.locator('[data-custom-file]', { hasText: `${file} — none yet` }), 'and where they would be, none yet');
      await expectVisible(
        page.locator('article > section[data-custom-instructions] + section[data-try-yours]'),
        'the panel comes just before Try',
      );

      await refusedOn(page, file);

      await panel.getByRole('textbox', { name: 'Words' }).fill(CUSTOM.words);
      const [put] = await Promise.all([answered(page, 'PUT'), panel.getByRole('button', { name: 'Save' }).click()]);
      if (put.status() !== 200) throw new Refused(`the api saves the words — it answered ${put.status()}: ${await put.text()}`);
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8').trim() !== CUSTOM.words)
        throw new Refused(
          `saved, the words are ${file}'s — it holds ${fs.existsSync(file) ? JSON.stringify(fs.readFileSync(file, 'utf8')) : 'nothing'}`,
        );
      await expectVisible(panel.locator('[data-custom-done]', { hasText: 'Saved' }), 'the panel says they are saved, for runs from now');

      await page.reload({ waitUntil: 'load' });
      await idle(page);
      const words = panel.getByRole('textbox', { name: 'Words' });
      await expectVisible(words, 'the words, read again');
      if ((await words.inputValue()) !== CUSTOM.words)
        throw new Refused(`reloaded, the panel reads the words again — it holds ${JSON.stringify(await words.inputValue())}`);
      await expectCount(panel.locator('[data-custom-file]', { hasText: 'none yet' }), 0, 'and no longer says none yet');
      await settled(page);
      await photograph(panel, path.join(OUT, `custom-instructions-written-${await themeOf(page)}.png`));

      await panel.getByRole('button', { name: 'Clear…' }).click();
      const asks = panel.locator('[data-custom-clear-asks]');
      await expectVisible(asks, 'Clear asks once more before it removes them');
      const [cleared] = await Promise.all([answered(page, 'DELETE'), asks.getByRole('button', { name: 'Clear', exact: true }).click()]);
      if (cleared.status() !== 200)
        throw new Refused(`the api clears the words — it answered ${cleared.status()}: ${await cleared.text()}`);
      if (fs.existsSync(file)) throw new Refused(`cleared, ${file} is gone`);
      await expectVisible(panel.locator('[data-custom-file]', { hasText: 'none yet' }), 'cleared, the panel says none yet again');
      await idle(page);
    } finally {
      fs.rmSync(file, { force: true });
    }
  },
} satisfies PageSpec;
