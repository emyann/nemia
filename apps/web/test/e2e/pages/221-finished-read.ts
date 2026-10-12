import { QueryClient } from '@tanstack/react-query';
import type { Page } from 'playwright';
import { FINISHED_SIZE, finishedRunsQuery, type FinishedPage } from '../../../src/lib/api/runs.ts';
import { pageSaid, pastLast } from '../../../src/lib/finished.ts';
import { Refused } from '../checks.ts';
import { FACTORIES } from '../seed.ts';
import type { PageSpec } from '../visit.ts';

/** A factory of the seed that holds a run. */
const FACTORY = FACTORIES.hiring.name;

/**
 * The board's own read of page `at` of the finished runs, of `factory` or of every one, asked of the api the page is served beside:
 * the query's function, its address resolved against the page's. Refused with why where the api refuses it or it does not decode.
 */
async function finished(page: Page, factory: string | undefined, at: number): Promise<FinishedPage> {
  const before = globalThis.fetch;
  globalThis.fetch = (input, init) => before(new URL(String(input), page.url()), init);
  const client = new QueryClient();
  try {
    return await client.fetchQuery(finishedRunsQuery(factory, at));
  } catch (err) {
    throw new Refused(`page ${at} of the finished runs is read as the board's mirror of it — ${(err as Error).message}`);
  } finally {
    client.clear();
    globalThis.fetch = before;
  }
}

export default {
  /**
   * The read of the finished runs against the api's real answer, with no page drawn off it yet: a page of nine decodes through the
   * board's schema, its rows newest finished first; one factory's page holds that factory's runs alone; and a page past the last is
   * answered with no row and said. Writes nothing.
   */
  name: 'finished-read',
  route: '/agents',
  expect: async (page) => {
    const first = await finished(page, undefined, 1);
    if (first.runs.length === 0) throw new Refused('the seeded store has a finished run');
    if (first.page !== 1 || first.size !== FINISHED_SIZE)
      throw new Refused(`the answer says the page asked — ${first.page}, ${first.size}`);
    if (first.runs.length !== Math.min(first.total, FINISHED_SIZE))
      throw new Refused(`the first page holds its rows — ${first.runs.length} of ${first.total}`);
    const stopped = first.runs.map((run) => run.finishedAt);
    if (stopped.join() !== [...stopped].sort().reverse().join())
      throw new Refused(`the rows are newest finished first — ${stopped.join(', ')}`);

    const ours = await finished(page, FACTORY, 1);
    const others = ours.runs.filter((run) => run.factory !== FACTORY).map((run) => `${run.id} (${run.factory})`);
    if (others.length > 0) throw new Refused(`the page of ${FACTORY} holds its runs alone — ${others.join(', ')}`);
    if (ours.total > first.total) throw new Refused(`one factory holds no more than every factory — ${ours.total} of ${first.total}`);

    const past = await finished(page, undefined, first.pages + 9);
    if (past.runs.length !== 0) throw new Refused(`a page past the last holds no row — ${past.runs.length}`);
    if (!pastLast(past)) throw new Refused(`a page past the last is said — page ${past.page} of ${past.pages}`);
    if (pageSaid(past) !== `Page ${first.pages + 9} is past the last, ${first.pages}.`)
      throw new Refused(`it is said so — ${pageSaid(past)}`);
  },
} satisfies PageSpec;
