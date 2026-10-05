import fs from 'node:fs';
import path from 'node:path';
import { photograph, themeOf } from '../board.ts';
import { expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The workflow of yours the page writes, which a queued card still needs. */
const NEEDED = 'a-card-still-needs-it-e2e';

/** The card queued to start on it. */
const CARD = 'queued-on-it-e2e';

export default {
  /**
   * A workflow of yours a queued card still needs is not removed: the api answers 409 in the package's words, naming the card and the
   * command that takes it back, and the card on the board shows them verbatim, with the folder left whole on the disk. Its one refusal is
   * the point, so its page counts exactly it; the folder and the card are written by the page and taken back after.
   */
  name: 'workflow-remove-refused',
  route: '/workflows',
  expect: async (page) => {
    const dir = path.join(store!, 'workflows', NEEDED);
    const card = path.join(store!, 'inbox', `${CARD}.md`);
    const refused = await page.context().newPage();
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'plan.md'), '---\nharness: claude\n---\nWrite PLAN.md.\n');
      fs.writeFileSync(card, `---\nworkflow: ${dir}\nqueued: 2026-10-01T00:00:00.000Z\n---\nAn idea queued on it.\n`);
      const { problems } = watch(refused);
      await refused.goto(page.url(), { waitUntil: 'load' });
      await idle(refused);
      const section = refused.locator(`section[aria-label="Workflow ${NEEDED}"]`);
      await section.getByRole('button', { name: 'Remove…' }).click();
      const [answered] = await Promise.all([
        refused.waitForResponse(
          (r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === `/api/workflows/yours/${NEEDED}`,
          { timeout: WAIT_MS },
        ),
        section.getByRole('button', { name: 'Remove', exact: true }).click(),
      ]);
      const { error } = (await answered.json()) as { error?: string };
      const sentence = `${dir} is still needed: card ${CARD} is queued to start on ${dir}: nemia inbox queue ${CARD} --off takes it back, or --workflow <w> names another. Nothing was removed.`;
      if (answered.status() !== 409 || error !== sentence)
        throw new Refused(
          `the api refuses a folder a queued card needs, in the package's words — it answered ${answered.status()}: ${error}`,
        );
      const shown = section.locator('[data-remove-refused]');
      await expectVisible(shown, 'the refusal is shown on the card, not swallowed');
      if ((await shown.textContent()) !== error)
        throw new Refused(`the card shows the package's sentence verbatim — it shows ${JSON.stringify(await shown.textContent())}`);
      if (!fs.existsSync(path.join(dir, 'plan.md'))) throw new Refused(`nothing is removed on a refusal — ${dir} lost its step`);
      await settled(refused);
      await photograph(section, path.join(OUT, `workflow-remove-refused-${await themeOf(refused)}.png`));
      await idle(refused);
      const expected = `request answered 409: DELETE ${answered.url()}`;
      const seen = problems();
      const others = seen.filter(
        (p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 409\b/.test(p),
      );
      if (!seen.includes(expected) || others.length)
        throw new Refused(
          `the refused page saw its one refusal as the browser reports it (its answer, and the line Chromium writes to the console for one) and nothing else — it saw:\n    ${seen.join('\n    ')}`,
        );
    } finally {
      await refused.close();
      fs.rmSync(card, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
    }
    await page.reload({ waitUntil: 'load' });
    await idle(page);
  },
} satisfies PageSpec;
