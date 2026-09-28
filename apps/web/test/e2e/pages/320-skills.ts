import fs from 'node:fs';
import path from 'node:path';
import { themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { AGENTS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, REPO, store } from '../world.ts';

/** Every file under `dir`, by its path in it, with what it holds: what a copy is held to, byte for byte. */
function tree(dir: string): Array<[string, string]> {
  return (fs.readdirSync(dir, { recursive: true, withFileTypes: true }) as fs.Dirent[])
    .filter((entry) => entry.isFile())
    .map((entry): [string, string] => [
      path.relative(dir, path.join(entry.parentPath, entry.name)),
      fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8'),
    ])
    .sort(([a], [b]) => a.localeCompare(b));
}

export default {
  // An agent of yours composes its skills from a list, and its system prompt from what it does. `scribe`, which gives none, is given a skill
  // HKB ships — the first on disk your library and the repository do not have — copied into your library from the sheet's third group, the
  // copy a write of its own, on disk byte for byte before any save; its tools, which leave out Skill, put right from the note that says so;
  // and `Doesn't write code` picked, with Only my instructions behind For experts. The sheet lists your library, this repository's and HKB's in
  // that order, the repository's `scratch` refused with its reason and nothing to press. Saved, the file gives the skill and says
  // `systemPrompt: no-coding`. The agent and the copy are both taken back, so the next visit, in either theme, reads the store as seeded.
  // Before the sheet opens, `scribe`'s file is made to name that skill already — as one copied from a repository would — so its row reads
  // not found, and its description is edited and left unsaved: the copy moves the agent's version (it digests the skills its file names),
  // and the form keeps the edit and the sheet stays open, and the save sends the version the copy moved to and is not refused as stale.
  name: 'skills',
  route: `/agents/yours/${AGENTS.seeded.name}`,
  expect: async (page) => {
    const { seeded } = AGENTS;
    const shippedDir = path.join(REPO, 'workflows', 'skills');
    const library = path.join(store!, 'workflows', 'skills');
    const agentFile = path.join(store!, 'workflows', 'agents', `${seeded.name}.md`);
    const had = fs.readdirSync(library).sort();
    const repoHas = fs.readdirSync(path.join(store!, 'checkout', '.claude', 'skills'));
    const shipped = fs
      .readdirSync(shippedDir)
      .sort()
      .find((name) => !had.includes(name) && !repoHas.includes(name));
    if (!shipped)
      throw new Refused(
        `HKB ships a skill neither your library nor the repository has — ${shippedDir} holds ${fs.readdirSync(shippedDir).join(', ')}`,
      );
    const copied = path.join(library, shipped);
    const was = fs.readFileSync(agentFile, 'utf8');
    const naming = was.replace(/^---\n/, `---\nskills: ${shipped}\n`);
    const drafted = 'Use this when a change needs its notes written, drafted and not yet saved.';

    const form = page.locator(`form[data-agent-form="${seeded.name}"]`);
    await expectVisible(form, `${seeded.name}'s form`);
    try {
      // Its file names the shipped skill already, found nowhere an agent of yours looks: its row says so.
      if (naming === was) throw new Refused(`agents/${seeded.name}.md opens with its frontmatter — it holds ${JSON.stringify(was)}`);
      fs.writeFileSync(agentFile, naming);
      await page.reload({ waitUntil: 'load' });
      await idle(page);
      await expectVisible(
        form.locator(`[data-given-skill="${shipped}"] [data-given-error]`, { hasText: 'No skills folder has' }),
        `${shipped}, named and found nowhere, is said not found`,
      );
      const description = form.getByRole('textbox', { name: 'Description', exact: true });
      await description.fill(drafted);

      // The system prompt, unset: drawn as the default, with the choice that drops the safety rules folded away.
      const prompt = form.getByRole('radiogroup', { name: 'System prompt' });
      await expectVisible(
        prompt.getByRole('radio', { name: /^Works on code or files/, checked: true }),
        'unset, the system prompt reads as the default: Works on code or files',
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

      // The sheet: three groups, in the order an agent of yours finds a name, the shipped last.
      await form.getByRole('button', { name: 'Add a skill' }).click();
      const sheet = page.getByRole('dialog', { name: 'Add a skill' });
      await expectTexts(
        sheet.locator('section[data-skill-place] h3'),
        ['Your library', 'This repository', 'Shipped with HKB'],
        'the sheet lists your library, this repository and what HKB ships, in that order',
      );
      const scratch = sheet.locator('section[aria-label="This repository"] [data-offered-skill="scratch"]');
      await expectVisible(
        scratch.locator('[data-offer-refused]', { hasText: 'has no frontmatter' }),
        "the repository's scratch is listed, refused with its reason",
      );
      await expectCount(scratch.getByRole('button'), 0, 'and nothing to press');
      await expectVisible(
        sheet.locator('[data-copy-note]', { hasText: 'a write of its own' }),
        'the shipped group says a copy is a write of its own',
      );
      const offered = sheet.locator(`section[aria-label="Shipped with HKB"] [data-offered-skill="${shipped}"]`);
      await expectVisible(offered.locator('p', { hasText: /tokens/ }), `${shipped} says what it costs a turn`);
      await settled(page);
      await page.screenshot({ path: path.join(OUT, `skills-sheet-${await themeOf(page)}.png`) });

      // Copied and added: the folder is in your library at once, byte for byte, before any save.
      const [answered] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/skills/yours', {
          timeout: WAIT_MS,
        }),
        offered.getByRole('button', { name: `Copy ${shipped} to my library and add` }).click(),
      ]);
      if (answered.status() !== 201)
        throw new Refused(`the api copies the skill — it answered ${answered.status()}: ${await answered.text()}`);
      if (JSON.stringify(tree(copied)) !== JSON.stringify(tree(path.join(shippedDir, shipped))))
        throw new Refused(`skills/${shipped} is copied into your library byte for byte`);
      await expectVisible(
        offered.locator('[data-skill-from="yours"]'),
        `the shipped ${shipped} now says it is in your library, and offers no second copy`,
      );
      await expectCount(offered.getByRole('button'), 0, 'nothing to press on it');
      await expectVisible(
        sheet.locator(`section[aria-label="Your library"] [data-offered-skill="${shipped}"]`, { hasText: 'given' }),
        'and your library lists it, given',
      );
      if (fs.readFileSync(agentFile, 'utf8') !== naming)
        throw new Refused(`the copy writes no agent: agents/${seeded.name}.md is as it was until Save`);
      await expectVisible(
        sheet.getByRole('heading', { name: 'Add a skill' }),
        "the copy moved the agent's version, and the sheet stays open",
      );
      await sheet.getByRole('button', { name: 'Close', exact: true }).click();
      await expectCount(sheet, 0, 'the sheet closes');
      if ((await description.inputValue()) !== drafted)
        throw new Refused(`the description edited before the copy is kept — it reads ${JSON.stringify(await description.inputValue())}`);
      await expectCount(form.locator(`[data-given-skill="${shipped}"] [data-given-error]`), 0, `${shipped} is found now`);

      const given = form.locator(`[data-given-skill="${shipped}"]`);
      await expectVisible(given.locator('[data-skill-from="yours"]'), `${shipped} is given, from your library`);
      await expectVisible(given.locator('[data-skill-cost]', { hasText: /tokens/ }), 'with what it costs a turn');

      // Its tools leave out Skill: said before the save is refused, and put right with one press.
      await form.getByRole('textbox', { name: 'Tools', exact: true }).fill('Read');
      const note = form.locator('[data-skill-tool-note]');
      await expectVisible(note, 'tools that leave out Skill are said');
      await note.getByRole('button', { name: 'Add Skill to its tools' }).click();
      if ((await form.getByRole('textbox', { name: 'Tools', exact: true }).inputValue()) !== 'Read, Skill')
        throw new Refused('one press adds Skill to its tools');
      await expectCount(note, 0, 'and the note goes');

      // Doesn't write code, pressed by its label, as a React Aria radio is.
      await prompt.locator('[data-system-prompt="no-coding"]').click();
      await expectVisible(prompt.getByRole('radio', { name: /^Doesn't write code/, checked: true }), "Doesn't write code is chosen");
      await settled(page);
      await page.screenshot({ path: path.join(OUT, `skills-composed-${await themeOf(page)}.png`), fullPage: true });

      const [saved] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/agents/yours/${seeded.name}`, {
          timeout: WAIT_MS,
        }),
        form.getByRole('button', { name: 'Save' }).click(),
      ]);
      if (saved.status() !== 200) throw new Refused(`the api saves the agent — it answered ${saved.status()}: ${await saved.text()}`);
      const written = fs.readFileSync(agentFile, 'utf8');
      for (const line of [`skills: ${shipped}`, 'systemPrompt: no-coding', 'tools: Read, Skill', `description: ${drafted}`]) {
        if (!written.split('\n').includes(line))
          throw new Refused(`agents/${seeded.name}.md says ${line} — it holds ${JSON.stringify(written)}`);
      }
      await expectVisible(form.locator(`[data-card] [data-agent-skill="${shipped}"]`), `saved, its card is generated from ${shipped}`);
      await expectVisible(form.getByRole('button', { name: 'Save', disabled: true }), 'and Save waits again');
    } finally {
      fs.writeFileSync(agentFile, was);
      fs.rmSync(copied, { recursive: true, force: true });
    }
    await page.reload({ waitUntil: 'load' });
    await idle(page);
    await expectVisible(form.locator('[data-given-none]'), `${seeded.name} gives no skills again`);
    if (JSON.stringify(fs.readdirSync(library).sort()) !== JSON.stringify(had))
      throw new Refused(`the page takes the copy back — ${library} holds ${fs.readdirSync(library).join(', ')}`);
  },
} satisfies PageSpec;
