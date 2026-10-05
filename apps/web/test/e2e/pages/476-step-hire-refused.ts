import fs from 'node:fs';
import path from 'node:path';
import { photograph, themeOf } from '../board.ts';
import { expectOnScreen, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { AGENTS, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The factory the page writes, on the checkout, offering no workflow, so it hires no one into `mine`'s steps. */
const FACTORY = 'unhirer-e2e';

/** The agent of yours the page makes through New agent, which the factory then refuses to hire. */
const MADE = { name: 'unhired-e2e', description: 'Use this when a plan needs a second reader.', body: 'You read the plan twice.' } as const;

export default {
  /**
   * New agent come from a step whose factory refuses the hire: the agent is written, the hire is answered 422 in the package's words,
   * and the person stays on the creator, which says in the window that the agent is created but not hired, and why, with the way back
   * to the step. Its one refusal is the point, so its page counts exactly it; the factory and the agent are written by the page and
   * taken back after.
   */
  name: 'step-hire-refused',
  route: '/agents',
  expect: async (page) => {
    const { yours } = WORKFLOWS;
    const factoryFile = path.join(store!, 'factories', `${FACTORY}.json`);
    const madeFile = path.join(store!, 'workflows', 'agents', `${MADE.name}.md`);
    const refused = await page.context().newPage();
    try {
      fs.writeFileSync(factoryFile, JSON.stringify({ repos: [path.join(store!, 'checkout')], workflows: [] }, null, 2));
      const { problems } = watch(refused);
      const creator = `/agents/new?factory=${FACTORY}&workflow=${yours.name}&step=plan`;
      await refused.goto(new URL(creator, page.url()).href, { waitUntil: 'load' });
      await idle(refused);
      await expectVisible(
        refused.locator(`[data-hire-into="${yours.name}/plan"]`),
        'the creator says it hires what it makes into the step',
      );
      const form = refused.getByRole('form', { name: 'New agent' });
      await form.getByRole('textbox', { name: 'Name' }).fill(MADE.name);
      await form.getByRole('textbox', { name: 'Description' }).fill(MADE.description);
      await form.getByRole('textbox', { name: 'Model' }).fill(AGENTS.made.model);
      await form.getByRole('textbox', { name: 'Instructions' }).fill(MADE.body);
      const [answered] = await Promise.all([
        refused.waitForResponse(
          (r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/factories/${FACTORY}/hires/${yours.name}%2Fplan`,
          { timeout: WAIT_MS },
        ),
        form.getByRole('button', { name: 'Create agent' }).click(),
      ]);
      const { error } = (await answered.json()) as { error?: string };
      const sentence = `${FACTORY} does not offer the workflow ${yours.name}, so it hires no one into its steps. Attach it first — nemia factory attach ${FACTORY} ${yours.name} — then hire. Nothing was hired.`;
      if (answered.status() !== 422 || error !== sentence)
        throw new Refused(`the api refuses the hire in the package's words — it answered ${answered.status()}: ${error}`);
      const unhired = refused.locator('[data-hire-unhired]');
      await expectVisible(unhired, 'the creator says the agent is created but not hired');
      await expectOnScreen(unhired, 'in the window, though Create was pressed at the foot of the form');
      if (!(await unhired.textContent())?.includes(sentence))
        throw new Refused(`and why, in the package's words — it says ${JSON.stringify(await unhired.textContent())}`);
      await expectVisible(unhired.getByRole('link', { name: 'Back to the step' }), 'with the way back to the step');
      const at = new URL(refused.url());
      if (at.pathname !== '/agents/new') throw new Refused(`the person stays on the creator — the page went to ${at.pathname}`);
      if (!fs.existsSync(madeFile)) throw new Refused(`the agent is created all the same — ${madeFile} is not there`);
      await settled(refused);
      await photograph(refused, path.join(OUT, `step-hire-refused-says-${await themeOf(refused)}.png`));
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
      fs.rmSync(madeFile, { force: true });
      fs.rmSync(factoryFile, { force: true });
    }
    await page.reload({ waitUntil: 'load' });
    await idle(page);
  },
} satisfies PageSpec;
