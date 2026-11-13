import { openFold, partOf, sidebar } from '../board.ts';
import { expectCount, expectVisible, Refused, settled, WAIT_MS } from '../checks.ts';
import { FOLDER } from '../seed.ts';
import type { PageSpec } from '../visit.ts';

/** A word about git, which nothing on a folder run's page may say: it has no repository, no branch and nothing to merge. */
const GIT_WORD = /\b(branch|base|merge|merged|merging|diff|commit|committed|worktree|repository|repo|git)\b/i;

export default {
  /**
   * A run that worked in folders, with no repository: its facts say where its work is, copyable; the Decide section says what `wf decide`
   * says of such a run, and offers the one command it offers; every step says the mode it ran in, unmarked, since every step of a folder
   * team runs in dontAsk; each step lists every file its folder holds, each with its size, served as text and never
   * cached, and says its place (`place: folder`). Nowhere on the page is there a word about git: the run's brief, summaries and verdict say
   * none either (`seedFolder`), so a word found there comes from the board.
   */
  name: 'folder',
  route: `/runs/${FOLDER.id}`,
  expect: async (page) => {
    await sidebar(page);
    const article = page.locator('article').first();

    const where = await openFold(article.locator('section[aria-label="Receipts"]'), 'where');
    const work = where.locator('[data-path]', { hasText: `/runs/${FOLDER.id}/work` }).first();
    await expectVisible(
      work,
      `the run's receipt of where it ran says where its work is (runs/${FOLDER.id}/work), where a repository run's say repo, base and branch`,
    );
    await expectCount(work.locator('button[data-copy]'), 1, 'and a button that copies the path');

    const decide = (await openFold(page.locator('[data-asks]'), 'decide')).locator('section[aria-label="Decide"]');
    await expectVisible(decide.locator('[data-in-folders]'), 'the Decide section says the run worked in folders, with nothing to merge');
    await expectVisible(
      decide.locator(`[data-command="forget it"] code`, { hasText: FOLDER.forget }),
      `forget it: ${FOLDER.forget}, as a line to copy`,
    );
    await expectCount(decide.locator('[data-command]'), 1, 'and nothing else is offered: no branch to land, and none to drop');

    for (const step of FOLDER.steps) await openFold(await openFold(partOf(page, step), 'detail'), 'spec');
    const mode = article.locator('[data-fact="permission mode"] dd').first();
    await expectVisible(
      mode.getByText('dontAsk', { exact: true }),
      'a step of a folder team says the mode it ran in (dontAsk), the one mode that never asks',
    );
    await expectCount(
      mode.locator('[data-mark]'),
      0,
      'and it is marked neither default nor this try: the run filed the mode the workflow says',
    );

    for (const step of FOLDER.steps) {
      const section = partOf(page, step).locator('[data-part-detail]');
      await expectVisible(
        section.locator('[data-path]', { hasText: `/work/write` }),
        `${step}'s facts say the folder it worked in, where a git step's say its branch`,
      );
      await expectVisible(
        section.locator('[data-fact="place"] dd').getByText('folder', { exact: true }),
        `${step}'s facts say place: folder — the seed froze its former spelling, workspace: folder, which reads as the key`,
      );
      const files = section.locator('[aria-label="Files"]');
      await expectVisible(
        files.locator('a[data-opens-view]', { hasText: FOLDER.note }),
        `${step} lists ${FOLDER.note}, which the folder holds, opening its viewer`,
      );
      await expectVisible(
        files.locator('a[data-opens-view]', { hasText: FOLDER.outline }),
        `${step} lists ${FOLDER.outline}, which no closeout named`,
      );
      await expectCount(files.locator('[data-artifact="text"]'), 2, `${step}'s folder holds two files, and the page lists both`);
      await expectVisible(files.getByText(/· \d+ B$/).first(), `${step}'s files carry their sizes`);
    }

    const note = article.locator(`[aria-label="Files"] a[data-opens-view]`, { hasText: FOLDER.note }).first();
    const [served] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === 'GET' && decodeURIComponent(new URL(r.url()).pathname).endsWith(`/${FOLDER.note}`),
        {
          timeout: WAIT_MS,
        },
      ),
      note.click(),
    ]);
    await expectVisible(
      page.locator('[data-viewer-sheet] [data-viewer="markdown"]', { hasText: FOLDER.line }),
      `a press on ${FOLDER.note} opens it in the viewer's sheet, drawn as markdown`,
    );
    const headers = served.headers();
    if (served.status() !== 200 || !headers['content-type']?.startsWith('text/plain') || headers['cache-control'] !== 'no-store') {
      throw new Refused(
        `the api serves ${FOLDER.note} as text, never cached — it answered ${served.status()}, ${headers['content-type']}, cache-control ${headers['cache-control']}`,
      );
    }
    const body = await served.text();
    if (!body.includes(FOLDER.line))
      throw new Refused(`the api serves what ${FOLDER.note} holds — it answered ${JSON.stringify(body.slice(0, 120))}`);
    await page.goBack();
    await expectCount(page.locator('[data-viewer-sheet]'), 0, 'Back closes the sheet');
    const said = (await article.innerText()).replace(/\s+/g, ' ');
    const met = GIT_WORD.exec(said);
    if (met)
      throw new Refused(
        `a folder run's page says no word about git, and its seeded brief, summaries and verdict say none, so this one comes from the board — it says '${met[0]}': …${said.slice(Math.max(0, met.index - 60), met.index + 60)}…`,
      );
    await settled(page);
  },
} satisfies PageSpec;
