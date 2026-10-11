import fs from 'node:fs';
import path from 'node:path';
import type { Locator, Page, Response } from 'playwright';
import { filesIn, photograph, sidebar, themeOf } from '../board.ts';
import { drawEdge } from '../canvas.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { AGENTS, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** The workflow the `builder` page makes, and what its two steps' agents are told. */
const BUILT = { name: 'built', plan: 'Write PLAN.md.', implement: 'Implement what PLAN.md says.' };

/**
 * The workflow of yours the `builder` page opens a step with an agent on: its step `build` names the agent `agent`, and is moved to
 * `other`.
 */
const CREWED = { name: 'crew', agent: 'coder', other: 'critic' };

/** The schema the `builder` page pastes for an `output:`: strict, as the parser takes one. */
const PASTED = JSON.stringify({
  type: 'object',
  properties: { risks: { type: 'array', items: { type: 'string' } } },
  required: ['risks'],
  additionalProperties: false,
});

/** A schema pasted for `step`'s `output:` in its form, which is open: written beside the steps by the save, under `<step>.schema.json`. */
async function pasteSchema(builder: Locator, step: string, text: string): Promise<void> {
  const keys = builder.locator(`[data-step-form="${step}"]`);
  await expectVisible(keys, `${step}'s form, to paste a schema in`);
  await keys.locator('[data-field="output"] select').selectOption({ label: 'Paste a schema…' });
  const box = keys.getByRole('textbox', { name: 'The JSON Schema' });
  await expectVisible(box, `${step}'s output offers a box for the schema`);
  await box.fill(text);
  const file = await keys.getByRole('textbox', { name: 'Written on save as' }).inputValue();
  if (file !== `${step}.schema.json`)
    throw new Refused(`a schema pasted for ${step} is written beside it as ${step}.schema.json — the form says ${file}`);
}

/** A step added on a builder: its name and what it is told. */
async function addStep(builder: Locator, name: string, body: string): Promise<void> {
  await builder.getByRole('button', { name: 'Add a step' }).click();
  const form = builder.getByRole('form', { name: 'Add a step' });
  await form.getByRole('textbox', { name: 'Step name' }).fill(name);
  await form.getByRole('textbox', { name: 'What it is told' }).fill(body);
  await form.getByRole('button', { name: 'Add', exact: true }).click();
  await expectVisible(builder.locator(`.react-flow__node[data-id="${name}"]`), `the step added, ${name}, is a block on the canvas`);
}

/**
 * Refuses unless `keys`, the form of a step on the agent `agent` of the crew's, is read by layer: its agent's instructions folded, your
 * custom instructions (none), then the step's policy holding its words and the fence key its file sets, and its other keys after.
 */
async function expectLayers(keys: Locator, agent: string): Promise<void> {
  const layers = ['instructions', 'custom', 'policy'];
  const drawn = await keys.locator('[data-layer]').evaluateAll((all) => all.map((el) => el.getAttribute('data-layer')));
  if (drawn.join() !== layers.join()) throw new Refused(`the layers are drawn ${layers.join(', ')} — they are ${drawn.join(', ')}`);
  const instructions = keys.locator('[data-layer="instructions"]');
  await expectCount(
    instructions.locator('details:not([open]) [data-markdown]', { hasText: 'You write code.' }),
    1,
    `${agent}'s words, folded`,
  );
  await expectVisible(keys.locator('[data-layer="custom"]', { hasText: `None. Write them on ${agent}'s page.` }), 'no custom instructions');
  const policy = keys.locator('[data-layer="policy"]');
  await expectVisible(policy.getByRole('textbox', { name: 'Its words' }), "the step's words are its policy");
  await expectCount(policy.locator('[data-field="disallowedTools"]'), 1, 'and the fence key it sets');
  await expectCount(keys.locator('[data-field="disallowedTools"]'), 1, 'drawn once: never again among the wiring keys');
  await expectCount(policy.locator('[data-field="mcp"]'), 1, "and the servers it adds to its agent's");
  await expectCount(keys.locator('[data-field="mcp"]'), 1, 'drawn once too');
  await expectVisible(policy.getByText(`May only tighten ${agent}'s fence: a loosening is refused on save.`), 'which may only tighten');
  await expectCount(policy.locator('[data-field="check"], [data-field="model"]'), 0, 'and no wiring key is in it');
  await instructions.locator('summary').click();
  await expectVisible(instructions.locator('[data-markdown]', { hasText: 'You write code.' }), `opened, the fold reads ${agent}'s words`);
  await instructions.locator('summary').click();
}

/**
 * The README in the builder of the workflow `name`, made with none: a draft discarded goes back to none; one saved is written as
 * `README.md` beside the steps, and once the builder is closed, the page reads it as its README.
 */
async function writesReadme(page: Page, builder: Locator, name: string, put: (r: Response) => boolean): Promise<void> {
  const readme = builder.getByRole('textbox', { name: /^README/ });
  await expectVisible(readme, 'the builder has a box for the README');
  await expectCount(page.getByRole('region', { name: 'README' }), 0, 'and the page shows it there alone, not again above the builder');
  await readme.fill('A draft let go.');
  await expectVisible(builder.locator('[data-readme-unsaved]'), 'a README typed is marked unsaved');
  await builder.getByRole('button', { name: 'Discard changes' }).click();
  if ((await readme.inputValue()) !== '') throw new Refused(`Discard puts the README back to none — it holds ${await readme.inputValue()}`);
  const text = `# ${name}\n\nPlan it, then build it.\n`;
  await readme.fill(text);
  const [saved] = await Promise.all([
    page.waitForResponse(put, { timeout: WAIT_MS }),
    builder.getByRole('button', { name: 'Save', exact: true }).click(),
  ]);
  if (saved.status() !== 200) throw new Refused(`the api saves the README — it answered ${saved.status()}: ${await saved.text()}`);
  await expectCount(builder.locator('[data-readme-unsaved]'), 0, 'once saved, the README is not unsaved');
  const file = path.join(store!, 'workflows', name, 'README.md');
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text)
    throw new Refused(
      `the README is written beside the steps — ${file} holds ${fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : 'nothing'}`,
    );
  await builder.getByRole('button', { name: 'Close', exact: true }).click();
  await expectVisible(
    page.getByRole('region', { name: 'README' }).getByText('Plan it, then build it.', { exact: true }),
    'closed, the page reads the README saved',
  );
}

export default {
  /**
   * The builder, on the store's workflows: a workflow of yours made with a first step, a step added, an edge drawn from one block to the
   * other, two keys set in the step's form, a schema pasted, saved, and the folder read back through the api and on disk, then taken back,
   * so every page after this one, in either theme, reads the store as seeded. Each in a page of its own: a cycle drawn and saved, with a
   * schema pasted beside it, refused, and nothing written; a save of the folder changed by hand since, refused; and a step with an agent,
   * whose form shows what each agent picked gives it. The workflow made opens on its page, in its builder, where its README
   * is written.
   */
  name: 'builder',
  route: '/workflows',
  expect: async (page) => {
    await sidebar(page);
    const { yours } = WORKFLOWS;
    const card = (p: Page, name: string) => p.locator(`article[aria-label="Workflow ${name}"]`);
    const open = async (p: Page, name: string) => {
      await p.goto(new URL(`/workflows/yours/${name}`, page.url()).href, { waitUntil: 'load' });
      await idle(p);
    };
    const puts = (name: string) => (r: Response) =>
      r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/workflows/yours/${name}`;

    const mineDir = path.join(store!, 'workflows', yours.name);
    const before = filesIn(mineDir);
    const refused = await page.context().newPage();
    try {
      const { problems } = watch(refused);
      await open(refused, yours.name);
      const mine = card(refused, yours.name);
      await mine.getByRole('button', { name: 'Build', exact: true }).click();
      const builder = mine.locator(`section[data-builder="${yours.name}"]`);
      await expectVisible(builder, `Build opens ${yours.name}'s builder`);
      await addStep(builder, 'build', 'Build what PLAN.md says.');
      await pasteSchema(builder, 'build', PASTED);
      await drawEdge(refused, builder, 'plan', 'build');
      await drawEdge(refused, builder, 'build', 'plan');
      await expectCount(builder.locator('.react-flow__edge'), 2, 'two edges drawn, each way: build waits on plan, and plan on build');
      const [answered] = await Promise.all([
        refused.waitForResponse(puts(yours.name), { timeout: WAIT_MS }),
        builder.getByRole('button', { name: 'Save', exact: true }).click(),
      ]);
      const { error, steps } = (await answered.json()) as { error?: string; steps?: string[] };
      if (
        answered.status() !== 422 ||
        error !== 'these steps wait on each other: build, plan' ||
        JSON.stringify(steps) !== JSON.stringify(['build', 'plan'])
      ) {
        throw new Refused(
          `the api refuses a cycle in the package's words, naming both steps — it answered ${answered.status()}: ${JSON.stringify({ error, steps })}`,
        );
      }
      await expectVisible(builder.locator('[data-refused]'), 'the refusal is shown above the canvas, not swallowed');
      const shown = await builder.locator('[data-refused] p.font-mono').textContent();
      if (shown !== error)
        throw new Refused(
          `the refusal is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`,
        );
      for (const step of ['plan', 'build']) {
        await expectVisible(
          builder.locator(`.react-flow__node[data-id="${step}"] [data-refused-step]`),
          `${step}, which the refusal names, is marked on the canvas`,
        );
      }
      await expectVisible(
        builder.locator('[data-step-form] [data-refused-here]', { hasText: error }),
        'and in the form of the step it names, which it opens',
      );
      await expectVisible(builder.locator('[data-unsaved]', { hasText: 'Unsaved changes' }), 'the draft is still unsaved');
      if (JSON.stringify(filesIn(mineDir)) !== JSON.stringify(before))
        throw new Refused(
          `nothing is written on a refusal, the pasted schema included: the save is judged whole — ${mineDir} holds ${filesIn(mineDir)
            .map(([f]) => f)
            .join(', ')}`,
        );
      await settled(refused);
      await photograph(refused, path.join(OUT, `builder-refused-${await themeOf(refused)}.png`), { fullPage: true });

      await builder.getByRole('button', { name: 'Remove the edge build → plan' }).click();
      await expectCount(builder.locator('.react-flow__edge'), 1, "the edge's button takes it away, and plan no longer waits on build");
      await expectCount(
        builder.locator('.react-flow__node [data-refused-step]'),
        2,
        'the refusal stays on the steps it named until the next save',
      );
      const buildKeys = builder.locator('[data-step-form="build"]');
      await drawEdge(refused, builder, 'build', 'plan', true);
      if ((await buildKeys.locator('[data-field="loop"] select').inputValue()) !== 'plan')
        throw new Refused("the loop drawn from build's violet dot sets build's loop: plan in its form");
      if ((await buildKeys.locator('[data-field="rounds"] input').inputValue()) !== '3') throw new Refused('and its rounds, the default 3');
      await builder.getByRole('button', { name: "Remove build's loop back to plan" }).click();
      await expectCount(builder.locator('.react-flow__edge'), 1, "the loop's button takes it away");
      if (
        (await buildKeys.locator('[data-field="loop"] select').inputValue()) !== '' ||
        (await buildKeys.locator('[data-field="rounds"] input').inputValue()) !== ''
      ) {
        throw new Refused("and build's loop and rounds with it");
      }
      await idle(refused);
      const expected = `request answered 422: PUT ${answered.url()}`;
      const seen = problems();
      const others = seen.filter(
        (p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 422\b/.test(p),
      );
      if (!seen.includes(expected) || others.length)
        throw new Refused(
          `the refused page saw its one refusal, its answer and the line Chromium writes to the console for one, and nothing else — it saw:\n    ${seen.join('\n    ')}`,
        );
    } finally {
      await refused.close();
    }
    if (JSON.stringify(filesIn(mineDir)) !== JSON.stringify(before)) throw new Refused(`${mineDir} is as seeded after the refused page`);

    const planFile = path.join(mineDir, 'plan.md');
    const seeded = fs.readFileSync(planFile, 'utf8');
    const byHand = seeded.replace('harness: codex\n', 'harness: codex\ncheck: test -f PLAN.md\n');
    if (byHand === seeded) throw new Refused(`${planFile} is seeded with harness: codex, for the edit by hand to add a check under`);
    const stale = await page.context().newPage();
    try {
      const { problems } = watch(stale);
      await open(stale, yours.name);
      const mine = card(stale, yours.name);
      await mine.getByRole('button', { name: 'Build', exact: true }).click();
      const builder = mine.locator(`section[data-builder="${yours.name}"]`);
      const keys = builder.locator('[data-step-form="plan"]');
      await expectVisible(keys, "plan's form, open as the builder opens");
      await expectVisible(
        keys.locator('[data-field="sandbox"] select'),
        "plan's form offers its sandbox: plan runs on codex, whose fence is Codex's sandbox",
      );
      await expectCount(keys.locator('[data-field="permissionMode"]'), 0, 'and no permission mode, which codex has not');
      await keys.getByRole('textbox', { name: 'What it is told' }).fill('Write PLAN.md, briefly.');
      fs.writeFileSync(planFile, byHand);
      const [answered] = await Promise.all([
        stale.waitForResponse(puts(yours.name), { timeout: WAIT_MS }),
        builder.getByRole('button', { name: 'Save', exact: true }).click(),
      ]);
      const { error } = (await answered.json()) as { error?: string };
      if (
        answered.status() !== 409 ||
        !error?.startsWith(`${mineDir} has changed since it was read at version `) ||
        !error.includes('Nothing was written. Read the folder again')
      ) {
        throw new Refused(
          `the api refuses a save of a folder changed by hand since it was read — it answered ${answered.status()}: ${JSON.stringify(error)}`,
        );
      }
      const shown = await builder.locator('[data-refused] p.font-mono').textContent();
      if (shown !== error)
        throw new Refused(
          `the refusal is the api's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`,
        );
      if (fs.readFileSync(planFile, 'utf8') !== byHand)
        throw new Refused(
          `the change by hand is kept, not written over — ${planFile} holds ${JSON.stringify(fs.readFileSync(planFile, 'utf8'))}`,
        );
      const again = builder.getByRole('button', { name: 'Read the folder again' });
      await expectVisible(again, 'the refusal offers to read the folder again');
      await settled(stale);
      await photograph(stale, path.join(OUT, `builder-changed-${await themeOf(stale)}.png`), { fullPage: true });
      await again.click();
      await expectCount(builder.locator('[data-refused]'), 0, 'read again, the refusal goes');
      await expectVisible(builder.locator('span', { hasText: /^Saved$/ }), 'and the draft is the folder as it is now: nothing unsaved');
      await expectVisible(
        builder.locator('.react-flow__node[data-id="plan"] dd', { hasText: /^test -f PLAN\.md$/ }),
        "plan's block shows the check written by hand",
      );
      const body = await builder.locator('[data-step-form="plan"]').getByRole('textbox', { name: 'What it is told' }).inputValue();
      if (body !== 'Write PLAN.md.')
        throw new Refused(`plan's form reads the body on disk, and the change drawn is let go — it shows ${JSON.stringify(body)}`);
      await idle(stale);
      const expected = `request answered 409: PUT ${answered.url()}`;
      const seen = problems();
      const others = seen.filter(
        (p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 409\b/.test(p),
      );
      if (!seen.includes(expected) || others.length)
        throw new Refused(`the changed page saw its one refusal and nothing else — it saw:\n    ${seen.join('\n    ')}`);
    } finally {
      await stale.close();
      fs.writeFileSync(planFile, seeded);
    }

    const { name: crew, agent, other } = CREWED;
    const crewDir = path.join(store!, 'workflows', crew);
    const agentsDir = path.join(store!, 'workflows', 'agents');
    const hadAgents = fs.existsSync(agentsDir);
    const crewed = await page.context().newPage();
    try {
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(path.join(agentsDir, `${agent}.md`), '---\nharness: claude\nmodel: opus\neffort: high\n---\nYou write code.\n');
      fs.writeFileSync(path.join(agentsDir, `${other}.md`), '---\nmodel: sonnet\n---\nYou review code.\n');
      fs.mkdirSync(crewDir, { recursive: true });
      fs.writeFileSync(
        path.join(crewDir, 'build.md'),
        `---\nplace: git\nagent: ${agent}\ncheck: npm test\ndisallowedTools: Bash(rm:*)\n---\nMind the cache.\n`,
      );
      const { problems } = watch(crewed);
      await open(crewed, crew);
      await card(crewed, crew).getByRole('button', { name: 'Build', exact: true }).click();
      const builder = card(crewed, crew).locator(`section[data-builder="${crew}"]`);
      const keys = builder.locator('[data-step-form="build"]');
      await expectVisible(keys, "build's form, open as the builder opens");
      const note = keys.getByRole('textbox', { name: 'Its words' });
      await expectVisible(note, 'its body is its own words');
      if ((await note.inputValue()) !== 'Mind the cache.')
        throw new Refused(`the note is the step's own words, not its agent's — it shows ${JSON.stringify(await note.inputValue())}`);
      await expectTexts(
        keys.locator('[data-agent-note]'),
        [`Told after ${agent}'s instructions; where they conflict, these words win.`],
        'and says whose instructions it is told after',
      );
      await expectLayers(keys, agent);
      const picker = keys.locator('[data-field="agent"] select');
      const offered = await picker.locator('option').allTextContents();
      if (
        (await picker.inputValue()) !== agent ||
        JSON.stringify(offered) !== JSON.stringify(['no agent', agent, other, AGENTS.seeded.name])
      ) {
        throw new Refused(
          `the picker names ${agent}, and offers no agent and each agent of yours — it offers ${JSON.stringify(offered)} on ${JSON.stringify(await picker.inputValue())}`,
        );
      }
      const model = keys.locator('[data-field="model"] input');
      const effort = keys.locator('[data-field="effort"] select');
      const unsetEffort = effort.locator('option[value=""]');
      if ((await model.inputValue()) !== '' || (await model.getAttribute('placeholder')) !== `opus — ${agent}'s`)
        throw new Refused(
          `the model ${agent} gives it is shown as ${agent}'s, and the field is empty — it holds ${JSON.stringify(await model.inputValue())} under ${JSON.stringify(await model.getAttribute('placeholder'))}`,
        );
      if ((await effort.inputValue()) !== '' || (await unsetEffort.textContent()) !== `high — ${agent}'s`)
        throw new Refused(`and the effort — it reads ${JSON.stringify(await unsetEffort.textContent())}`);
      if ((await keys.locator('[data-field="check"] input').inputValue()) !== 'npm test')
        throw new Refused('the check it sets itself is in its field');
      await settled(crewed);
      await photograph(crewed, path.join(OUT, `builder-agent-${await themeOf(crewed)}.png`), { fullPage: true });

      await picker.selectOption(other);
      await expectTexts(
        keys.locator('[data-agent-note]'),
        [`Told after ${other}'s instructions, and any custom instructions you wrote for it; where they conflict, these words win.`],
        `moved to ${other}, the note is told after ${other}'s`,
      );
      await expectTexts(
        keys.locator('[data-agent-layers-unread]'),
        [`Save to read ${other}'s instructions here.`],
        `and ${other}'s instructions are read once saved, never drawn as ${agent}'s`,
      );
      await expectCount(keys.locator('[data-layer="instructions"], [data-layer="custom"]'), 0, `no layer of ${agent}'s is left`);
      if ((await model.getAttribute('placeholder')) !== `sonnet — ${other}'s`)
        throw new Refused(
          `moved to ${other}, the model is ${other}'s — it reads ${JSON.stringify(await model.getAttribute('placeholder'))}`,
        );
      if ((await unsetEffort.textContent()) !== `not set — nor by ${other}`)
        throw new Refused(`and ${agent}'s effort is not shown as ${other}'s — it reads ${JSON.stringify(await unsetEffort.textContent())}`);
      if ((await note.inputValue()) !== 'Mind the cache.' || (await keys.locator('[data-field="check"] input').inputValue()) !== 'npm test')
        throw new Refused('and what the step sets itself stays');

      await picker.selectOption('');
      await expectCount(keys.locator('[data-agent-note]'), 0, 'with no agent, nothing is told before its body');
      await expectCount(keys.locator('[data-layer]'), 0, 'and it has no layers');
      await expectVisible(keys.getByRole('textbox', { name: 'What it is told' }), 'and its body is all it is told');
      await idle(crewed);
      if (problems().length) throw new Refused(`the agent's page saw nothing refused — it saw:\n    ${problems().join('\n    ')}`);
    } finally {
      await crewed.close();
      fs.rmSync(crewDir, { recursive: true, force: true });
      fs.rmSync(hadAgents ? path.join(agentsDir, `${agent}.md`) : agentsDir, { recursive: true, force: true });
      if (hadAgents) fs.rmSync(path.join(agentsDir, `${other}.md`), { force: true });
    }

    const { name, plan, implement } = BUILT;
    const made = path.join(store!, 'workflows', name);
    try {
      await page.getByRole('button', { name: 'New workflow' }).click();
      const form = page.getByRole('form', { name: 'New workflow' });
      await form.getByRole('textbox', { name: 'Workflow name' }).fill(name);
      await form.getByRole('textbox', { name: 'First step' }).fill('plan');
      await form.getByRole('textbox', { name: 'What it is told' }).fill(plan);
      const make = form.getByRole('button', { name: 'Make it' });
      if (!(await make.isDisabled()))
        throw new Refused('the form makes nothing until a person chooses where the steps work: none is chosen');
      await expectCount(form.getByRole('radio', { checked: true }), 0, 'neither place chosen for them');
      await photograph(form, path.join(OUT, `builder-new-unchosen-${await themeOf(page)}.png`));
      await form.getByRole('radio', { name: /^On a repository's branches/ }).check();
      await photograph(form, path.join(OUT, `builder-new-chosen-${await themeOf(page)}.png`));
      const [created] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/workflows/yours', {
          timeout: WAIT_MS,
        }),
        make.click(),
      ]);
      if (created.status() !== 201)
        throw new Refused(`the api makes the workflow — it answered ${created.status()}: ${await created.text()}`);
      if (JSON.stringify(filesIn(made)) !== JSON.stringify([['plan.md', `---\nplace: git\n---\n${plan}\n`]]))
        throw new Refused(`the new folder is its first step — ${made} holds ${JSON.stringify(filesIn(made))}`);

      const builder = card(page, name).locator(`section[data-builder="${name}"]`);
      await expectVisible(builder, 'the workflow made opens in its builder');
      await page.waitForURL((url) => url.pathname === `/workflows/yours/${name}`, { timeout: WAIT_MS });
      if (new URL(page.url()).searchParams.get('build') !== 'true')
        throw new Refused(`on its own page, the address saying so, ?build=true — it is ${page.url()}`);
      await expectVisible(builder.locator('span', { hasText: /^Saved$/ }), 'with nothing unsaved');
      await addStep(builder, 'implement', implement);
      await expectVisible(builder.locator('[data-unsaved]', { hasText: 'Unsaved changes' }), 'a step added is marked unsaved on the card');
      await expectVisible(builder.locator('.react-flow__node[data-id="implement"] [data-unsaved-step]'), 'and on its block');
      await expectCount(
        builder.locator('.react-flow__node[data-id="plan"] [data-unsaved-step]'),
        0,
        'and not on the step it did not change',
      );

      await drawEdge(page, builder, 'plan', 'implement');
      await expectCount(builder.locator('.react-flow__edge[data-id="plan->implement"]'), 1, 'the edge drawn from plan to implement');
      await expectVisible(builder.getByRole('button', { name: 'Remove the edge plan → implement' }), 'with a button that takes it away');

      await builder.locator('.react-flow__node[data-id="implement"]').click();
      const keys = builder.locator('[data-step-form="implement"]');
      await expectVisible(keys, "implement's form, once its block is clicked");
      await expectVisible(keys.locator('[data-field="after"] input[type="checkbox"]:checked'), 'whose after has plan, as the edge drew it');
      await keys.locator('[data-field="effort"] select').selectOption('high');
      await keys.locator('[data-field="check"] input').fill('npm test');
      await expectVisible(
        builder.locator('.react-flow__node[data-id="implement"] dd', { hasText: /^npm test$/ }),
        'the block shows the check set in its form',
      );
      await pasteSchema(builder, 'implement', PASTED);

      const [saved] = await Promise.all([
        page.waitForResponse(puts(name), { timeout: WAIT_MS }),
        builder.getByRole('button', { name: 'Save', exact: true }).click(),
      ]);
      if (saved.status() !== 200) throw new Refused(`the api saves the folder — it answered ${saved.status()}: ${await saved.text()}`);
      await expectVisible(builder.locator('span', { hasText: /^Saved$/ }), 'once saved, nothing is unsaved');
      await expectCount(builder.locator('[data-unsaved-step]'), 0, 'on any block');
      await expectVisible(
        builder.locator('[data-saved]', { hasText: 'wrote implement.md, implement.schema.json; left plan.md as it was' }),
        'and the card says what was written, the pasted schema with it',
      );
      if ((await keys.locator('[data-field="output"] select').inputValue()) !== 'implement.schema.json')
        throw new Refused("once saved, implement's output names the schema beside it, as the folder lists it");

      const answered = await page.request.get(new URL('/api/workflows', page.url()).href);
      const listing = (
        (await answered.json()) as Array<{
          name: string;
          from: string;
          steps: Array<{ name: string; spec: Record<string, unknown>; body: string }>;
          graph: { edges: unknown[] };
          error: string | null;
        }>
      ).find((w) => w.name === name && w.from === 'yours');
      const read = listing && {
        error: listing.error,
        steps: listing.steps.map((s) => [s.name, s.spec.after, s.spec.effort, s.spec.check, s.spec.output, s.body]),
        edges: listing.graph.edges,
      };
      const want = {
        error: null,
        steps: [
          ['plan', [], null, null, null, plan],
          ['implement', ['plan'], 'high', 'npm test', 'implement.schema.json', implement],
        ],
        edges: [{ from: 'plan', to: 'implement', kind: 'after' }],
      };
      if (JSON.stringify(read) !== JSON.stringify(want))
        throw new Refused(
          `GET /api/workflows reads the folder as it was built, as a start would read it — it read ${JSON.stringify(read)}`,
        );
      const files = [
        ['implement.md', `---\nafter: plan\nplace: git\neffort: high\ncheck: npm test\noutput: implement.schema.json\n---\n${implement}\n`],
        ['implement.schema.json', `${PASTED}\n`],
        ['plan.md', `---\nplace: git\n---\n${plan}\n`],
      ];
      if (JSON.stringify(filesIn(made)) !== JSON.stringify(files))
        throw new Refused(`the folder's files are the steps as built — ${made} holds ${JSON.stringify(filesIn(made))}`);
      const stepPage = await page.request.get(new URL(`/api/workflows/yours/${name}/implement`, page.url()).href);
      const { source } = (await stepPage.json()) as { source?: string };
      if (source !== files[0][1]) throw new Refused(`the step's page reads implement.md as written — it read ${JSON.stringify(source)}`);
      await settled(page);
      await photograph(page, path.join(OUT, `builder-saved-${await themeOf(page)}.png`), { fullPage: true });
      await writesReadme(page, builder, name, puts(name));
    } finally {
      fs.rmSync(made, { recursive: true, force: true });
    }
  },
} satisfies PageSpec;
