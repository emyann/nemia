import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { expectAlive, filesIn, photograph, sidebar, themeOf, railPlace, litOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { AGENTS, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  /**
   * The agents beside the workflows: yours, which the board writes, and the repository's, read-only, each with the nodes that name it,
   * linked. Each says what its agent can do, its card generated from its skills in A2A's words: an entry for each skill it gives, read off
   * its SKILL.md, or one from its description when it gives none. The repository's `implementer` read, and the node that names it followed
   * to its step's page, which shows the same skills and links back; `scribe`'s form read with its result schema and its card shown
   * read-only, one entry, for it gives no skills; an agent made with a skill picked from your library, its card that skill's entry, edited
   * and removed, each on disk as the package writes it, and no card file anywhere. And, in a page of its own, a removal refused because a
   * node still names the agent; the workflow that names it is removed before that page closes, so the list, focused again, reads the store
   * as seeded. Every write is taken back, so the next visit, in either theme, reads the store as seeded.
   */
  name: 'agents',
  route: '/agents',
  expect: async (page) => {
    await sidebar(page);
    await expectVisible(railPlace(page, 'Agents').and(litOf(page)), 'the rail lights Agents on its page');
    const { good } = WORKFLOWS;
    const { seeded, made, naming } = AGENTS;
    const agentsDir = path.join(store!, 'workflows', 'agents');
    const before = filesIn(agentsDir);
    const card = (p: Page, from: string, name: string) => p.locator(`section[data-agent="${name}"][data-from="${from}"]`);
    const agentPath = (from: string, name: string) => `/agents/${from}/${name}`;

    await expectVisible(
      page.locator('article > div > p').getByText(`${agentsDir}/`, { exact: true }),
      `the page says where yours are, as the api reads its store: ${agentsDir}/`,
    );
    const yours = page.locator('section[aria-label="Yours"]');
    const theirs = page.locator('section[aria-label="This repository"]');
    await expectCount(yours.locator('section[data-agent]'), 1, `yours lists one agent, ${seeded.name}`);
    await expectCount(theirs.locator('section[data-agent]'), 1, `the repository's lists one, ${good.agent.name}`);
    const scribe = card(page, 'yours', seeded.name);
    await expectVisible(scribe.getByText(seeded.description, { exact: true }), `${seeded.name} with its description`);
    await expectTexts(
      scribe.locator('[data-agent-stats] dd'),
      [seeded.keys.model, seeded.keys.effort],
      `and its stats: the model and effort it sets, which the card shows`,
    );
    await expectCount(
      scribe.getByText(seeded.keys.output),
      0,
      `and not its result schema, ${seeded.keys.output}: that key is on its page, a click away`,
    );
    await expectTexts(scribe.locator('[data-used-by]'), ['No node names it yet.'], `and that no node names ${seeded.name}`);
    await expectTexts(scribe.locator('[data-agent-role]'), [`No role yet · ${seeded.name}`], `${seeded.name} holds no role, and says so`);
    const says = (where: ReturnType<typeof card>, skill: { id: string; name: string; description: string; tags: readonly string[] }) =>
      where.locator(`[data-agent-skill="${skill.id}"]`);
    await expectTexts(
      scribe.locator('[data-agent-skill]'),
      [`${seeded.skill.name} ${seeded.skill.description}`],
      `${seeded.name}, given no skills, says what it can do in one entry made from itself: its name and its description, its tag left to its page`,
    );
    await expectVisible(says(scribe, seeded.skill).getByText(seeded.skill.description, { exact: true }), 'with what it is for');
    const implementer = card(page, 'repo', good.agent.name);
    await expectVisible(
      implementer
        .getByRole('img', { name: good.agent.person, exact: true })
        .and(implementer.locator(`svg[data-agent-face="${good.agent.name}"]`)),
      `${good.agent.name}'s face, a drawing its eyes can move in, named ${good.agent.person}`,
    );
    await expectTexts(
      implementer.locator('[data-agent-role]'),
      [`${good.agent.role} · ${good.agent.name}`],
      `${good.agent.person} holds the job its role line says, beside the name a node gives it`,
    );
    await expectVisible(
      says(implementer, good.agent.skill).getByText(good.agent.skill.name, { exact: true }),
      `${good.agent.name} says what it can do too, its skill's title as the entry's name`,
    );
    await expectCount(page.locator('[data-card-error]'), 0, 'and every card is made');
    const node = implementer.locator(`[data-used-by] a[data-node="${good.name}/implement"]`);
    await expectVisible(node, `${good.agent.name} links the node that names it, ${good.name} › implement`);
    if ((await node.getAttribute('href')) !== `/workflows/repo/${good.name}/implement`)
      throw new Refused(`the node's link is its step's page — it is ${await node.getAttribute('href')}`);

    await node.click();
    await page.waitForURL((url) => url.pathname === `/workflows/repo/${good.name}/implement`, { timeout: WAIT_MS });
    await page.goBack({ waitUntil: 'load' });
    await idle(page);
    await expectCount(
      implementer.getByRole('link', { name: good.agent.person, exact: true }),
      1,
      `${good.agent.person}'s card holds one link to its page, its name`,
    );
    const role = await implementer.locator('[data-agent-role]').boundingBox();
    if (!role) throw new Refused(`${good.agent.person}'s role line is laid out`);
    await page.mouse.click(role.x + role.width / 2, role.y + role.height / 2);
    await page.waitForURL((url) => url.pathname === agentPath('repo', good.agent.name), { timeout: WAIT_MS });
    const repoForm = page.locator(`form[data-agent-form="${good.agent.name}"]`);
    await expectVisible(repoForm, `${good.agent.name}'s form`);
    if ((await repoForm.getByRole('textbox', { name: 'Model' }).inputValue()) !== 'opus')
      throw new Refused(`${good.agent.name}'s model reads opus, as its file sets it`);
    for (const field of ['Name', 'Model']) {
      if ((await repoForm.getByRole('textbox', { name: field }).getAttribute('readonly')) === null)
        throw new Refused(`the repository's agent is read-only: its ${field} is not`);
    }
    const read = repoForm.getByRole('region', { name: 'Instructions', exact: true });
    await expectCount(repoForm.getByRole('textbox', { name: 'Instructions' }), 0, 'its instructions are read, not a box to type in');
    await expectVisible(read.locator('[data-markdown] h4', { hasText: 'How you work' }), 'its instructions, read as markdown');
    await expectVisible(read.locator('[data-markdown] strong', { hasText: 'test' }), 'its bold drawn bold');
    await expectCount(read.locator('[data-markdown] li'), 2, 'its list drawn as one');
    await expectCount(read.getByText('**', { exact: false }), 0, 'and no mark printed as it is written');
    await photograph(read, path.join(OUT, `agents-repo-instructions-${await themeOf(page)}.png`));
    await expectCount(repoForm.getByRole('button', { name: 'Save' }), 0, 'and it offers no Save');
    await expectVisible(
      repoForm.locator(`[data-card] [data-agent-skill="${good.agent.skill.id}"]`).getByText(good.agent.skill.description, { exact: true }),
      'its form shows its card, generated from its skill',
    );
    for (const tag of good.agent.skill.tags)
      await expectVisible(
        repoForm.locator(`[data-card] [data-agent-skill="${good.agent.skill.id}"]`).getByText(tag, { exact: true }),
        `with the skill's tag ${tag}, which the card on the list leaves to this page`,
      );
    await expectCount(page.getByRole('button', { name: 'Remove…' }), 0, 'nor Remove');
    await expectVisible(
      page.locator('[data-read-only]', {
        hasText: `mkdir -p '${agentsDir}' && cp '${path.join(store!, 'checkout', 'workflows', 'agents', `${good.agent.name}.md`)}' '${agentsDir}/'`,
      }),
      "and says how to start one of yours from it, in the api's line: into your store's agents folder, absolute",
    );
    const file = page.locator('section[aria-label="The file"]');
    await file.getByRole('button', { name: 'Source' }).click();
    const shown = await file.locator('pre[data-source]').textContent();
    const onDisk = fs.readFileSync(path.join(store!, 'checkout', 'workflows', 'agents', `${good.agent.name}.md`), 'utf8');
    if (shown !== onDisk) throw new Refused(`Source is the agent's file byte for byte — it shows ${JSON.stringify(shown)}`);
    await file.getByRole('button', { name: 'Source' }).click();
    await settled(page);
    await photograph(page, path.join(OUT, `agents-repo-${await themeOf(page)}.png`), { fullPage: true });

    await page.locator(`[data-used-by] a[data-node="${good.name}/implement"]`).click();
    await page.waitForURL((url) => url.pathname === `/workflows/repo/${good.name}/implement`, { timeout: WAIT_MS });
    const back = page.locator(`[data-step-agent] a[data-agent-link="${good.agent.name}"]`);
    await expectVisible(back, `implement's page names its agent, ${good.agent.name}, as a link`);
    const small = `[data-step-agent] svg[data-agent-face="${good.agent.name}"]`;
    await expectVisible(
      page.locator('[data-step-agent]').getByRole('img', { name: good.agent.person, exact: true }).and(page.locator(small)),
      `and its small face beside the link is a drawing, named ${good.agent.person}`,
    );
    await expectAlive(page, small, `${good.agent.person}, beside the link,`);
    await expectVisible(
      page.locator(`[data-agent-skill="${good.agent.skill.id}"]`).getByText(good.agent.skill.description, { exact: true }),
      `and what that agent says it can do, beneath it: ${good.agent.skill.name}`,
    );
    await back.click();
    await page.waitForURL((url) => url.pathname === agentPath('repo', good.agent.name), { timeout: WAIT_MS });

    await page.goto(new URL(agentPath('yours', seeded.name), page.url()).href, { waitUntil: 'load' });
    await idle(page);
    const scribeForm = page.locator(`form[data-agent-form="${seeded.name}"]`);
    await expectVisible(scribeForm, `${seeded.name}'s form`);
    if ((await scribeForm.getByRole('textbox', { name: 'Schema file' }).inputValue()) !== seeded.keys.output)
      throw new Refused(`${seeded.name}'s result schema is ${seeded.keys.output}, read from the file its output: names`);
    if ((await scribeForm.getByRole('textbox', { name: 'Its fields' }).inputValue()) !== `${seeded.schema}\n`)
      throw new Refused(
        `and its fields are the schema's text — it shows ${JSON.stringify(await scribeForm.getByRole('textbox', { name: 'Its fields' }).inputValue())}`,
      );
    await expectTexts(
      scribeForm.locator('[data-card] [data-agent-skill]'),
      [`${seeded.skill.name} ${seeded.skill.description}${seeded.skill.tags.join('')}`],
      `${seeded.name}'s form shows its card, one entry made from its description, and its tag`,
    );
    await expectVisible(
      scribeForm.locator('[data-card]', { hasText: 'Generated from its skills' }),
      'and says it is generated from its skills',
    );
    for (const gone of ['Card file', 'Its card'])
      await expectCount(scribeForm.getByRole('textbox', { name: gone }), 0, `and has no ${gone} field`);
    await expectVisible(scribeForm.locator('[data-given-none]'), `${seeded.name} gives its sessions no skills, and its list says so`);
    const instructions = await scribeForm.getByRole('textbox', { name: 'Instructions' }).inputValue();
    if (instructions.trim() !== seeded.body)
      throw new Refused(`and its instructions are its body — they read ${JSON.stringify(instructions)}`);
    await expectVisible(scribeForm.getByRole('button', { name: 'Save' }), 'yours offers Save');
    if (!(await scribeForm.getByRole('button', { name: 'Save' }).isDisabled())) throw new Refused('Save waits for a change');

    const madeFile = path.join(agentsDir, `${made.name}.md`);
    try {
      await page.goto(new URL('/agents', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      await page.getByRole('link', { name: 'New agent' }).click();
      await page.waitForURL((url) => url.pathname === '/agents/new', { timeout: WAIT_MS });
      const form = page.getByRole('form', { name: 'New agent' });
      await form.getByRole('textbox', { name: 'Name' }).fill(made.name);
      await form.getByRole('textbox', { name: 'Description' }).fill(made.description);
      await form.getByRole('textbox', { name: 'Model' }).fill(made.model);
      await form.getByRole('textbox', { name: 'Tools', exact: true }).fill(made.tools);
      await form.getByRole('textbox', { name: 'MCP servers' }).fill('fixture');
      await form.getByRole('button', { name: 'Add a skill' }).click();
      const sheet = page.getByRole('dialog', { name: 'Add a skill' });
      await sheet
        .locator('section[aria-label="Your library"]')
        .getByRole('button', { name: `Add ${made.skills}`, exact: true })
        .click();
      await expectVisible(
        sheet.locator(`[data-offered-skill="${made.skills}"]`, { hasText: 'given' }),
        `${made.skills} is given once added`,
      );
      await sheet.getByRole('button', { name: 'Close', exact: true }).click();
      await expectCount(sheet, 0, 'the sheet closes');
      await expectVisible(
        form.locator(`[data-given-skill="${made.skills}"] [data-skill-from="yours"]`),
        `${made.skills} is given, from your library`,
      );
      await expectVisible(
        form.locator('[data-card-generated]', { hasText: 'Shown once it is saved.' }),
        'a new agent has no card to show until it is saved, and no field to write one',
      );
      await expectCount(form.getByRole('textbox', { name: 'Its card' }), 0, 'no card is pasted');
      await form.getByRole('textbox', { name: 'Instructions' }).fill(made.body);
      await settled(page);
      await photograph(page, path.join(OUT, `agents-new-${await themeOf(page)}.png`), { fullPage: true });
      const [created] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/agents/yours', {
          timeout: WAIT_MS,
        }),
        form.getByRole('button', { name: 'Create agent' }).click(),
      ]);
      if (created.status() !== 201) throw new Refused(`the api makes the agent — it answered ${created.status()}: ${await created.text()}`);
      await page.waitForURL((url) => url.pathname === agentPath('yours', made.name), { timeout: WAIT_MS });
      const written = `---\ndescription: ${made.description}\nskills: ${made.skills}\nmcp: fixture\nmodel: ${made.model}\ntools: ${made.tools}\n---\n${made.body}\n`;
      if (!fs.existsSync(madeFile) || fs.readFileSync(madeFile, 'utf8') !== written)
        throw new Refused(
          `agents/${made.name}.md is written as the package writes an agent — it holds ${fs.existsSync(madeFile) ? JSON.stringify(fs.readFileSync(madeFile, 'utf8')) : 'nothing'}`,
        );
      if (filesIn(agentsDir).some(([name]) => name.endsWith('.skills.json')))
        throw new Refused(
          `no card file is written beside ${made.name}: ${agentsDir} holds ${filesIn(agentsDir)
            .map(([n]) => n)
            .join(', ')}`,
        );
      const entry = page.locator(`[data-card] [data-agent-skill="${made.skill.id}"]`);
      await expectVisible(
        entry.getByText(made.skill.name, { exact: true }),
        `and the page of ${made.name} says what it can do: ${made.skill.name}, the title of the skill it gives, read off its SKILL.md`,
      );
      await expectVisible(entry.getByText(made.skill.description, { exact: true }), 'with what that skill is for');
      for (const tag of made.skill.tags) await expectVisible(entry.getByText(tag, { exact: true }), `and its tag ${tag}`);

      const madeForm = page.locator(`form[data-agent-form="${made.name}"]`);
      await expectVisible(madeForm, `the page of ${made.name}, made`);
      const servers = await madeForm.getByRole('textbox', { name: 'MCP servers' }).inputValue();
      if (servers !== 'fixture')
        throw new Refused(`the MCP servers it names are read back as written — they read ${JSON.stringify(servers)}`);
      await madeForm.getByRole('textbox', { name: 'Model' }).fill(made.edited);
      const [saved] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/agents/yours/${made.name}`, {
          timeout: WAIT_MS,
        }),
        madeForm.getByRole('button', { name: 'Save' }).click(),
      ]);
      if (saved.status() !== 200) throw new Refused(`the api saves the agent — it answered ${saved.status()}: ${await saved.text()}`);
      const edited = written.replace(`model: ${made.model}`, `model: ${made.edited}`);
      if (fs.readFileSync(madeFile, 'utf8') !== edited)
        throw new Refused(`the edit is on disk — agents/${made.name}.md holds ${JSON.stringify(fs.readFileSync(madeFile, 'utf8'))}`);
      await expectVisible(
        madeForm.getByRole('button', { name: 'Save', disabled: true }),
        'once saved, the form is the agent as it now reads, and Save waits again',
      );
      await settled(page);
      await photograph(page, path.join(OUT, `agents-edit-${await themeOf(page)}.png`), { fullPage: true });

      await page.getByRole('button', { name: 'Remove…' }).click();
      await expectTexts(
        page.locator('[data-remove-asks] code'),
        [`agents/${made.name}.md`],
        'the ask names its file alone: it names no schema, and no card file goes with it',
      );
      const [removed] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === `/api/agents/yours/${made.name}`, {
          timeout: WAIT_MS,
        }),
        page.locator('[data-remove-asks]').getByRole('button', { name: 'Remove', exact: true }).click(),
      ]);
      if (removed.status() !== 200)
        throw new Refused(`the api removes the agent — it answered ${removed.status()}: ${await removed.text()}`);
      await page.waitForURL((url) => url.pathname === '/agents', { timeout: WAIT_MS });
      await expectCount(card(page, 'yours', made.name), 0, `${made.name} is gone from the list`);
      if (fs.existsSync(madeFile)) throw new Refused(`agents/${made.name}.md is removed from disk`);
    } finally {
      fs.rmSync(madeFile, { force: true });
    }

    const namingDir = path.join(store!, 'workflows', naming);
    fs.mkdirSync(namingDir, { recursive: true });
    fs.writeFileSync(path.join(namingDir, 'write.md'), `---\nplace: git\nagent: ${seeded.name}\n---\nWrite the notes.\n`);
    const refused = await page.context().newPage();
    try {
      const { problems } = watch(refused);
      await refused.goto(new URL(agentPath('yours', seeded.name), page.url()).href, { waitUntil: 'load' });
      await idle(refused);
      await expectVisible(
        refused.locator(`[data-used-by] a[data-node="${naming}/write"]`),
        `${seeded.name} is attached to ${naming} › write`,
      );
      await refused.getByRole('button', { name: 'Remove…' }).click();
      const [answered] = await Promise.all([
        refused.waitForResponse(
          (r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === `/api/agents/yours/${seeded.name}`,
          { timeout: WAIT_MS },
        ),
        refused.locator('[data-remove-asks]').getByRole('button', { name: 'Remove', exact: true }).click(),
      ]);
      const { error, users } = (await answered.json()) as { error?: string; users?: string[] };
      if (
        answered.status() !== 409 ||
        !error?.startsWith(`agents/${seeded.name}.md is named by a step beside it — ${naming}/write — `) ||
        JSON.stringify(users) !== JSON.stringify([`${naming}/write`])
      ) {
        throw new Refused(
          `the package refuses to remove an agent a node names — the api answered ${answered.status()}: ${JSON.stringify({ error, users })}`,
        );
      }
      const alert = refused.locator('[data-agent-refused]');
      await expectVisible(alert, 'the refusal is shown, not swallowed');
      const said = await alert.locator('p.font-mono').textContent();
      if (said !== error) throw new Refused(`the refusal is the package's sentence, verbatim — it shows ${JSON.stringify(said)}`);
      await expectVisible(alert.locator(`a[data-node="${naming}/write"]`), 'with the node that names it, linked');
      if (JSON.stringify(filesIn(agentsDir)) !== JSON.stringify(before))
        throw new Refused(`nothing is removed on a refusal — ${agentsDir} changed`);
      await settled(refused);
      await photograph(refused, path.join(OUT, `agents-refused-${await themeOf(refused)}.png`), { fullPage: true });
      await idle(refused);
      const expected = `request answered 409: DELETE ${answered.url()}`;
      const seen = problems();
      const others = seen.filter(
        (p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 409\b/.test(p),
      );
      if (!seen.includes(expected) || others.length)
        throw new Refused(`the refused page saw its one refusal and nothing else — it saw:\n    ${seen.join('\n    ')}`);
    } finally {
      fs.rmSync(namingDir, { recursive: true, force: true });
      await refused.close();
    }
    await page.reload({ waitUntil: 'load' });
    await idle(page);
    await expectTexts(
      card(page, 'yours', seeded.name).locator('[data-used-by]'),
      ['No node names it yet.'],
      `back on the list, no node names ${seeded.name} again`,
    );
    if (JSON.stringify(filesIn(agentsDir)) !== JSON.stringify(before))
      throw new Refused(
        `the page puts the store back — ${agentsDir} holds ${filesIn(agentsDir)
          .map(([n]) => n)
          .join(', ')}`,
      );
  },
} satisfies PageSpec;
