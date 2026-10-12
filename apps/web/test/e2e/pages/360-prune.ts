import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { fed, photograph, themeOf } from '../board.ts';
import { cardOf, expectClearOfEachOther, photographCard } from '../canvas.ts';
import { expectCount, expectVisible, idle, Refused, settled } from '../checks.ts';
import { UNMERGED } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  /**
   * A finished run pruned on the board, as `wf prune <run> --unmerged --artifacts --yes` prunes it (`POST /api/runs/:id/prune`): UNMERGED,
   * its branch ahead of main and nobody has merged it, given a worktree on that branch and a file in its files directory for the visit. Its
   * page offers three choices, the first two unavailable since nobody merged it, and the third said plainly as leaving its branch the only
   * copy of its work; the prune is asked twice. Then the worktree and the files are gone, the branch stays, and the run's page and its card
   * on the Factory say pruned; its row on Runs stays, and says how it ended alone. What the api refuses — a run not over, one already
   * pruned, one nobody merged without the third choice — is proven in its own tests
   * (`apps/api/src/runs/prune.test.ts`), since the e2e's watch counts every 4xx.
   */
  name: 'prune',
  route: '/factories/default',
  expect: async (page) => {
    const { id, branch } = UNMERGED;
    const record = JSON.parse(fs.readFileSync(path.join(store!, 'runs', `${id}.json`), 'utf8')) as {
      repo: string;
      steps: { implement: { workspace: string } };
    };
    const lane = record.steps.implement.workspace;
    const files = path.join(store!, 'runs', id, 'artifacts');
    const marker = path.join(store!, 'runs', `${id}.pruned`);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: record.repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const theme = await themeOf(page);

    try {
      if (fs.existsSync(marker) || fs.existsSync(lane) || fs.existsSync(files))
        throw new Refused(`${id} is seeded unpruned, with no worktree and no files`);
      git('worktree', 'add', '-q', lane, branch);
      fs.mkdirSync(path.join(files, 'implement'), { recursive: true });
      fs.writeFileSync(path.join(files, 'implement', 'queue.md'), "# The queue\n\nDrawn at the floor's left edge.\n");
      fed(id, 'implement', 'done');

      await page.goto(new URL(`/runs/${id}`, page.url()).href, { waitUntil: 'load' });
      await idle(page);
      const open = page.locator('[data-prune-open]');
      await expectVisible(
        open.filter({ hasText: /^Prune…$/ }),
        `${id}'s page offers Prune… in its header: it is over, and its worktree and files are on disk`,
      );
      await open.click();
      const dialog = page.getByRole('dialog', { name: `Prune ${id}` });
      await expectVisible(dialog, 'the first press opens the choice of what to give back');
      const choice = (key: string) => dialog.locator(`[data-prune-choice="${key}"]`);
      for (const key of ['worktrees', 'files']) {
        await expectVisible(
          choice(key).filter({ hasText: 'Nobody merged it: only the last choice prunes it.' }),
          `the ${key} choice says why it is not offered`,
        );
        await expectCount(
          choice(key).and(page.locator('[data-disabled]')),
          1,
          `and cannot be chosen: nobody merged ${id}, and the api would refuse it`,
        );
      }
      const third = choice('unmerged');
      await expectVisible(
        third.filter({ hasText: 'Its worktrees and its files, though nobody merged it' }),
        'the third choice is the prune --unmerged',
      );
      await expectVisible(
        third.filter({ hasText: `once pruned, ${branch} is the only copy of it. No branch is ever deleted` }),
        'said plainly as leaving its branch the only copy of its work',
      );
      await expectCount(third.and(page.locator('[data-selected]')), 1, 'and it is chosen: the one choice the api takes');
      if (fs.existsSync(marker)) throw new Refused('opening the choice prunes nothing');
      await settled(page);
      await photograph(page, path.join(OUT, `prune-choices-${theme}.png`), { fullPage: true });

      await dialog.getByRole('button', { name: 'Prune…', exact: true }).click();
      const question = dialog.locator('[data-prune-question]');
      await expectVisible(
        question.filter({
          hasText: `Prune ${id}: its worktrees and its files, though nobody merged it? This cannot be undone. Its work was never merged: once pruned, ${branch} is the only copy of it.`,
        }),
        'the second ask says what goes, and the warning again',
      );
      if (fs.existsSync(marker) || !fs.existsSync(lane)) throw new Refused('the first Prune… asks, and prunes nothing');
      await settled(page);
      await photograph(page, path.join(OUT, `prune-asking-${theme}.png`), { fullPage: true });

      await dialog.getByRole('button', { name: 'Prune', exact: true }).click();
      await expectCount(dialog, 0, 'the second press prunes, and the popover closes');
      await expectCount(page.locator('[role="alert"][data-prune-refused]'), 0, 'with no refusal said');
      if (!fs.existsSync(marker)) throw new Refused(`the prune marks ${id} pruned — ${marker} is not there`);
      if (fs.existsSync(lane)) throw new Refused(`the prune removes the worktree — ${lane} is still there`);
      if (fs.existsSync(files)) throw new Refused(`the prune removes its files — ${files} is still there`);
      if (!git('branch', '--list', branch).trim()) throw new Refused(`the prune deletes no branch — ${branch} is gone`);
      await expectVisible(page.locator('[data-pruned][data-files-pruned]'), "the run's page says its worktrees and its files were pruned");
      await expectCount(open, 0, 'and offers no prune: nothing of it is left on disk');
      await settled(page);
      await photograph(page, path.join(OUT, `prune-pruned-${theme}.png`), { fullPage: true });

      await page.goto(new URL('/runs', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      const row = page.locator(`[data-runs-page] tr[data-run="${id}"]`);
      await expectVisible(row.locator('[data-ended]'), `pruned, ${id} keeps its row on Runs, which says how it ended`);
      await expectCount(page.locator('[data-runs-page] [data-pruned]'), 0, 'and nothing of what was removed: its page says that');

      await page.goto(new URL('/factories/default', page.url()).href, { waitUntil: 'load' });
      await idle(page);
      await page.getByRole('button', { name: 'Reset layout' }).click();
      await settled(page);
      const card = cardOf(page, id);
      await expectVisible(card.locator('[data-pruned]', { hasText: /^pruned$/ }), `${id}'s card on the Factory says pruned`);
      await expectVisible(
        card.getByText('to decide', { exact: true }),
        'beside what is still to decide: its branch is still ahead of main',
      );
      await expectClearOfEachOther(page);
      await photographCard(page, card, path.join(OUT, `prune-card-${theme}.png`));
    } finally {
      await takeBack(page, { id, repo: record.repo, lane, files, marker });
    }
  },
} satisfies PageSpec;

/**
 * The run as seeded again: no marker, no worktree, no files, and the worktree forgotten by git — and its branch, which a prune never
 * touches, as it was. Said on the feed, so every page after reads the store as seeded; each theme's visit prunes it again.
 */
async function takeBack(
  page: Page,
  { id, repo, lane, files, marker }: { id: string; repo: string; lane: string; files: string; marker: string },
): Promise<void> {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (fs.existsSync(lane)) git('worktree', 'remove', '--force', lane);
  git('worktree', 'prune');
  fs.rmSync(path.dirname(lane), { recursive: true, force: true });
  fs.rmSync(files, { recursive: true, force: true });
  fs.rmSync(marker, { force: true });
  fed(id, 'implement', 'done');
  await idle(page);
}
