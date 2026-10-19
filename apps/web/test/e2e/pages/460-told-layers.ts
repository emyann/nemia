import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page } from 'playwright';
import { photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled } from '../checks.ts';
import { FACTORIES, FOLDER } from '../seed.ts';
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
  /** The run the page writes beside it, started in a factory that kept rules, and the rules it froze. */
  ruled: 'told-ruled-e2e46',
  rules: 'Never push on a **Friday**. A change comes with the test that proves it.',
  /** The rules' first words, as a person reads them drawn. */
  rulesSay: 'Never push on a Friday.',
  /** The run the page writes beside it, which froze no workflow, so its steps are read from the folder and have no layers. */
  unfrozen: 'told-unfrozen-e2e46',
  /** What the folder's `write` step says, its body on a record that froze no layers. */
  folderSays: 'Write a short note on what was asked.',
  /** What the layer of the folder's files says, which the run froze none of: the session reads them where it works. */
  folderSaid: 'The session reads them itself, wherever it works',
  /** The clause the fold's note carries, which is what the numbers on the headings mean. */
  wins: 'the higher number wins, and the task is above them all',
  /** Each layer the board numbers, by the heading a person reads over it. */
  heads: [
    ['custom', '2. Your custom instructions'],
    ['policy', "5. The step's policy"],
  ] as ReadonlyArray<readonly [string, string]>,
  brief: `Told by layer\n\nA run written by the told-layers page: a step whose agent, person and policy each told it something.\n\n\`\`\`\nconst line = '${'a line that is longer than any panel, '.repeat(8)}';\n\`\`\``,
} as const;

const goto = async (page: Page, to: string): Promise<void> => {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
};

/**
 * Writes a record into the e2e's store under `id`, as `wf start` freezes it: `write`, hired from `writer` with the person's custom
 * instructions and one skill of its own, its line adding another and a deny; and `review`, with no agent. Neither is filed, so each says
 * what it would be told now. Given `rules`, it is a run started in FACTORIES' `hiring` while the factory kept them: `write`'s agent froze
 * them, after the custom instructions, and `review`, with no agent, was told none.
 */
function written(id: string = LAYERED.id, rules: string | null = null): string {
  const record = path.join(store!, 'runs', `${id}.json`);
  const work = path.join(store!, 'runs', id, 'work');
  fs.mkdirSync(work, { recursive: true });
  const write = {
    name: 'write',
    after: [],
    body: [LAYERED.instructions, LAYERED.custom, ...(rules === null ? [] : [rules]), LAYERED.policy].join('\n\n'),
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
      ...(rules !== null && { factoryRules: rules }),
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
    id,
    ...(rules !== null && { factory: FACTORIES.hiring.name }),
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

/** Writes a record that froze no workflow, as one written before runs froze theirs: its key absent, so the api reads the folder's steps. */
function unfrozen(): string {
  const record = path.join(store!, 'runs', `${LAYERED.unfrozen}.json`);
  const work = path.join(store!, 'runs', LAYERED.unfrozen, 'work');
  fs.mkdirSync(work, { recursive: true });
  const run = {
    id: LAYERED.unfrozen,
    place: { kind: 'folder' },
    workspace: work,
    brief: 'Told whole\n\nA run written by the told-layers page, which froze no workflow.',
    workflowDir: path.join(store!, FOLDER.workflow),
    createdAt: new Date().toISOString(),
    steps: { write: { taskId: null }, review: { taskId: null } },
  };
  fs.writeFileSync(record, JSON.stringify(run, null, 2));
  return record;
}

/** Refuses unless the step section `write` says each of `words` once, fold and all. */
async function expectOnce(section: Locator, words: Array<[string, string]>): Promise<void> {
  for (const [what, said] of words) await expectCount(section.getByText(said), 1, `${what} once in the section, only in its fold`);
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

/**
 * The run started in a factory that kept rules: `write`'s fold draws them as a layer of their own, between the custom instructions and
 * the step's policy, once, and says they went where the agent's words and the person's did; `review`, with no agent, was told none.
 */
async function expectRules(page: Page): Promise<void> {
  await goto(page, `/runs/${LAYERED.ruled}`);
  const write = sectionOf(page, 'write');
  const fold = write.locator('details[data-told]');
  await fold.locator('summary').click();
  const layers = ['instructions', 'custom', 'folder', 'factory', 'policy', 'task'];
  await expectCount(fold.locator('[data-layer]'), layers.length, 'six layers, in a factory that kept rules');
  const drawn = await fold.locator('[data-layer]').evaluateAll((all) => all.map((el) => el.getAttribute('data-layer')));
  if (drawn.join() !== layers.join()) throw new Refused(`the layers are drawn ${layers.join(', ')} — they are ${drawn.join(', ')}`);
  const rules = fold.locator('[data-layer="factory"]');
  await expectVisible(rules.locator('h4', { hasText: "4. The factory's rules" }), 'the layer is named, by its number');
  await expectVisible(rules.locator('[data-markdown]', { hasText: LAYERED.rulesSay }), 'and says the rules the run froze');
  await expectVisible(rules.locator('strong', { hasText: 'Friday' }), 'as the markdown they are');
  await expectVisible(
    fold.getByText("The agent's instructions, yours and the factory's rules were frozen at the start of the run", { exact: false }),
    'the fold says the rules were frozen with them',
  );
  await expectOnce(write, [
    ["the factory's rules", LAYERED.rulesSay],
    ['the custom instructions', LAYERED.custom],
    ['the policy', LAYERED.policySays],
  ]);
  const review = sectionOf(page, 'review').locator('details[data-told]');
  await review.locator('summary').click();
  await expectCount(review.locator('[data-layer="factory"]'), 0, 'a step with no agent froze no rules of its own');
  await expectCount(review.locator('[data-layer="folder"]'), 1, "and is told the folder's files all the same");
  await settled(page);
  await photograph(write, path.join(OUT, `told-layers-rules-${await themeOf(page)}.png`));
}

export default {
  /**
   * What a step was told, by layer, from what its run froze. `write`'s fold, opened, draws the agent's instructions with its skill, the
   * person's custom instructions, the folder's files the session reads itself, the step's policy with the skill and the deny its line
   * adds, and the task, in that order, each once, each headed by its number, and
   * says the first two went into the session's system prompt and that the higher number wins — five layers, and none for a factory's
   * rules, the run having frozen none;
   * a run started in a factory that kept rules draws them as a sixth, between the folder's files and the policy (`expectRules`);
   * `review`, with no agent, says the words Nemia composes are its own alone, and is told the folder's files all the same
   * (`told-layers-agentless-<theme>.png`). Each
   * section, fold and all, says each layer's words once: no body above the fold says them again. A run that froze no layers still draws
   * its step's body above the fold, which is all it has of the step's words. The page writes its runs and takes them back, so each visit
   * reads the store as seeded.
   */
  name: 'told-layers',
  route: `/runs/${FOLDER.id}`,
  expect: async (page) => {
    const records: string[] = [];
    try {
      records.push(written());
      records.push(unfrozen());
      records.push(written(LAYERED.ruled, LAYERED.rules));
      await goto(page, `/runs/${LAYERED.id}`);
      const write = sectionOf(page, 'write');
      const fold = write.locator('details[data-told]');
      await expectVisible(fold.locator('summary', { hasText: 'What it would be told now' }), "write's fold: a step not filed yet");
      await settled(page);
      await photograph(write, path.join(OUT, `told-layers-closed-${await themeOf(page)}.png`));
      await fold.locator('summary').click();
      const layers = ['instructions', 'custom', 'folder', 'policy', 'task'];
      await expectCount(fold.locator('[data-layer]'), layers.length, "five layers: the run froze no factory's rules, and none is drawn");
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
      await expectVisible(
        fold.locator('[data-layer="instructions"] h4', { hasText: `1. Instructions — ${LAYERED.agent}'s` }),
        'whose words, and which layer they are',
      );
      const folder = fold.locator('[data-layer="folder"]');
      await expectVisible(folder.locator('h4', { hasText: "3. The folder's files" }), "the folder's files are the third layer");
      await expectVisible(folder.getByText(LAYERED.folderSaid, { exact: false }), 'and the session reads them itself');
      await expectCount(folder.locator('[data-markdown]'), 0, 'the run froze none of them, so none is drawn as words');
      for (const [layer, head] of LAYERED.heads)
        await expectVisible(fold.locator(`[data-layer="${layer}"] h4`, { hasText: head }), `the ${layer} layer is headed ${head}`);
      await expectVisible(fold.getByText(LAYERED.wins, { exact: false }), 'the fold says the higher number wins');
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
      await expectOnce(write, [
        ["the agent's instructions", LAYERED.instructions],
        ['the custom instructions', LAYERED.custom],
        ['the policy', LAYERED.policySays],
      ]);

      const review = sectionOf(page, 'review').locator('details[data-told]');
      await review.locator('summary').click();
      await expectVisible(
        review.getByText('No agent: of the words Nemia composes, its own are all it was told', { exact: false }),
        'review has no agent',
      );
      await expectCount(review.locator('[data-layer="instructions"], [data-layer="custom"]'), 0, "and so no agent's layer");
      await expectCount(
        review.locator('[data-layer="folder"]'),
        1,
        "but the folder's files, which the session reads itself, are told whether a step has an agent or not",
      );
      await expectOnce(sectionOf(page, 'review'), [["review's own words", LAYERED.review]]);
      await settled(page);
      await photograph(write, path.join(OUT, `told-layers-open-${await themeOf(page)}.png`));
      await photograph(sectionOf(page, 'review'), path.join(OUT, `told-layers-agentless-${await themeOf(page)}.png`));
      await onPhone(page, write);
      await expectRules(page);

      await goto(page, `/runs/${LAYERED.unfrozen}`);
      const whole = sectionOf(page, 'write');
      await expectVisible(
        whole.locator(':scope > [data-markdown]', { hasText: LAYERED.folderSays }),
        'a record that froze no layers still draws its body',
      );
      await expectCount(whole.locator('[data-layer]'), 0, 'and no layer, since none was frozen');
      await settled(page);
      await photograph(whole, path.join(OUT, `told-layers-unfrozen-${await themeOf(page)}.png`));
      await goto(page, `/runs/${FOLDER.id}`);
    } finally {
      for (const record of records) fs.rmSync(record, { force: true });
      for (const id of [LAYERED.id, LAYERED.unfrozen, LAYERED.ruled])
        fs.rmSync(path.join(store!, 'runs', id), { recursive: true, force: true });
    }
  },
} satisfies PageSpec;
