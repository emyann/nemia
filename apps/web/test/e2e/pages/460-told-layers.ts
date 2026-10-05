import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
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
  policy:
    'Write a short note on what was asked, and keep it **plain**:\n\n- one point a line\n- no jargon\n\nSay what changed and why, in two short\nsentences that read as one paragraph.',
  /** The policy's first words, as a person reads them drawn: its marks gone. */
  policySays: 'Write a short note on what was asked, and keep it plain:',
  agentSkill: 'plain-words',
  addedSkill: 'cite-sources',
  deny: 'WebFetch',
  review: 'Read the note, and say whether it holds up.',
  brief: `Told by layer\n\nA run written by the told-layers page: a step whose agent, person and policy each told it something.\n\n\`\`\`\nconst line = '${'a line that is longer than any panel, '.repeat(8)}';\n\`\`\``,
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

/**
 * Refuses unless the open fold `fold` draws its layers as the markdown they are: the policy's bold and list drawn, no mark printed, its
 * hard-wrapped paragraph laid out as one; and the brief's long code line scrolling inside its block, the task's layer no wider than itself.
 */
async function expectMarkdown(page: Page, fold: Locator): Promise<void> {
  const policy = fold.locator('[data-layer="policy"] [data-markdown]');
  await expectVisible(policy.locator('strong', { hasText: 'plain' }), "the policy's bold, drawn bold");
  await expectCount(policy.locator('li'), 2, "the policy's list, drawn as one");
  await expectCount(policy.getByText('**', { exact: false }), 0, 'no mark printed as it is written');
  const wrapped = policy.locator('p', { hasText: 'Say what changed and why, in two short sentences that read as one paragraph.' });
  await expectCount(wrapped, 1, "the policy's two source lines, one paragraph");
  const space = await wrapped.evaluate((el) => getComputedStyle(el).whiteSpace);
  if (space !== 'normal') throw new Refused(`a paragraph joins its source's lines — it is laid out white-space: ${space}`);
  const task = fold.locator('[data-layer="task"]');
  const scroller = task.locator('[data-language] .overflow-auto');
  await expectCount(scroller, 1, "the brief's code block");
  const code = await scroller.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  if (code.scroll <= code.client)
    throw new Refused(`the code's long line scrolls inside its block — it is ${code.scroll}px in ${code.client}px`);
  const layer = await task.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  if (layer.scroll > layer.client) throw new Refused(`the task's layer holds its words — they are ${layer.scroll}px in ${layer.client}px`);
  await expectCount(page.locator('[data-told] [data-layer] pre:not([data-language] pre)'), 0, 'no layer is a source block');
}

/** On a phone, `write`'s open layers are photographed, and the run's page is no wider than the phone; then the window is put back. */
async function onPhone(page: Page, write: Locator): Promise<void> {
  const was = page.viewportSize();
  await page.setViewportSize(PHONE);
  try {
    await settled(page);
    const wide = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, phone: innerWidth }));
    if (wide.page > wide.phone) throw new Refused(`the run's page fits a phone — it is ${wide.page}px on ${wide.phone}px`);
    await photograph(write, path.join(OUT, `told-layers-phone-${await themeOf(page)}.png`));
  } finally {
    if (was) await page.setViewportSize(was);
  }
}

const PHONE = { width: 390, height: 844 };

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
        ['policy', LAYERED.policySays],
        ['task', 'What was asked for'],
      ];
      for (const [layer, said] of words)
        await expectVisible(
          fold.locator(`[data-layer="${layer}"] [data-markdown]`, { hasText: said }),
          `the ${layer} layer says ${JSON.stringify(said)}`,
        );
      await expectMarkdown(page, fold);
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
      await expectCount(fold.getByText(LAYERED.policySays), 1, 'the policy once: the brief is not drawn whole beside the layers');
      await expectVisible(fold.getByText("in the session's system prompt", { exact: false }), 'where the first two went');

      const review = sectionOf(page, 'review').locator('details[data-told]');
      await review.locator('summary').click();
      await expectVisible(review.getByText('No agent: its own words are all it was told', { exact: false }), 'review has no agent');
      await expectCount(review.locator('[data-layer="instructions"], [data-layer="custom"]'), 0, "and so no agent's layer");
      await settled(page);
      await photograph(write, path.join(OUT, `told-layers-open-${await themeOf(page)}.png`));
      await onPhone(page, write);
      await goto(page, `/runs/${FOLDER.id}`);
    } finally {
      fs.rmSync(record, { force: true });
      fs.rmSync(path.join(store!, 'runs', LAYERED.id), { recursive: true, force: true });
    }
  },
} satisfies PageSpec;
