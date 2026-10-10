import fs from 'node:fs';
import path from 'node:path';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { FACTORIES } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The factory whose rules the page breaks by hand, then fails to write. */
const FACTORY = FACTORIES.hiring.name;

/** Words no factory's rules may be: they open with a frontmatter block, which would set a key. */
const KEYED = '---\ntools: Bash\n---\nUse Bash freely.';

const route = `/api/factories/${FACTORY}/rules`;

export default {
  /**
   * A factory's rules that cannot be told, and a save the api refuses. A directory planted where the store keeps the rules' file is read
   * with why it cannot be told and what that stops, no words, and Clear offered all the same; cleared, asked twice, it is gone and so is
   * the warning. Words that open with a frontmatter block are then refused on Save (422) in the package's words, under Not saved, and
   * nothing is written. Its one refusal is the point, so its page counts exactly it; what the page plants it takes back.
   */
  name: 'factory-rules-refused',
  route: `/factories/${FACTORY}/settings`,
  expect: async (page) => {
    const folder = path.join(store!, 'factories', FACTORY);
    const kept = path.join(folder, 'RULES.md');
    const had = fs.existsSync(folder);
    const refused = await page.context().newPage();
    try {
      fs.mkdirSync(kept, { recursive: true });
      const { problems } = watch(refused);
      await refused.goto(new URL(`/factories/${FACTORY}/settings`, page.url()).href, { waitUntil: 'load' });
      await idle(refused);
      const section = refused.locator('section[data-factory-rules]');
      const untold = section.locator('[data-rules-error]');
      await expectVisible(
        untold.getByText('These rules cannot be told, and no run starts in this factory until they can', { exact: true }),
        'rules that cannot be told say so, and what that stops',
      );
      await expectVisible(untold.getByText(`${kept} is not a file: remove it, and write the rules again.`, { exact: true }), 'and why');
      const words = section.getByRole('textbox', { name: 'Words' });
      if ((await words.inputValue()) !== '') throw new Refused(`a directory there gives no words — ${await words.inputValue()}`);
      await expectVisible(section.getByRole('button', { name: 'Clear…' }), 'with no words read, what is there can still be cleared');
      await settled(refused);
      await photograph(refused, path.join(OUT, `factory-rules-refused-untold-${await themeOf(refused)}.png`));

      await section.getByRole('button', { name: 'Clear…' }).click();
      const [cleared] = await Promise.all([
        refused.waitForResponse((r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === route, { timeout: WAIT_MS }),
        section.getByRole('button', { name: 'Clear', exact: true }).click(),
      ]);
      if (cleared.status() !== 200) throw new Refused(`Clear removes what is there — the api answered ${cleared.status()}`);
      await idle(refused);
      if (fs.existsSync(kept)) throw new Refused(`cleared, ${kept} is gone`);
      await expectCount(untold, 0, 'cleared, nothing is said to stop a run');
      await expectCount(section.getByRole('button', { name: 'Clear…' }), 0, 'and there is nothing left to clear');

      await words.fill(KEYED);
      const [answered] = await Promise.all([
        refused.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === route, { timeout: WAIT_MS }),
        section.getByRole('button', { name: 'Save', exact: true }).click(),
      ]);
      const { error } = (await answered.json()) as { error?: string };
      if (answered.status() !== 422 || !error?.includes('opens with a frontmatter block') || !error.endsWith('Nothing was written.'))
        throw new Refused(`the api refuses rules that open with a frontmatter block — it answered ${answered.status()}: ${error}`);
      const unsaved = section.locator('[data-rules-refused]');
      await expectVisible(unsaved.getByText('Not saved', { exact: true }), 'the page says the rules are not saved');
      if (!(await unsaved.textContent())?.includes(error))
        throw new Refused(`and why, in the package's words — it says ${JSON.stringify(await unsaved.textContent())}`);
      await expectCount(section.locator('[data-rules-done]'), 0, 'and does not say they are');
      if ((await words.inputValue()) !== KEYED) throw new Refused(`the words typed are kept, to mend — ${await words.inputValue()}`);
      if (fs.existsSync(kept)) throw new Refused(`refused, nothing is written — ${kept} is there`);
      await settled(refused);
      await photograph(refused, path.join(OUT, `factory-rules-refused-unsaved-${await themeOf(refused)}.png`));
      await idle(refused);
      const expected = `request answered 422: PUT ${answered.url()}`;
      const seen = problems();
      const others = seen.filter(
        (p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 422\b/.test(p),
      );
      if (!seen.includes(expected) || others.length)
        throw new Refused(
          `the refused page saw its one refusal as the browser reports it (its answer, and the line Chromium writes to the console for one) and nothing else — it saw:\n    ${seen.join('\n    ')}`,
        );
    } finally {
      await refused.close();
      fs.rmSync(had ? kept : folder, { recursive: true, force: true });
    }
  },
} satisfies PageSpec;
