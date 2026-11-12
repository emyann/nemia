import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled } from '../checks.ts';
import { AGENTS, checkoutIn, FACTORIES, FOLDER_SKILLS, folderSkill, folderSkillsPaths, writeFolderSkills } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The checkout is read in FACTORIES' `hiring`, the one factory on it: the default factory works on no repository. */
const IN = `?factory=${FACTORIES.hiring.name}`;

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
  await goto(page, `/workflows/yours/${workflow}/${step}${IN}`);
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
  await goto(page, `/agents/yours/${agent}${IN}`);
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
  await expectVisible(sheet.locator(`[data-offered-skill="${AGENTS.made.skill.id}"]`), 'the sheet lists the skills of the places');
  await expectCount(sheet.locator('[data-offered-skill*=":"]'), 0, 'and offers no skill named with its folder');
  await sheet.getByRole('button', { name: 'Close', exact: true }).click();
  await expectCount(sheet, 0, 'the sheet closes');
}

/**
 * The workflow of yours read in the default factory, which works on no repository: a skill named with a repository's folder is read from
 * none there, so the folder does not read and offers no builder, its refusal naming the repository it needs. (The builder writes a folder
 * of yours in the default factory alone: a save that keeps such a `skills:` line as written waits on the api reading one there.)
 */
async function expectNoBuilder(page: Page): Promise<void> {
  const { workflow } = FOLDER_SKILLS;
  await goto(page, `/workflows/yours/${workflow}?build=true`);
  await expectCount(page.locator(`section[data-builder="${workflow}"]`), 0, 'in the default factory, no builder opens');
  await expectVisible(page.locator('[data-no-builder]'), 'and the page says why');
  await expectVisible(page.getByText(/read with no repository/), 'the folder not reading, a skill named with its folder needing one');
}

/**
 * The repository's skills that are links, read in FACTORIES' `hiring`: one that stays inside reads, with its page; one that leaves is
 * refused, in its words. The Agents page, in the default factory, lists no skill of a repository's.
 */
async function expectLinks(page: Page): Promise<void> {
  const { inside, apart } = FOLDER_SKILLS;
  await goto(page, '/agents');
  await expectCount(page.locator('section[data-skill-place="repo"]'), 0, "the Agents page lists no repository's skills");
  await expectCount(page.locator(`[data-skill-row="${inside.id}"], [data-skill-row="${apart.id}"]`), 0, 'nor either link');
  await goto(page, `/agents/skills/repo/${inside.id}${IN}`);
  await expectVisible(page.getByRole('heading', { level: 1, name: inside.id, exact: true }), `${inside.id}'s page`);
  await expectVisible(page.locator('[data-skill-from="repo"]'), "the repository's");
  await expectVisible(page.getByText(inside.description, { exact: false }).first(), 'with what it is for');
  await expectCount(page.locator('[data-skill-error]'), 0, 'and no refusal');
  await goto(page, `/agents/skills/repo/${apart.id}${IN}`);
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
   * A skill named with its folder, and a skill of the repository's that is a link. The page writes a folder of the checkout with two skills
   * of its own, an agent of yours that gives one and a workflow of yours whose step adds the other, each named `folder:name`: read in
   * FACTORIES' `hiring`, the factory on the checkout, made to offer that workflow and taken back after (the default factory reading no
   * repository), the step's page draws each as a chip as its line writes it, the repository's, holding the folder it was found in, and the
   * agent's page as a row that says the folder it is read from — neither linked, since such a skill has no page, and the picker offers
   * none. In the default factory the workflow does not read, a skill named with its folder needing a repository, and offers no builder. Of
   * the repository's own skills, read in `hiring` and listed by no page of the default factory, the one linked to a folder inside the
   * checkout reads on its page; the one linked outside does not, and its page says the refusal. Every request is answered: no page here is
   * refused. The page takes back all it wrote, so each visit, in either theme, reads the store as seeded.
   */
  name: 'folder-skills',
  route: '/agents',
  expect: async (page) => {
    const takeBack = checkoutIn(store!, [FOLDER_SKILLS.workflow]);
    try {
      writeFolderSkills(store!);
      await expectStep(page);
      await picture(page, page.locator('details[data-will-be-told]'), 'step');
      await expectAgent(page);
      await picture(page, page.locator(`form[data-agent-form="${FOLDER_SKILLS.agent}"] [data-given-skills]`), 'agent');
      await expectNoBuilder(page);
      await expectStep(page);
      await expectLinks(page);
    } finally {
      for (const at of folderSkillsPaths(store!)) fs.rmSync(at, { recursive: true, force: true });
      takeBack();
    }
    await goto(page, '/agents');
    await expectCount(page.locator(`[data-skill-row="${FOLDER_SKILLS.inside.id}"]`), 0, 'the store is as seeded again');
  },
} satisfies PageSpec;
