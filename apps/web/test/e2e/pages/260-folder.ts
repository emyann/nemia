import { sidebar } from '../board.ts';
import { expectCount, expectVisible, Refused, settled } from '../checks.ts';
import { FOLDER } from '../seed.ts';
import type { PageSpec } from '../visit.ts';

/** A word about git, which nothing on a folder run's page may say: it has no repository, no branch and nothing to merge. */
const GIT_WORD = /\b(branch|base|merge|merged|merging|diff|commit|committed|worktree|repository|repo|git)\b/i;

export default {
  name: 'folder',
  route: `/runs/${FOLDER.id}`,
  expect: async (page) => {
    await sidebar(page);
    const article = page.locator('article');

    // Where a git run's page says repo, base and branch, a folder run says the one thing a person needs: where its work is, copyable.
    const work = article.locator('section [data-path]', { hasText: `/runs/${FOLDER.id}/work` }).first();
    await expectVisible(work, `the run's facts say where its work is (runs/${FOLDER.id}/work)`);
    await expectCount(work.locator('button[data-copy]'), 1, 'and a button that copies the path');

    // What `wf decide` says of such a run, and the one command it offers.
    const decide = page.locator('section[aria-label="Decide"]');
    await expectVisible(decide.locator('[data-in-folders]'), 'the Decide section says the run worked in folders, with nothing to merge');
    await expectVisible(decide.locator(`[data-command="forget it"] code`, { hasText: FOLDER.forget }), `forget it: ${FOLDER.forget}, as a line to copy`);
    await expectCount(decide.locator('[data-command]'), 1, 'and nothing else is offered: no branch to ship, and none to drop');

    // Every step of a folder team runs in the one mode that never asks (`validateFolderMode`), and its rows say the mode it ran in,
    // unmarked: the workflow's word and what the engine filed are the same.
    const mode = article.locator('[data-fact="permission mode"] dd').first();
    await expectVisible(mode.getByText('dontAsk', { exact: true }), 'a step of a folder team says the mode it ran in (dontAsk)');
    await expectCount(mode.locator('[data-mark]'), 0, 'and it is marked neither default nor this try: the run filed the mode the workflow says');

    // Each step's folder where a git step's branch goes, and every file the folder holds — the note the closeout named, and the
    // outline it did not — each with its size.
    for (const step of FOLDER.steps) {
      const section = article.locator('> section', { has: page.getByRole('heading', { level: 2, name: step, exact: true }) });
      await expectVisible(section.locator('[data-path]', { hasText: `/work/write` }), `${step}'s facts say the folder it worked in`);
      const files = section.locator('[aria-label="Files"]');
      await expectVisible(files.locator('a[target="_blank"]', { hasText: FOLDER.note }), `${step} lists ${FOLDER.note}, which the folder holds`);
      await expectVisible(files.locator('a[target="_blank"]', { hasText: FOLDER.outline }), `${step} lists ${FOLDER.outline}, which no closeout named`);
      await expectCount(files.locator('[data-artifact="text"]'), 2, `${step}'s folder holds two files, and the page lists both`);
      await expectVisible(files.getByText(/· \d+ B$/).first(), `${step}'s files carry their sizes`);
    }

    // The note opens in a tab of its own, as the api serves it: an agent's text, never cached.
    const note = article.locator(`[aria-label="Files"] a[target="_blank"]`, { hasText: FOLDER.note }).first();
    const served = await page.request.get(new URL((await note.getAttribute('href')) ?? '', page.url()).href);
    const headers = served.headers();
    if (served.status() !== 200 || !headers['content-type']?.startsWith('text/plain') || headers['cache-control'] !== 'no-store') {
      throw new Refused(`the api serves ${FOLDER.note} as text, never cached — it answered ${served.status()}, ${headers['content-type']}, cache-control ${headers['cache-control']}`);
    }
    const body = await served.text();
    if (!body.includes(FOLDER.line)) throw new Refused(`the api serves what ${FOLDER.note} holds — it answered ${JSON.stringify(body.slice(0, 120))}`);

    // And nowhere on the page, in any of it, a word about git: a person reading a folder run never meets one. The run's own
    // brief, its summaries and its verdict say none either (`seedFolder`), so a word found here came from the board.
    const said = (await article.innerText()).replace(/\s+/g, ' ');
    const met = GIT_WORD.exec(said);
    if (met) throw new Refused(`a folder run's page says '${met[0]}': …${said.slice(Math.max(0, met.index - 60), met.index + 60)}…`);
    await settled(page);
  },
} satisfies PageSpec;
