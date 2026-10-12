import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { FOLDER_SKILLS, folderSkill, folderSkillsPaths, writeFolderSkills } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

const goto = async (page: Page, to: string): Promise<void> => {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
};

/** A picture of `what`, named for this page, in the theme it is visited in. */
const picture = async (page: Page, target: Page | Locator, what: string): Promise<void> => {
  await settled(page);
  await photograph(target, path.join(OUT, `folder-skills-${what}-${await themeOf(page)}.png`));
};

/** Refuses unless the page links no skill named with its folder to a skill's page, which would be refused. */
async function expectNoPage(page: Page, where: string): Promise<void> {
  await expectCount(
    page.locator('a[href*="/agents/skills/"][href*=":"], a[href*="/agents/skills/"][href*="%3A" i]'),
    0,
    `${where} links no skill named with its folder to a page`,
  );
}

/** Refuses unless the chip of `skill` under `layer` reads as its line writes it, the repository's, with the folder it was found in. */
async function expectChip(told: Locator, layer: string, skill: { id: string }): Promise<void> {
  const { written, foundIn } = folderSkill(skill);
  const chip = told.locator(`[data-layer="${layer}"] [data-skill="${written}"]`);
  await expectVisible(chip, `${written}, under the ${layer} layer`);
  const text = (await chip.textContent())?.trim();
  if (text !== `${written} · this repository`) throw new Refused(`the chip reads ${written} · this repository — it reads ${text}`);
  await expectCount(chip.locator(`[data-skill-found-in="${foundIn}"][title="${foundIn}"]`), 1, `and holds where it was found, ${foundIn}`);
  await expectCount(chip.locator('a'), 0, 'with no link');
}

/** The step's page of yours: each skill named with its folder is a chip as written, found, under the layer that gives it. */
async function expectStep(page: Page): Promise<void> {
  const { workflow, step, agentSkill, stepSkill } = FOLDER_SKILLS;
  await goto(page, `/workflows/yours/${workflow}/${step}`);
  const told = page.locator('details[data-will-be-told]');
  await expectChip(told, 'instructions', agentSkill);
  await expectChip(told, 'policy', stepSkill);
  await expectCount(told.locator('[data-skill]'), 2, 'each skill once');
  await expectNoPage(page, "the step's page");
}

/** The agent's page: the skill's row as written, the repository's, read from its folder, described, unlinked; and not in the picker. */
async function expectAgent(page: Page): Promise<void> {
  const { agent, agentSkill } = FOLDER_SKILLS;
  const { written, foundIn } = folderSkill(agentSkill);
  await goto(page, `/agents/yours/${agent}`);
  const form = page.locator(`form[data-agent-form="${agent}"]`);
  const row = form.locator(`[data-given-skill="${written}"]`);
  await expectVisible(row.locator('[data-skill-from="folder"]', { hasText: 'this repository' }), `${written} is the repository's`);
  await expectVisible(row.locator('[data-found-in]', { hasText: `Read from ${foundIn}` }), `read from ${foundIn}`);
  await expectVisible(row.getByText(agentSkill.description, { exact: true }), 'with what it is for');
  await expectVisible(row.getByText(written, { exact: true }), 'named as its line writes it');
  await expectCount(row.locator('a, [data-given-error]'), 0, 'no link, and no refusal');
  await expectNoPage(page, "the agent's page");
  await form.getByRole('button', { name: 'Add a skill' }).click();
  const sheet = page.getByRole('dialog', { name: 'Add a skill' });
  await expectVisible(sheet.locator(`[data-offered-skill="${FOLDER_SKILLS.inside.id}"]`), 'the sheet lists the skills of the places');
  await expectCount(sheet.locator('[data-offered-skill*=":"]'), 0, 'and offers no skill named with its folder');
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  await expectCount(sheet, 0, 'the sheet closes');
}

/** A save from the builder, another key of the step changed: the file's `skills:` line is as it was written, and the chip still found. */
async function expectSave(page: Page): Promise<void> {
  const { workflow, step, stepSkill } = FOLDER_SKILLS;
  const line = `skills: ${folderSkill(stepSkill).written}`;
  await goto(page, `/workflows/yours/${workflow}?build=true`);
  const builder = page.locator(`section[data-builder="${workflow}"]`);
  const keys = builder.locator(`[data-step-form="${step}"]`);
  await expectVisible(keys, `${step}'s form, open as the builder opens`);
  await keys.locator('[data-field="check"] input').fill('npm test');
  const [saved] = await Promise.all([
    page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/workflows/yours/${workflow}`, {
      timeout: WAIT_MS,
    }),
    builder.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  if (saved.status() !== 200) throw new Refused(`the api saves the folder — it answered ${saved.status()}: ${await saved.text()}`);
  await expectVisible(builder.locator('span', { hasText: /^Saved$/ }), 'once saved, nothing is unsaved');
  const written = fs.readFileSync(path.join(store!, 'workflows', workflow, `${step}.md`), 'utf8').split('\n');
  for (const said of [line, 'check: npm test'])
    if (!written.includes(said)) throw new Refused(`${step}.md says ${said} — it holds ${JSON.stringify(written)}`);
}

/** The repository's skills that are links: one that stays inside reads, with its page; one that leaves is refused, in its words. */
async function expectLinks(page: Page): Promise<void> {
  const { inside, apart } = FOLDER_SKILLS;
  await goto(page, '/agents');
  const theirs = page.locator('section[data-skill-place="repo"]');
  await expectVisible(theirs.locator(`[data-skill-row="${inside.id}"]`, { hasText: inside.description }), `${inside.id} reads`);
  await expectVisible(theirs.locator(`[data-skill-row="${apart.id}"]`, { hasText: 'does not read' }), `${apart.id} does not`);
  await picture(page, theirs, 'linked');
  await theirs.locator(`[data-skill-row="${inside.id}"] a`).click();
  await idle(page);
  await expectVisible(page.getByRole('heading', { level: 1, name: inside.id, exact: true }), `${inside.id}'s page`);
  await expectVisible(page.locator('[data-skill-from="repo"]'), "the repository's");
  await expectVisible(page.getByText(inside.description, { exact: false }).first(), 'with what it is for');
  await expectCount(page.locator('[data-skill-error]'), 0, 'and no refusal');
  await goto(page, `/agents/skills/repo/${apart.id}`);
  await expectVisible(
    page.locator('[data-skill-error]', {
      hasText: `${apart.id} is a link, and what it points at is outside the folder of skills: make it a folder of its own.`,
    }),
    `${apart.id}'s page says the refusal, in its words`,
  );
  await expectCount(page.getByText(apart.description, { exact: false }), 0, 'and reads nothing of what it points at');
  await picture(page, page, 'refused');
}

export default {
  /**
   * A skill named with its folder, and a skill of the repository's that is a link. The page writes a folder of the checkout with two
   * skills of its own, an agent of yours that gives one and a workflow of yours whose step adds the other, each named `folder:name`:
   * the step's page draws each as a chip as its line writes it, the repository's, holding the folder it was found in, and the agent's
   * page as a row that says the folder it is read from — neither linked, since such a skill has no page, and the picker offers none.
   * A save from the builder that changes another key writes the `skills:` line back as it was, and the step's page still finds it. Of
   * the repository's own skills, the one linked to a folder inside the checkout lists and reads on its page; the one linked outside
   * lists as not reading, and its page says the refusal. Every request is answered: no page here is refused. The page takes back all
   * it wrote, so each visit, in either theme, reads the store as seeded.
   */
  name: 'folder-skills',
  route: '/agents',
  expect: async (page) => {
    try {
      writeFolderSkills(store!);
      await expectStep(page);
      await picture(page, page.locator('details[data-will-be-told]'), 'step');
      await expectAgent(page);
      await picture(page, page.locator(`form[data-agent-form="${FOLDER_SKILLS.agent}"] [data-given-skills]`), 'agent');
      await expectSave(page);
      await expectStep(page);
      await expectLinks(page);
    } finally {
      for (const at of folderSkillsPaths(store!)) fs.rmSync(at, { recursive: true, force: true });
    }
    await goto(page, '/agents');
    await expectCount(page.locator(`[data-skill-row="${FOLDER_SKILLS.inside.id}"]`), 0, 'the store is as seeded again');
  },
} satisfies PageSpec;
