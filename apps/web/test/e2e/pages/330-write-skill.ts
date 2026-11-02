import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { AGENTS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The skill the page writes: a name no place has, a title, what it does, its card's tags and examples, and its instructions. */
const SKILL = {
  name: 'write-a-summary',
  title: 'Write a summary',
  description: 'Writes the summary of a change. Use when a change is done and a reader needs the short of it.',
  tags: ['summary', 'notes'],
  examples: ['Summarise this branch'],
  body: '# Write a summary\n\nSay what changed, and why, in three lines.\n',
  edited: 'Writes the short summary of a change, for a reader in a hurry.',
  stale: 'Typed while the file changed under the form.',
  byHand: 'Added by hand while the page was open.',
};

const wrote = (page: Page, method: 'POST' | 'PUT', pathname: string) =>
  page.waitForResponse((r) => r.request().method() === method && new URL(r.url()).pathname === pathname, { timeout: WAIT_MS });

export default {
  /**
   * A skill of your own, written on the board. In a page of its own, a new skill named as one your library has already is refused in the
   * package's words, and nothing is written. Then `scribe` names a skill nobody has yet, and New skill, from the Agents page, writes it:
   * its folder in your library, its SKILL.md as the package renders it. Its page says `scribe` gives it and what it costs a turn; the
   * switch, pressed by its label, loads it every turn, says a change of it changes every agent that gives it, and moves `scribe`'s version.
   * A saved edit of its description keeps the switch's line and moves the version again. In a page of its own, a save under a hand edit of
   * the file is refused as stale: the page keeps the typed words and says the file moved, and Read it again shows the file. The Agents page
   * lists the skill under your library. The page takes the skill and `scribe`'s file back, so each visit reads the store as seeded.
   */
  name: 'write-skill',
  route: '/agents',
  expect: async (page) => {
    const { seeded, made } = AGENTS;
    const library = path.join(store!, 'workflows', 'skills');
    const had = fs.readdirSync(library).sort();
    if (had.includes(SKILL.name))
      throw new Refused(`your library has no ${SKILL.name} before the page writes it — it holds ${had.join(', ')}`);
    const skillDir = path.join(library, SKILL.name);
    const skillFile = path.join(skillDir, 'SKILL.md');
    const agentFile = path.join(store!, 'workflows', 'agents', `${seeded.name}.md`);
    const was = fs.readFileSync(agentFile, 'utf8');
    const naming = was.replace(/^---\n/, `---\nskills: ${SKILL.name}\n`);
    if (naming === was) throw new Refused(`agents/${seeded.name}.md opens with its frontmatter — it holds ${JSON.stringify(was)}`);
    const clash = path.join(library, made.skill.id, 'SKILL.md');
    const clashWas = fs.readFileSync(clash, 'utf8');

    const refused = await page.context().newPage();
    try {
      const { problems } = watch(refused);
      await refused.goto(new URL('/agents/skills/new', page.url()).href, { waitUntil: 'load' });
      await idle(refused);
      const form = refused.locator('form[aria-label="New skill"]');
      await form.getByRole('textbox', { name: 'Name', exact: true }).fill(made.skill.id);
      await form.getByRole('textbox', { name: 'Description', exact: true }).fill(SKILL.description);
      await form.getByRole('textbox', { name: 'Instructions', exact: true }).fill(SKILL.body);
      const [answered] = await Promise.all([
        wrote(refused, 'POST', '/api/skills/yours'),
        form.getByRole('button', { name: 'Create skill' }).click(),
      ]);
      const { error } = (await answered.json()) as { error?: string };
      if (answered.status() !== 409 || !error) {
        throw new Refused(
          `a new skill named as one your library has is refused — the api answered ${answered.status()}: ${JSON.stringify(error)}`,
        );
      }
      const shown = await form.locator('[data-skill-refused] p.font-mono').textContent();
      if (shown !== error)
        throw new Refused(
          `the refusal is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`,
        );
      if ((await form.getByRole('textbox', { name: 'Instructions', exact: true }).inputValue()) !== SKILL.body)
        throw new Refused('what was typed stays in the form after a refusal');
      if (fs.readFileSync(clash, 'utf8') !== clashWas)
        throw new Refused(`nothing is written on a refusal — skills/${made.skill.id}/SKILL.md changed`);
      await settled(refused);
      await photograph(refused, path.join(OUT, `write-skill-refused-${await themeOf(refused)}.png`), { fullPage: true });
      await idle(refused);
      const expected = `request answered 409: POST ${answered.url()}`;
      const seen = problems();
      const others = seen.filter(
        (p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 409\b/.test(p),
      );
      if (!seen.includes(expected) || others.length)
        throw new Refused(`the refused page saw its one refusal and nothing else — it saw:\n    ${seen.join('\n    ')}`);
    } finally {
      await refused.close();
    }

    const versionOfScribe = async (): Promise<string> => {
      const answer = await page.request.get(new URL(`/api/agents/yours/${seeded.name}`, page.url()).href);
      return ((await answer.json()) as { version: string }).version;
    };

    try {
      fs.writeFileSync(agentFile, naming);
      const unmade = await versionOfScribe();

      await page.getByRole('link', { name: 'New skill' }).click();
      await page.waitForURL((url) => url.pathname === '/agents/skills/new', { timeout: WAIT_MS });
      const form = page.locator('form[aria-label="New skill"]');
      await expectVisible(form, 'the new skill form');
      await form.getByRole('textbox', { name: 'Name', exact: true }).fill(SKILL.name);
      await form.getByRole('textbox', { name: 'Title', exact: true }).fill(SKILL.title);
      await form.getByRole('textbox', { name: 'Description', exact: true }).fill(SKILL.description);
      await form.getByRole('textbox', { name: 'Tags', exact: true }).fill(SKILL.tags.join('\n'));
      await form.getByRole('textbox', { name: 'Examples', exact: true }).fill(SKILL.examples.join('\n'));
      await form.getByRole('textbox', { name: 'Instructions', exact: true }).fill(SKILL.body);
      await settled(page);
      await photograph(page, path.join(OUT, `write-skill-new-${await themeOf(page)}.png`), { fullPage: true });

      const [created] = await Promise.all([
        wrote(page, 'POST', '/api/skills/yours'),
        form.getByRole('button', { name: 'Create skill' }).click(),
      ]);
      if (created.status() !== 201)
        throw new Refused(`the api writes the skill — it answered ${created.status()}: ${await created.text()}`);
      const written = fs.readFileSync(skillFile, 'utf8');
      const expectedFile = [
        '---',
        `name: ${SKILL.name}`,
        `title: ${SKILL.title}`,
        `description: ${SKILL.description}`,
        `tags: [ ${SKILL.tags.join(', ')} ]`,
        `examples: [ ${SKILL.examples.join(', ')} ]`,
        '---',
        SKILL.body,
      ].join('\n');
      if (written !== expectedFile)
        throw new Refused(`skills/${SKILL.name}/SKILL.md is written as the package renders it — it holds ${JSON.stringify(written)}`);

      await page.waitForURL((url) => url.pathname === `/agents/skills/yours/${SKILL.name}`, { timeout: WAIT_MS });
      await expectVisible(page.getByRole('heading', { name: SKILL.name, level: 1 }), `${SKILL.name}'s page`);
      await expectVisible(
        page.locator(`[data-skill-users] a[data-agent-link="${seeded.name}"]`),
        `it says ${seeded.name} gives it, linked`,
      );
      const preload = page.locator('[data-preload]');
      await expectVisible(
        preload.locator('[data-skill-cost]', { hasText: /^Now: named — about [\d,]+ tokens a turn/ }),
        'it says what it costs a turn, named',
      );
      await expectVisible(
        preload.locator('[data-skill-reach]', { hasText: `changes every agent that gives it, from its next run: ${seeded.name}.` }),
        'and that a change of it changes every agent that gives it',
      );
      const named = await versionOfScribe();
      if (named === unmade)
        throw new Refused(`written, the skill ${seeded.name} names moves ${seeded.name}'s version — it stayed ${named}`);

      const toggle = page.getByRole('switch', { name: /Load it every turn/ });
      await expectVisible(page.getByRole('switch', { name: /Load it every turn/, checked: false }), 'the switch is off');
      const [switched] = await Promise.all([
        wrote(page, 'PUT', `/api/skills/yours/${SKILL.name}`),
        preload.locator('label', { hasText: 'Load it every turn' }).click(),
      ]);
      if (switched.status() !== 200) throw new Refused(`the api switches it — it answered ${switched.status()}: ${await switched.text()}`);
      if (!fs.readFileSync(skillFile, 'utf8').split('\n').includes('preload: true'))
        throw new Refused(`switched on, its SKILL.md says preload: true — it holds ${JSON.stringify(fs.readFileSync(skillFile, 'utf8'))}`);
      await expectVisible(
        page.getByRole('switch', { name: /Load it every turn/, checked: true }),
        'the switch reads on, as the file now says',
      );
      await expectVisible(
        preload.locator('[data-skill-cost]', { hasText: /^Now: loaded every turn — about [\d,]+ tokens \(cached\)/ }),
        'it says it is loaded every turn, cached',
      );
      const preloaded = await versionOfScribe();
      if (preloaded === named) throw new Refused(`the switch moves the version of ${seeded.name}, which gives it — it stayed ${preloaded}`);
      await settled(page);
      await photograph(page, path.join(OUT, `write-skill-page-${await themeOf(page)}.png`), { fullPage: true });

      const edit = page.locator(`form[data-skill-form="${SKILL.name}"]`);
      await edit.getByRole('textbox', { name: 'Description', exact: true }).fill(SKILL.edited);
      if (!(await toggle.isDisabled())) throw new Refused('the switch waits while the form holds unsaved words');
      const [saved] = await Promise.all([
        wrote(page, 'PUT', `/api/skills/yours/${SKILL.name}`),
        edit.getByRole('button', { name: 'Save' }).click(),
      ]);
      if (saved.status() !== 200) throw new Refused(`the api saves the skill — it answered ${saved.status()}: ${await saved.text()}`);
      const lines = fs.readFileSync(skillFile, 'utf8').split('\n');
      for (const line of [`description: ${SKILL.edited}`, 'preload: true']) {
        if (!lines.includes(line))
          throw new Refused(`skills/${SKILL.name}/SKILL.md says ${line} — it holds ${JSON.stringify(lines.join('\n'))}`);
      }
      await expectVisible(edit.getByRole('button', { name: 'Save', disabled: true }), 'saved, Save waits again');
      await expectVisible(
        page.getByRole('switch', { name: /Load it every turn/, checked: true, disabled: false }),
        'and the switch is free again',
      );
      if ((await versionOfScribe()) === preloaded) throw new Refused(`the edit moves the version of ${seeded.name}, which gives it`);

      const stale = await page.context().newPage();
      try {
        const { problems } = watch(stale);
        await stale.goto(new URL(`/agents/skills/yours/${SKILL.name}`, page.url()).href, { waitUntil: 'load' });
        await idle(stale);
        const form = stale.locator(`form[data-skill-form="${SKILL.name}"]`);
        const description = form.getByRole('textbox', { name: 'Description', exact: true });
        await expectVisible(description, 'the skill form, in a page of its own');
        await description.fill(SKILL.stale);
        const byHand = `${fs.readFileSync(skillFile, 'utf8')}${SKILL.byHand}\n`;
        fs.writeFileSync(skillFile, byHand);
        const [answered] = await Promise.all([
          wrote(stale, 'PUT', `/api/skills/yours/${SKILL.name}`),
          form.getByRole('button', { name: 'Save' }).click(),
        ]);
        const { error } = (await answered.json()) as { error?: string };
        if (answered.status() !== 409 || !error) {
          throw new Refused(
            `a save of a skill whose file changed since it was read is refused — the api answered ${answered.status()}: ${JSON.stringify(error)}`,
          );
        }
        if (fs.readFileSync(skillFile, 'utf8') !== byHand)
          throw new Refused('nothing is written on a stale refusal — the hand edit stands');
        const moved = form.locator('[data-skill-moved]');
        await expectVisible(moved, 'read again, the page says the file changed since the form was drawn');
        await expectVisible(
          moved.getByText('What you typed stays here until you read it again'),
          'and that the unsaved words stay until it is read again',
        );
        if ((await description.inputValue()) !== SKILL.stale)
          throw new Refused(
            `the unsaved words stay after the read — the description reads ${JSON.stringify(await description.inputValue())}`,
          );
        await settled(stale);
        await photograph(stale, path.join(OUT, `write-skill-moved-${await themeOf(stale)}.png`), { fullPage: true });
        await moved.getByRole('button', { name: 'Read it again' }).click();
        await expectCount(form.locator('[data-skill-moved]'), 0, 'read again, the notice goes');
        const instructions = await form.getByRole('textbox', { name: 'Instructions', exact: true }).inputValue();
        if (!instructions.includes(SKILL.byHand))
          throw new Refused(`read again, the form shows the file as it now reads — its instructions read ${JSON.stringify(instructions)}`);
        if ((await description.inputValue()) !== SKILL.edited)
          throw new Refused(
            `read again, the typed words are dropped — the description reads ${JSON.stringify(await description.inputValue())}`,
          );
        await idle(stale);
        const expected = `request answered 409: PUT ${answered.url()}`;
        const seen = problems();
        const others = seen.filter(
          (p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 409\b/.test(p),
        );
        if (!seen.includes(expected) || others.length)
          throw new Refused(`the stale page saw its one refusal and nothing else — it saw:\n    ${seen.join('\n    ')}`);
      } finally {
        await stale.close();
      }
      await idle(page);

      await page.getByRole('link', { name: '← Agents' }).click();
      await page.waitForURL((url) => url.pathname === '/agents', { timeout: WAIT_MS });
      const mine = page.locator('section[data-skill-place="yours"]');
      await expectVisible(
        mine.locator(`[data-skill-row="${SKILL.name}"]`, { hasText: SKILL.edited }),
        `the Agents page lists ${SKILL.name} under your library, with what it does`,
      );
      await idle(page);
    } finally {
      fs.writeFileSync(agentFile, was);
      fs.rmSync(skillDir, { recursive: true, force: true });
    }
    await page.reload({ waitUntil: 'load' });
    await idle(page);
    await expectTexts(
      page.locator('section[data-skill-place="yours"] [data-skill-row]').locator('a'),
      had,
      'the page takes its skill back: your library lists what was seeded',
    );
    if (JSON.stringify(fs.readdirSync(library).sort()) !== JSON.stringify(had))
      throw new Refused(`the page takes its skill back — ${library} holds ${fs.readdirSync(library).join(', ')}`);
    await expectCount(page.locator(`[data-skill-row="${SKILL.name}"]`), 0, `${SKILL.name} is gone`);
  },
} satisfies PageSpec;
