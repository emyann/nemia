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

/** A second page, open on `route` and watched: the one refusal it may see is the read of the run that finds none. */
async function openOn(page: Page, route: string, opened: Page[]) {
  const other = await page.context().newPage();
  opened.push(other);
  const { problems } = watch(other);
  await other.goto(new URL(route, page.url()).href, { waitUntil: 'load' });
  await idle(other);
  return { other, problems };
}

export default {
  /**
   * A run removed while a person has its page open, and one of its steps' too, as `wf rm` removes it: its record gone from the store, and
   * the feed says `removed`. Each page reads the run's record again, finds none, and says the run is gone in place of what it drew — at
   * once, the 404 not tried again. Its record is put back before the pages are closed, and said on the feed, and the list, read again, has
   * it.
   */
  name: 'removed',
  route: '/runs',
  expect: async (page) => {
    const { id, ending } = LANDED;
    const record = path.join(store!, 'runs', `${id}.json`);
    const opened: Page[] = [];
    try {
      const run = await openOn(page, `/runs/${id}`, opened);
      const step = await openOn(page, `/runs/${id}/steps/${ending}`, opened);
      await expectVisible(run.other.locator(`article > section#step-${ending}`), 'the run page draws the run while it is in the store');
      await expectVisible(step.other.getByRole('heading', { level: 1, name: ending, exact: true }), 'and the step page its step');
      for (const { problems } of [run, step]) {
        if (problems().length)
          throw new Refused(`the pages saw nothing wrong while the run was there — they saw:\n    ${problems().join('\n    ')}`);
      }

      fs.renameSync(record, record + AWAY);
      fed(id, 'removed');
      const said = new RegExp(
        `^${LANDED.title} is no longer in this store: it was removed while this page was open\\. Runs lists the runs the store has\\.$`,
      );
      for (const [{ other }, where] of [
        [run, 'the run page'],
        [step, 'the step page'],
      ] as const) {
        await expectVisible(
          other.locator(`[data-run-gone="${id}"]`, { hasText: said }),
          `${where} says the run is gone on the read that finds none, well inside the seven seconds three tries of a failure would take`,
          3_000,
        );
        await expectCount(other.locator('article, header[aria-label="The step"]'), 0, `and ${where} draws nothing of what it last read`);
        await expectVisible(other.getByRole('link', { name: '← Runs' }), `and ${where} links to the runs the store has`);
      }
      await settled(run.other);
      await photograph(run.other, path.join(OUT, `removed-run-${await themeOf(run.other)}.png`), { fullPage: true });
      await settled(step.other);
      await photograph(step.other, path.join(OUT, `removed-step-${await themeOf(step.other)}.png`), { fullPage: true });

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
