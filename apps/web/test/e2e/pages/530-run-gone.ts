import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { fed, photograph, themeOf } from '../board.ts';
import { expectCount, expectVisible, idle, Refused, settled, watch } from '../checks.ts';
import { LANDED } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

/** Where the run's record waits while it is gone: beside it, under a name that is no run's, so the api lists no run for it. */
const AWAY = '.away';

/** A second page, opened on `route` and watched, with no read of the run before it: an address typed, or a link kept. */
async function visit(page: Page, route: string, opened: Page[]) {
  const other = await page.context().newPage();
  opened.push(other);
  const { problems } = watch(other);
  await other.goto(new URL(route, page.url()).href, { waitUntil: 'load' });
  await idle(other);
  return { other, problems };
}

export default {
  /**
   * A run removed, as `nemia rm` removes it, then visited by its address — its page and one of its steps' — with no read of it before:
   * each page says the store has no run of that id, removed or never one, and links to the runs it has, in place of a failure. Its one
   * refusal is the point, so each page counts exactly the read of the run that finds none. The record is put back before the pages close,
   * and said on the feed.
   */
  name: 'run-gone',
  route: '/runs',
  expect: async (page) => {
    const { id, ending } = LANDED;
    const record = path.join(store!, 'runs', `${id}.json`);
    const opened: Page[] = [];
    try {
      fs.renameSync(record, record + AWAY);
      fed(id, 'removed');
      const run = await visit(page, `/runs/${id}`, opened);
      const step = await visit(page, `/runs/${id}/steps/${ending}`, opened);
      const said = new RegExp(`^Run ${id} is not in this store: removed, or never was\\. Runs lists the runs the store has\\.$`);
      for (const [{ other }, where] of [
        [run, 'the run page'],
        [step, 'the step page'],
      ] as const) {
        await expectVisible(other.locator(`[data-run-gone="${id}"]`, { hasText: said }), `${where} says the store has no such run`);
        await expectCount(other.getByText('Could not load this run'), 0, `and ${where} says no failure`);
        await expectCount(other.locator('article, header[aria-label="The step"]'), 0, `and ${where} draws no run`);
        await expectVisible(other.getByRole('link', { name: '← Runs' }), `and ${where} links to the runs the store has`);
      }
      await settled(run.other);
      await photograph(run.other, path.join(OUT, `run-gone-run-${await themeOf(run.other)}.png`), { fullPage: true });
      await settled(step.other);
      await photograph(step.other, path.join(OUT, `run-gone-step-${await themeOf(step.other)}.png`), { fullPage: true });

      const refused = `request answered 404: GET ${new URL(`/api/runs/${id}`, page.url()).href}`;
      for (const [{ problems }, where] of [
        [run, 'the run page'],
        [step, 'the step page'],
      ] as const) {
        const seen = problems();
        const others = seen.filter(
          (p) => p !== refused && !/^console error: Failed to load resource: the server responded with a status of 404\b/.test(p),
        );
        if (!seen.includes(refused) || others.length)
          throw new Refused(
            `${where} saw the read of a run gone, as the browser reports it, and nothing else — it saw:\n    ${seen.join('\n    ')}`,
          );
      }
    } finally {
      if (fs.existsSync(record + AWAY)) {
        fs.renameSync(record + AWAY, record);
        fed(id, 'finished');
      }
      for (const other of opened) await other.close();
    }
    await expectCount(page.locator(`a[href="/runs/${id}"]`), 1, 'put back: the run is in the list again');
  },
} satisfies PageSpec;
