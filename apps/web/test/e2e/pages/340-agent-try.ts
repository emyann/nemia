import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { fed, photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, WAIT_MS } from '../checks.ts';
import { AGENTS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** A path as a regular expression matches it, character for character. */
const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The brief the page tries `scribe` on, and the file the try leaves in its folder. */
const TRY = {
  brief: 'Write the notes for a change that renames the --dry flag to --plan.',
  file: 'notes.md',
  text: '# Notes\n\n- `--dry` is now `--plan`.\n- Try `wf start --plan` first.\n',
  cost: 0.12,
  spent: '$0.12 of $1',
} as const;

const answered = (page: Page, method: 'POST' | 'DELETE', pathname: string) =>
  page.waitForResponse((r) => r.request().method() === method && new URL(r.url()).pathname === pathname, { timeout: WAIT_MS });

const goto = async (page: Page, to: string): Promise<void> => {
  await page.goto(new URL(to, page.url()).href, { waitUntil: 'load' });
  await idle(page);
};

/**
 * Writes into the e2e's store, which nothing ticks, the try `id` as a tick and the harness leave one that ran: its step filed in the folder
 * the run made for it, the session signed off at a cost the harness priced — flat, as a harness writes it, with the `notes` `scribe`'s
 * schema asks for, without which it reads unsigned — and a file written there.
 */
function ranTo(id: string): void {
  const record = path.join(store!, 'runs', `${id}.json`);
  const run = JSON.parse(fs.readFileSync(record, 'utf8')) as { workspace: string; steps: Record<string, unknown> };
  const cwd = path.join(run.workspace, 'try');
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(path.join(cwd, TRY.file), TRY.text);
  const at = new Date().toISOString();
  const task = `${id}-try`;
  const usage = {
    responses: 3,
    toolCalls: 4,
    inputTokens: 42_000,
    cacheReadTokens: 30_000,
    cacheWriteTokens: 11_000,
    uncachedTokens: 1_000,
    outputTokens: 900,
    costUsd: TRY.cost,
  };
  fs.writeFileSync(
    path.join(store!, 'engine', 'tasks', `${task}.jsonl`),
    [
      {
        kind: 'filed',
        at,
        brief: TRY.brief,
        cwd,
        maxAttempts: 1,
        harness: 'claude',
        config: { permissionMode: 'dontAsk', allowedTools: ['Edit(**)'] },
      },
      { kind: 'starting', at, attempt: 1 },
      { kind: 'spawned', at, attempt: 1 },
      {
        kind: 'ended',
        at,
        attempt: 1,
        sessionId: `ae/${task}/1`,
        observed: 'done',
        reason: 'harness',
        usage,
        closeout: { outcome: 'done', summary: 'Wrote the notes.', needs: null, artifacts: [path.join(cwd, TRY.file)], notes: TRY.text },
      },
      { kind: 'settled', at, outcome: 'succeeded' },
    ]
      .map((line) => `${JSON.stringify(line)}\n`)
      .join(''),
  );
  run.steps = { try: { taskId: task, workspace: cwd } };
  fs.writeFileSync(record, JSON.stringify(run, null, 2));
}

export default {
  /**
   * An agent of yours tried on a short brief, from its page. The repository's agent is not tried: its page says to copy it to yours, with
   * the copy, and has no Try button. `scribe`'s Try panel says in one line that a try is a rehearsal fenced to its own folder, holds Try it
   * until there is a brief, and starts the try: the store's hidden `tries/scribe` folder, written with the fence and a dollar, and a folder
   * run of it. While the try moves the button is held, and the Factory and Runs tag it `try`. Ran — as the tick and the harness would leave
   * it, said on the feed — the panel shows its state, what it spent of its dollar, the file it wrote and its run; that run's page tags it,
   * links the agent, and removes it, asked twice. The page takes back the try's record, folders and journal, and `tries/`, so each visit
   * reads the store as seeded.
   */
  name: 'agent-try',
  route: `/agents/repo/implementer`,
  expect: async (page) => {
    const { seeded } = AGENTS;
    const tries = path.join(store!, 'tries');
    if (fs.existsSync(tries)) throw new Refused(`the store has no tries/ before the page tries anything — ${tries} is there`);

    const yours = page.locator('section[data-try-yours]');
    await expectVisible(
      yours.getByText('Copy it to yours to try it', { exact: false }),
      "the repository's agent says to copy it to yours to try it",
    );
    const into = path.join(store!, 'workflows', 'agents');
    const copy = new RegExp(`^mkdir -p '${escaped(into)}' && cp '[^']+/implementer\\.md'( '[^']+')? '${escaped(into)}/'$`);
    await expectVisible(
      yours.locator('code', { hasText: copy }),
      `with the cp, as the api words it, that copies it into the store this api reads, ${into}, never a home the api may not read`,
    );
    await expectCount(page.getByRole('button', { name: 'Try it' }), 0, "the repository's agent has no Try button");
    await photograph(yours, path.join(OUT, `agent-try-yours-${await themeOf(page)}.png`));

    let id: string | undefined;
    try {
      await goto(page, `/agents/yours/${seeded.name}`);
      const panel = page.locator('section[data-try-agent]');
      await expectVisible(
        panel.locator('[data-try-fence]', { hasText: "A rehearsal fenced to its own folder, not the agent's own permissions" }),
        'the Try panel says what a try is, in one line',
      );
      const button = panel.getByRole('button', { name: 'Try it' });
      await expectVisible(
        panel.locator('[data-try-held]', { hasText: 'Write a brief to try it on.' }),
        'with no brief, Try it is held, and says why',
      );
      if (!(await button.isDisabled())) throw new Refused('Try it is held while the brief is empty');
      const brief = panel.getByRole('textbox', { name: 'Brief' });
      await brief.fill(TRY.brief);

      const [started] = await Promise.all([answered(page, 'POST', `/api/agents/yours/${seeded.name}/try`), button.click()]);
      const body = (await started.json()) as { id?: string; error?: string };
      if (started.status() !== 201 || !body.id)
        throw new Refused(`the api starts the try — it answered ${started.status()}: ${JSON.stringify(body)}`);
      id = body.id;

      const stepFile = fs.readFileSync(path.join(tries, seeded.name, 'try.md'), 'utf8').split('\n');
      for (const line of [
        'place: folder',
        `agent: ${seeded.name}`,
        'budget: 1',
        'claude:',
        '  fence:',
        '    permissionMode: dontAsk',
        '    allowedTools: Edit(**)',
      ]) {
        if (!stepFile.includes(line))
          throw new Refused(`tries/${seeded.name}/try.md says ${line} — it holds ${JSON.stringify(stepFile.join('\n'))}`);
      }
      const record = JSON.parse(fs.readFileSync(path.join(store!, 'runs', `${id}.json`), 'utf8')) as {
        workflowDir: string;
        repo?: string;
        place?: { kind: string };
      };
      if (record.workflowDir !== path.join(tries, seeded.name) || record.repo || record.place?.kind !== 'folder') {
        throw new Refused(
          `the try is a folder run of tries/${seeded.name}, with no repository — its record says ${JSON.stringify(record)}`,
        );
      }

      await expectVisible(panel.locator(`[data-try="${id}"]`), 'the panel shows the try it started');
      await expectVisible(panel.getByText('Not filed yet', { exact: false }), 'not filed yet, as nothing ticks the store');
      await brief.fill('A second brief, while the first moves.');
      await expectVisible(
        panel.locator('[data-try-held]', { hasText: `A try is still running (${id}): one at a time.` }),
        'a second try is held while the first moves',
      );
      if (!(await button.isDisabled())) throw new Refused('Try it is held while a try moves');
      await settled(page);
      await photograph(page, path.join(OUT, `agent-try-started-${await themeOf(page)}.png`), { fullPage: true });

      await goto(page, '/factories/default');
      await expectVisible(
        page.locator(`.react-flow__node[data-id="${id}"] [data-try-tag="${seeded.name}"]`),
        'the Factory, where a try in flight is on the floor, tags its card try',
      );
      await goto(page, '/runs');
      await expectVisible(
        page.locator(`[data-runs-page] [data-run="${id}"] a[href="/runs/${id}"]`).first(),
        'Runs draws the try as any run, a link to its page, where its tag is',
      );

      ranTo(id);
      fed(id, 'try', 'done');
      await goto(page, `/agents/yours/${seeded.name}`);
      const shown = panel.locator(`[data-try="${id}"]`);
      await expectVisible(shown.locator('[data-try-status]', { hasText: 'succeeded' }), 'the panel shows the state the try ended in');
      await expectVisible(shown.locator('[data-try-spent]', { hasText: TRY.spent }), `and what it spent of its dollar (${TRY.spent})`);
      await expectVisible(shown.locator('[data-try-files]', { hasText: TRY.file }), `and the file it wrote (${TRY.file})`);
      await brief.fill(TRY.brief);
      await expectCount(panel.locator('[data-try-held]'), 0, 'ended, another try may start');
      await settled(page);
      await photograph(page, path.join(OUT, `agent-try-ended-${await themeOf(page)}.png`), { fullPage: true });

      await shown.locator(`a[data-try-run="${id}"]`).click();
      await page.waitForURL((url) => url.pathname === `/runs/${id}`, { timeout: WAIT_MS });
      const header = page.locator('article header').first();
      await expectVisible(header.locator(`[data-try-tag="${seeded.name}"]`), "the try's page tags it try");
      await expectVisible(header.locator(`a[data-agent-link="${seeded.name}"]`), 'and links the agent it tried');
      await idle(page);
      await settled(page);
      await photograph(page, path.join(OUT, `agent-try-run-${await themeOf(page)}.png`), { fullPage: true });
      await header.getByRole('button', { name: 'Remove…' }).click();
      const [removed] = await Promise.all([
        answered(page, 'DELETE', `/api/runs/${id}`),
        header.getByRole('button', { name: 'Remove', exact: true }).click(),
      ]);
      if (removed.status() !== 200) throw new Refused(`the api removes the try — it answered ${removed.status()}: ${await removed.text()}`);
      await page.waitForURL((url) => url.pathname === '/runs', { timeout: WAIT_MS });
      await expectCount(page.locator(`a[href="/runs/${id}"]`), 0, 'removed, the try is off Runs');
      for (const gone of [path.join(store!, 'runs', `${id}.json`), path.join(store!, 'runs', id)]) {
        if (fs.existsSync(gone)) throw new Refused(`removed, the try leaves nothing under its id — ${gone} is there`);
      }
      await idle(page);
    } finally {
      if (id) {
        for (const at of [
          path.join(store!, 'runs', `${id}.json`),
          path.join(store!, 'runs', id),
          path.join(store!, 'engine', 'tasks', `${id}-try.jsonl`),
        ])
          fs.rmSync(at, { recursive: true, force: true });
      }
      fs.rmSync(tries, { recursive: true, force: true });
    }
  },
} satisfies PageSpec;
