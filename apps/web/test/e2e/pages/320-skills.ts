import fs from 'node:fs';
import path from 'node:path';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { AGENTS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  /**
   * An agent of yours composes its skills from a list, and Claude Code's prompt from what it does. `scribe`, which gives none, first names
   * a skill no place has, as one copied from elsewhere would before its folder came, so its row reads not found; the file is put back. Its
   * description is edited and left unsaved. The sheet lists your library, this repository's and Nemia's in that order, the repository's
   * `scratch` refused with its reason and nothing to press, and Nemia's saying none: none is built in. A skill of your library is added
   * from the sheet's first group, a change of the form alone: nothing is written until Save, and the edit is kept. Its tools, which leave
   * out Skill, are put right from the note that says so, and Doesn't write code is picked, with Only my instructions behind For experts.
   * Saved, the file gives the skill and says harnessPrompt: no-coding. The page takes the agent back, so each visit, in either theme, reads
   * the store as seeded.
   */
  name: 'skills',
  route: `/agents/yours/${AGENTS.seeded.name}`,
  expect: async (page) => {
    const { seeded, made } = AGENTS;
    const library = path.join(store!, 'workflows', 'skills');
    const agentFile = path.join(store!, 'workflows', 'agents', `${seeded.name}.md`);
    const had = fs.readdirSync(library).sort();
    const mine = made.skill.id;
    if (!had.includes(mine)) throw new Refused(`your library holds ${mine}, as seeded — it holds ${had.join(', ')}`);
    const nowhere = 'pass-a-note';
    const was = fs.readFileSync(agentFile, 'utf8');
    const naming = was.replace(/^---\n/, `---\nskills: ${nowhere}\n`);
    const drafted = 'Use this when a change needs its notes written, drafted and not yet saved.';

    const form = page.locator(`form[data-agent-form="${seeded.name}"]`);
    await expectVisible(form, `${seeded.name}'s form`);
    try {
      if (naming === was) throw new Refused(`agents/${seeded.name}.md opens with its frontmatter — it holds ${JSON.stringify(was)}`);
      fs.writeFileSync(agentFile, naming);
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      await expectVisible(
        form.locator(`[data-given-skill="${nowhere}"] [data-given-error]`, { hasText: 'No skills folder has' }),
        `${nowhere}, named and found nowhere an agent of yours looks, is said not found`,
      );
      fs.writeFileSync(agentFile, was);
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      await expectVisible(form.locator('[data-given-none]'), `${seeded.name} gives no skills once its file is put back`);

      const description = form.getByRole('textbox', { name: 'Description', exact: true });
      await description.fill(drafted);

      const prompt = form.getByRole('radiogroup', { name: "Claude Code's prompt" });
      await expectVisible(
        prompt.getByRole('radio', { name: /^Works on code or files/, checked: true }),
        "unset, Claude Code's prompt reads as keep: Works on code or files",
      );
      await expectCount(
        prompt.getByRole('radio', { name: /^Only my instructions/ }),
        0,
        'Only my instructions is not drawn while For experts is shut',
      );
      await prompt.getByRole('button', { name: /For experts/ }).click();
      await expectVisible(prompt.getByRole('radio', { name: /^Only my instructions/ }), 'For experts opens on it');
      await expectVisible(
        prompt.getByText("Drops Claude Code's own, its safety rules with them — only when a person asks for it."),
        'and it says what it drops',
      );

      await form.getByRole('button', { name: 'Add a skill' }).click();
      const sheet = page.getByRole('dialog', { name: 'Add a skill' });
      await expectTexts(
        sheet.locator('section[data-skill-place] h3'),
        ['Your library', 'This repository', 'Built into Nemia'],
        'the sheet lists your library, this repository and what is built into Nemia, in the order an agent of yours finds a name',
      );
      const scratch = sheet.locator('section[aria-label="This repository"] [data-offered-skill="scratch"]');
      await expectVisible(
        scratch.locator('[data-offer-refused]', { hasText: 'has no frontmatter' }),
        "the repository's scratch is listed, refused with its reason",
      );
      await expectCount(scratch.getByRole('button'), 0, 'and nothing to press');
      await expectVisible(
        sheet.locator('section[aria-label="Built into Nemia"]', { hasText: 'None here.' }),
        'no skill is built into Nemia, and its group says so',
      );
      const offered = sheet.locator(`section[aria-label="Your library"] [data-offered-skill="${mine}"]`);
      await expectVisible(offered.locator('p', { hasText: /tokens/ }), `${mine} says what it costs a turn`);
      await settled(page);
      await photograph(page, path.join(OUT, `skills-sheet-${await themeOf(page)}.png`));

      await offered.getByRole('button', { name: `Add ${mine}` }).click();
      await expectVisible(offered, `${mine} is still listed`);
      await expectCount(offered.getByRole('button'), 0, `${mine} is given now, and offers nothing to press`);
      if (fs.readFileSync(agentFile, 'utf8') !== was)
        throw new Refused(`adding a skill writes nothing: agents/${seeded.name}.md is as it was until Save`);
      await sheet.getByRole('button', { name: 'Close', exact: true }).click();
      await expectCount(sheet, 0, 'the sheet closes');
      if ((await description.inputValue()) !== drafted)
        throw new Refused(
          `the description edited before the skill was added is kept — it reads ${JSON.stringify(await description.inputValue())}`,
        );

      const given = form.locator(`[data-given-skill="${mine}"]`);
      await expectVisible(given.locator('[data-skill-from="yours"]'), `${mine} is given, from your library`);
      await expectVisible(given.locator('[data-skill-cost]', { hasText: /tokens/ }), 'with what it costs a turn');

      await form.getByRole('textbox', { name: 'Tools', exact: true }).fill('Read');
      const note = form.locator('[data-skill-tool-note]');
      await expectVisible(note, 'tools that leave out Skill are said before a save is refused for them');
      await note.getByRole('button', { name: 'Add Skill to its tools' }).click();
      if ((await form.getByRole('textbox', { name: 'Tools', exact: true }).inputValue()) !== 'Read, Skill')
        throw new Refused('one press adds Skill to its tools');
      await expectCount(note, 0, 'and the note goes');

      await prompt.locator('[data-harness-prompt="no-coding"]').click();
      await expectVisible(
        prompt.getByRole('radio', { name: /^Doesn't write code/, checked: true }),
        "Doesn't write code is chosen, pressed by its label",
      );
      await settled(page);
      await photograph(page, path.join(OUT, `skills-composed-${await themeOf(page)}.png`), { fullPage: true });

      const [saved] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/agents/yours/${seeded.name}`, {
          timeout: WAIT_MS,
        }),
        form.getByRole('button', { name: 'Save' }).click(),
      ]);
      if (saved.status() !== 200) throw new Refused(`the api saves the agent — it answered ${saved.status()}: ${await saved.text()}`);
      const written = fs.readFileSync(agentFile, 'utf8');
      for (const line of [
        `skills: ${mine}`,
        'harnessPrompt: no-coding',
        'claude:',
        '  fence:',
        '    tools: Read, Skill',
        `description: ${drafted}`,
      ]) {
        if (!written.split('\n').includes(line))
          throw new Refused(`agents/${seeded.name}.md says ${line} — it holds ${JSON.stringify(written)}`);
      }
      await expectVisible(form.locator(`[data-card] [data-agent-skill="${mine}"]`), `saved, its card is generated from ${mine}`);
      await expectVisible(form.getByRole('button', { name: 'Save', disabled: true }), 'and Save waits again');
    } finally {
      fs.writeFileSync(agentFile, was);
    }
    await page.reload({ waitUntil: 'load' });
    await idle(page);
    await expectVisible(form.locator('[data-given-none]'), `${seeded.name} gives no skills again`);
    if (JSON.stringify(fs.readdirSync(library).sort()) !== JSON.stringify(had))
      throw new Refused(`the page writes nothing into your library — ${library} holds ${fs.readdirSync(library).join(', ')}`);
  },
} satisfies PageSpec;
