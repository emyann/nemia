import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { filesIn, sidebar, themeOf } from '../board.ts';
import { expectCount, expectTexts, expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { AGENTS, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  // The agents beside the workflows: yours, which the board writes, and the repository's, read-only, each with the nodes that name it, linked.
  // Each card says what its agent can do, the skills its `card:` names in A2A's words. The repository's `implementer` read, and the node
  // that names it followed to its step's page, which shows the same skills and links back; `scribe`'s form read with its result schema and
  // its card, and no skills given; an agent made with a card pasted for it and a skill given by name, edited and removed, each on disk as the package writes it. And, in a page of its own, a removal refused
  // because a node still names the agent. Every write is taken back, so the next visit, in either theme, reads the store as seeded.
  name: 'agents',
  route: '/agents',
  expect: async (page) => {
    await sidebar(page);
    await expectVisible(page.locator('[data-sidebar="sidebar"] a[data-active="true"]', { hasText: 'Agents' }), 'the sidebar lights Agents on its page');
    const { good } = WORKFLOWS;
    const { seeded, made, naming } = AGENTS;
    const agentsDir = path.join(store!, 'workflows', 'agents');
    const before = filesIn(agentsDir);
    const card = (p: Page, from: string, name: string) => p.locator(`section[data-agent="${name}"][data-from="${from}"]`);
    const agentPath = (from: string, name: string) => `/agents/${from}/${name}`;

    const yours = page.locator('section[aria-label="Yours"]');
    const theirs = page.locator('section[aria-label="This repository"]');
    await expectCount(yours.locator('section[data-agent]'), 1, `yours lists one agent, ${seeded.name}`);
    await expectCount(theirs.locator('section[data-agent]'), 1, `the repository's lists one, ${good.agent.name}`);
    const scribe = card(page, 'yours', seeded.name);
    await expectVisible(scribe.getByText(seeded.description, { exact: true }), `${seeded.name} with its description`);
    await expectVisible(scribe.locator('dd', { hasText: /^sonnet$/ }), 'and the keys it sets');
    await expectTexts(scribe.locator('[data-used-by]'), ['No node names it yet.'], `and that no node names ${seeded.name}`);
    const says = (where: ReturnType<typeof card>, skill: { id: string; name: string; description: string; tags: readonly string[] }) => where.locator(`[data-agent-skill="${skill.id}"]`);
    await expectVisible(says(scribe, seeded.skill).getByText(seeded.skill.name, { exact: true }), `${seeded.name} says what it can do: ${seeded.skill.name}`);
    await expectVisible(says(scribe, seeded.skill).getByText(seeded.skill.description, { exact: true }), 'with what that skill is for');
    for (const tag of seeded.skill.tags) await expectVisible(says(scribe, seeded.skill).getByText(tag, { exact: true }), `and its tag ${tag}`);
    const implementer = card(page, 'repo', good.agent.name);
    await expectVisible(says(implementer, good.agent.skill).getByText(good.agent.skill.name, { exact: true }), `${good.agent.name} says what it can do too`);
    const node = implementer.locator(`[data-used-by] a[data-node="${good.name}/implement"]`);
    await expectVisible(node, `${good.agent.name} links the node that names it, ${good.name} › implement`);
    if ((await node.getAttribute('href')) !== `/workflows/repo/${good.name}/implement`) throw new Refused(`the node's link is its step's page — it is ${await node.getAttribute('href')}`);

    // The repository's agent, read-only: every field read and none written, no Save, and how to start one of yours from it.
    await implementer.getByRole('link', { name: good.agent.name, exact: true }).click();
    await page.waitForURL((url) => url.pathname === agentPath('repo', good.agent.name), { timeout: WAIT_MS });
    const repoForm = page.locator(`form[data-agent-form="${good.agent.name}"]`);
    await expectVisible(repoForm, `${good.agent.name}'s form`);
    if ((await repoForm.getByRole('textbox', { name: 'Model' }).inputValue()) !== 'opus') throw new Refused(`${good.agent.name}'s model reads opus, as its file sets it`);
    for (const field of ['Name', 'Model', 'Instructions']) {
      if ((await repoForm.getByRole('textbox', { name: field }).getAttribute('readonly')) === null) throw new Refused(`the repository's agent is read-only: its ${field} is not`);
    }
    await expectCount(repoForm.getByRole('button', { name: 'Save' }), 0, 'and it offers no Save');
    await expectCount(page.getByRole('button', { name: 'Remove…' }), 0, 'nor Remove');
    await expectVisible(page.locator('[data-read-only]', { hasText: `cp ${path.join(store!, 'checkout', 'workflows', 'agents', `${good.agent.name}.md`)} ~/.agent-workflows/workflows/agents/` }), 'and says how to start one of yours from it');
    const file = page.locator('section[aria-label="The file"]');
    await file.getByRole('button', { name: 'Source' }).click();
    const shown = await file.locator('pre[data-source]').textContent();
    const onDisk = fs.readFileSync(path.join(store!, 'checkout', 'workflows', 'agents', `${good.agent.name}.md`), 'utf8');
    if (shown !== onDisk) throw new Refused(`Source is the agent's file byte for byte — it shows ${JSON.stringify(shown)}`);
    await file.getByRole('button', { name: 'Source' }).click();
    await settled(page);
    await page.screenshot({ path: path.join(OUT, `agents-repo-${await themeOf(page)}.png`), fullPage: true });

    // Its node, followed: the step's page names the agent attached to it, linked back.
    await page.locator(`[data-used-by] a[data-node="${good.name}/implement"]`).click();
    await page.waitForURL((url) => url.pathname === `/workflows/repo/${good.name}/implement`, { timeout: WAIT_MS });
    const back = page.locator(`[data-step-agent] a[data-agent-link="${good.agent.name}"]`);
    await expectVisible(back, `implement's page names its agent, ${good.agent.name}, as a link`);
    await expectVisible(
      page.locator(`[data-agent-skill="${good.agent.skill.id}"]`).getByText(good.agent.skill.description, { exact: true }),
      `and what that agent says it can do, beneath it: ${good.agent.skill.name}`,
    );
    await back.click();
    await page.waitForURL((url) => url.pathname === agentPath('repo', good.agent.name), { timeout: WAIT_MS });

    // Yours: scribe's form, its result schema read from the file its output: names.
    await page.goto(new URL(agentPath('yours', seeded.name), page.url()).href, { waitUntil: 'load' });
    await idle(page);
    const scribeForm = page.locator(`form[data-agent-form="${seeded.name}"]`);
    await expectVisible(scribeForm, `${seeded.name}'s form`);
    if ((await scribeForm.getByRole('textbox', { name: 'Schema file' }).inputValue()) !== seeded.keys.output) throw new Refused(`${seeded.name}'s result schema is ${seeded.keys.output}`);
    if ((await scribeForm.getByRole('textbox', { name: 'Its fields' }).inputValue()) !== `${seeded.schema}\n`) throw new Refused(`and its fields are the schema's text — it shows ${JSON.stringify(await scribeForm.getByRole('textbox', { name: 'Its fields' }).inputValue())}`);
    if ((await scribeForm.getByRole('textbox', { name: 'Card file' }).inputValue()) !== seeded.card) throw new Refused(`${seeded.name}'s card is ${seeded.card}`);
    const said = await scribeForm.getByRole('textbox', { name: 'Its card' }).inputValue();
    if (said !== `${JSON.stringify([seeded.skill], null, 2)}\n`) throw new Refused(`and its card is that file's text — it shows ${JSON.stringify(said)}`);
    if ((await scribeForm.getByRole('textbox', { name: 'Skills', exact: true }).inputValue()) !== '') throw new Refused(`${seeded.name} gives its sessions no skills, and its Skills field is empty`);
    const instructions = await scribeForm.getByRole('textbox', { name: 'Instructions' }).inputValue();
    if (instructions.trim() !== seeded.body) throw new Refused(`and its instructions are its body — they read ${JSON.stringify(instructions)}`);
    await expectVisible(scribeForm.getByRole('button', { name: 'Save' }), 'yours offers Save');
    if (!(await scribeForm.getByRole('button', { name: 'Save' }).isDisabled())) throw new Refused('Save waits for a change');

    // Made: the form, filled, creates agents/<name>.md as the package writes it, and opens its page.
    const madeFile = path.join(agentsDir, `${made.name}.md`);
    const madeSkills = path.join(agentsDir, `${made.name}.skills.json`);
    const pasted = JSON.stringify([made.skill], null, 2);
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
      await form.getByRole('textbox', { name: 'Skills', exact: true }).fill(made.skills);
      await form.getByRole('textbox', { name: 'Its card' }).fill(pasted);
      await form.getByRole('textbox', { name: 'Instructions' }).fill(made.body);
      await settled(page);
      await page.screenshot({ path: path.join(OUT, `agents-new-${await themeOf(page)}.png`), fullPage: true });
      const [created] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/agents/yours', { timeout: WAIT_MS }),
        form.getByRole('button', { name: 'Create agent' }).click(),
      ]);
      if (created.status() !== 201) throw new Refused(`the api makes the agent — it answered ${created.status()}: ${await created.text()}`);
      await page.waitForURL((url) => url.pathname === agentPath('yours', made.name), { timeout: WAIT_MS });
      const written = `---\ndescription: ${made.description}\ncard: ${made.name}.skills.json\nskills: ${made.skills}\nmodel: ${made.model}\ntools: ${made.tools}\n---\n${made.body}\n`;
      if (!fs.existsSync(madeFile) || fs.readFileSync(madeFile, 'utf8') !== written) throw new Refused(`agents/${made.name}.md is written as the package writes an agent — it holds ${fs.existsSync(madeFile) ? JSON.stringify(fs.readFileSync(madeFile, 'utf8')) : 'nothing'}`);
      // Pasted with no file named, the card is written beside the agent, to the name the form suggested.
      if (!fs.existsSync(madeSkills) || fs.readFileSync(madeSkills, 'utf8') !== pasted) throw new Refused(`agents/${made.name}.skills.json holds what was pasted — it holds ${fs.existsSync(madeSkills) ? JSON.stringify(fs.readFileSync(madeSkills, 'utf8')) : 'nothing'}`);
      await expectVisible(page.locator(`[data-agent-skill="${made.skill.id}"]`), `and the page of ${made.name} says what it can do`);

      // Edited: its model changed and saved, against the version it was read at.
      const madeForm = page.locator(`form[data-agent-form="${made.name}"]`);
      await expectVisible(madeForm, `the page of ${made.name}, made`);
      await madeForm.getByRole('textbox', { name: 'Model' }).fill(made.edited);
      const [saved] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'PUT' && new URL(r.url()).pathname === `/api/agents/yours/${made.name}`, { timeout: WAIT_MS }),
        madeForm.getByRole('button', { name: 'Save' }).click(),
      ]);
      if (saved.status() !== 200) throw new Refused(`the api saves the agent — it answered ${saved.status()}: ${await saved.text()}`);
      const edited = written.replace(`model: ${made.model}`, `model: ${made.edited}`);
      if (fs.readFileSync(madeFile, 'utf8') !== edited) throw new Refused(`the edit is on disk — agents/${made.name}.md holds ${JSON.stringify(fs.readFileSync(madeFile, 'utf8'))}`);
      await expectVisible(madeForm.getByRole('button', { name: 'Save', disabled: true }), 'once saved, the form is the agent as it now reads, and Save waits again');
      await settled(page);
      await page.screenshot({ path: path.join(OUT, `agents-edit-${await themeOf(page)}.png`), fullPage: true });

      // Removed: asked twice, then gone from disk and from the list.
      await page.getByRole('button', { name: 'Remove…' }).click();
      await expectVisible(page.locator('[data-remove-asks]', { hasText: `${made.name}.skills.json` }), 'the ask names the file beside it that goes with it');
      const [removed] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === `/api/agents/yours/${made.name}`, { timeout: WAIT_MS }),
        page.locator('[data-remove-asks]').getByRole('button', { name: 'Remove', exact: true }).click(),
      ]);
      if (removed.status() !== 200) throw new Refused(`the api removes the agent — it answered ${removed.status()}: ${await removed.text()}`);
      await page.waitForURL((url) => url.pathname === '/agents', { timeout: WAIT_MS });
      await expectCount(card(page, 'yours', made.name), 0, `${made.name} is gone from the list`);
      if (fs.existsSync(madeSkills)) throw new Refused(`the card of ${made.name} goes with it: agents/${made.name}.skills.json is still there`);
    } finally {
      for (const gone of [madeFile, madeSkills]) fs.rmSync(gone, { force: true });
    }

    // Refused, in a page of its own whose one refusal is the point: scribe removed while a node of yours names it. The package's sentence,
    // word for word, with the node linked, and nothing removed.
    const namingDir = path.join(store!, 'workflows', naming);
    fs.mkdirSync(namingDir, { recursive: true });
    fs.writeFileSync(path.join(namingDir, 'write.md'), `---\nagent: ${seeded.name}\n---\nWrite the notes.\n`);
    const refused = await page.context().newPage();
    try {
      const { problems } = watch(refused);
      await refused.goto(new URL(agentPath('yours', seeded.name), page.url()).href, { waitUntil: 'load' });
      await idle(refused);
      await expectVisible(refused.locator(`[data-used-by] a[data-node="${naming}/write"]`), `${seeded.name} is attached to ${naming} › write`);
      await refused.getByRole('button', { name: 'Remove…' }).click();
      const [answered] = await Promise.all([
        refused.waitForResponse((r) => r.request().method() === 'DELETE' && new URL(r.url()).pathname === `/api/agents/yours/${seeded.name}`, { timeout: WAIT_MS }),
        refused.locator('[data-remove-asks]').getByRole('button', { name: 'Remove', exact: true }).click(),
      ]);
      const { error, users } = (await answered.json()) as { error?: string; users?: string[] };
      if (answered.status() !== 409 || !error?.startsWith(`agents/${seeded.name}.md is named by a step beside it — ${naming}/write — `) || JSON.stringify(users) !== JSON.stringify([`${naming}/write`])) {
        throw new Refused(`the package refuses to remove an agent a node names — the api answered ${answered.status()}: ${JSON.stringify({ error, users })}`);
      }
      const alert = refused.locator('[data-agent-refused]');
      await expectVisible(alert, 'the refusal is shown, not swallowed');
      const said = await alert.locator('p.font-mono').textContent();
      if (said !== error) throw new Refused(`the refusal is the package's sentence, verbatim — it shows ${JSON.stringify(said)}`);
      await expectVisible(alert.locator(`a[data-node="${naming}/write"]`), 'with the node that names it, linked');
      if (JSON.stringify(filesIn(agentsDir)) !== JSON.stringify(before)) throw new Refused(`nothing is removed on a refusal — ${agentsDir} changed`);
      await settled(refused);
      await refused.screenshot({ path: path.join(OUT, `agents-refused-${await themeOf(refused)}.png`), fullPage: true });
      await idle(refused);
      const expected = `request answered 409: DELETE ${answered.url()}`;
      const seen = problems();
      const others = seen.filter((p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 409\b/.test(p));
      if (!seen.includes(expected) || others.length) throw new Refused(`the refused page saw its one refusal and nothing else — it saw:\n    ${seen.join('\n    ')}`);
    } finally {
      // Removed before the page closes: the list, focused again, reads the store once more, and must read it as seeded.
      fs.rmSync(namingDir, { recursive: true, force: true });
      await refused.close();
    }
    await page.reload({ waitUntil: 'load' });
    await idle(page);
    await expectTexts(card(page, 'yours', seeded.name).locator('[data-used-by]'), ['No node names it yet.'], `back on the list, no node names ${seeded.name} again`);
    if (JSON.stringify(filesIn(agentsDir)) !== JSON.stringify(before)) throw new Refused(`the page puts the store back — ${agentsDir} holds ${filesIn(agentsDir).map(([n]) => n).join(', ')}`);
  },
} satisfies PageSpec;
