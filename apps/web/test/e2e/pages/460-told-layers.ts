import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled } from '../checks.ts';
import { FOLDER } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The run the page writes, its steps not filed, and the words each layer of `write` was frozen with. */
const LAYERED = {
  id: 'told-by-layer-e2e46',
  agent: 'writer',
  instructions: 'You are the writer: you write short notes, plainly.',
  custom: 'Be terse. Never more than a page.',
  policy: 'Write a short note on what was asked.',
  agentSkill: 'plain-words',
  addedSkill: 'cite-sources',
  deny: 'WebFetch',
  review: 'Read the note, and say whether it holds up.',
  brief: 'Told by layer\n\nA run written by the told-layers page: a step whose agent, person and policy each told it something.',
} as const;

const goto = async (page: Page, to: string): Promise<void> => {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
};

/**
 * Writes LAYERED's record into the e2e's store, as `wf start` freezes it: `write`, hired from `writer` with the person's custom
 * instructions and one skill of its own, its line adding another and a deny; and `review`, with no agent. Neither is filed, so each says
 * what it would be told now.
 */
function written(): string {
  const record = path.join(store!, 'runs', `${LAYERED.id}.json`);
  const work = path.join(store!, 'runs', LAYERED.id, 'work');
  fs.mkdirSync(work, { recursive: true });
  const write = {
    name: 'write',
    after: [],
    body: [LAYERED.instructions, LAYERED.custom, LAYERED.policy].join('\n\n'),
    harness: 'claude',
    workspace: 'folder',
    permissionMode: 'dontAsk',
    skills: [LAYERED.addedSkill],
    disallowedTools: [LAYERED.deny],
    agent: {
      name: LAYERED.agent,
      keys: ['skills', 'disallowedTools'],
      body: LAYERED.policy,
      given: {},
      instructions: LAYERED.instructions,
      customInstructions: LAYERED.custom,
      skills: [LAYERED.agentSkill, LAYERED.addedSkill],
      addedSkills: [LAYERED.addedSkill],
    },
  };
  const review = {
    name: 'review',
    after: ['write'],
    body: LAYERED.review,
    harness: 'claude',
    workspace: 'folder',
    permissionMode: 'dontAsk',
  };
  const run = {
    id: LAYERED.id,
    place: { kind: 'folder' },
    workspace: work,
    brief: LAYERED.brief,
    workflowDir: path.join(store!, FOLDER.workflow),
    workflow: [write, review],
    createdAt: new Date().toISOString(),
    steps: { write: { taskId: null }, review: { taskId: null } },
  };
  fs.writeFileSync(record, JSON.stringify(run, null, 2));
  return record;
}

/** The section of the run page for `step`, under its heading. */
const sectionOf = (page: Page, step: string) =>
  page.locator('article > section', { has: page.getByRole('heading', { level: 2, name: step, exact: true }) });

export default {
  /**
   * What a step was told, by layer, from what its run froze. `write`'s fold, opened, draws the agent's instructions with its skill, the
   * person's custom instructions, the step's policy with the skill and the deny its line adds, and the task, in that order, each once, and
   * says the first two went into the session's system prompt; `review`, with no agent, says its own words are all it was told. The page
   * writes its run and takes it back, so each visit reads the store as seeded.
   */
  name: 'told-layers',
  route: `/runs/${FOLDER.id}`,
  expect: async (page) => {
    const record = written();
    try {
      await goto(page, `/runs/${LAYERED.id}`);
      const write = sectionOf(page, 'write');
      const fold = write.locator('details[data-told]');
      await expectVisible(fold.locator('summary', { hasText: 'What it would be told now' }), "write's fold: a step not filed yet");
      await fold.locator('summary').click();
      const layers = ['instructions', 'custom', 'policy', 'task'];
      await expectCount(fold.locator('[data-layer]'), layers.length, 'four layers');
      const drawn = await fold.locator('[data-layer]').evaluateAll((all) => all.map((el) => el.getAttribute('data-layer')));
      if (drawn.join() !== layers.join()) throw new Refused(`the layers are drawn ${layers.join(', ')} — they are ${drawn.join(', ')}`);
      const words: Array<[string, string]> = [
        ['instructions', LAYERED.instructions],
        ['custom', LAYERED.custom],
        ['policy', LAYERED.policy],
        ['task', 'What was asked for'],
      ];
      for (const [layer, said] of words)
        await expectVisible(
          fold.locator(`[data-layer="${layer}"] pre`, { hasText: said }),
          `the ${layer} layer says ${JSON.stringify(said)}`,
        );
      await expectVisible(fold.locator('[data-layer="instructions"] h4', { hasText: `Instructions — ${LAYERED.agent}'s` }), 'whose words');
      await expectVisible(
        fold.locator(`[data-layer="instructions"] [data-skill="${LAYERED.agentSkill}"]`),
        "the agent's skill under its instructions",
      );
      await expectVisible(fold.locator(`[data-layer="policy"] [data-skill="${LAYERED.addedSkill}"]`), "the step's skill under its policy");
      await expectCount(fold.locator('[data-skill]'), 2, 'each skill once, under the layer that gives it');
      await expectCount(
        fold.locator('[data-layer="policy"] [data-fence="disallowedTools"]', { hasText: LAYERED.deny }),
        1,
        "the deny its line adds, under its policy as a tightening of the agent's fence",
      );
      await expectCount(fold.locator('[data-fence]'), 1, 'and under no other layer');
      await expectCount(fold.getByText(LAYERED.policy), 1, 'the policy once: the brief is not drawn whole beside the layers');
      await expectVisible(fold.getByText("in the session's system prompt", { exact: false }), 'where the first two went');

      const review = sectionOf(page, 'review').locator('details[data-told]');
      await review.locator('summary').click();
      await expectVisible(review.getByText('No agent: its own words are all it was told', { exact: false }), 'review has no agent');
      await expectCount(review.locator('[data-layer="instructions"], [data-layer="custom"]'), 0, "and so no agent's layer");
      await settled(page);
      await photograph(write, path.join(OUT, `told-layers-open-${await themeOf(page)}.png`));
      await goto(page, `/runs/${FOLDER.id}`);
    } finally {
      fs.rmSync(record, { force: true });
      fs.rmSync(path.join(store!, 'runs', LAYERED.id), { recursive: true, force: true });
    }
  },
} satisfies PageSpec;
