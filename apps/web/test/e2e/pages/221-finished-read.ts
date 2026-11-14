import { QueryClient } from '@tanstack/react-query';
import type { Page } from 'playwright';
import { FINISHED_SIZE, finishedRunsQuery, type FinishedPage } from '../../../src/lib/api/runs.ts';
import { pageSaid, pastLast } from '../../../src/lib/finished.ts';
import { Refused } from '../checks.ts';
import { FACTORIES } from '../seed.ts';
import { bearer } from '../served.ts';
import type { PageSpec } from '../visit.ts';

/** A factory of the seed that holds a run. */
const FACTORY = FACTORIES.hiring.name;

/**
 * The board's own read of the page of the finished runs the trail `older` leads to, of `factory` or of every one, asked of the api the
 * page is served beside: the query's function, its address resolved against the page's, presenting the seat's token as the browser's
 * cookie would (`bearer`). Refused with why where the api refuses it or it does not decode.
 */
async function finished(page: Page, factory: string | undefined, older: string[]): Promise<FinishedPage> {
  const before = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    for (const [name, value] of Object.entries(bearer())) headers.set(name, value);
    return before(new URL(String(input), page.url()), { ...init, headers });
  };
  const client = new QueryClient();
  try {
    return await client.fetchQuery(finishedRunsQuery(factory, older));
  } catch (err) {
    throw new Refused(`the page after ${older.length} of the finished runs is read off the RunList — ${(err as Error).message}`);
  } finally {
    client.clear();
    globalThis.fetch = before;
  }
}

export default {
  /**
   * The read of the finished runs against the api's real answer, with no page drawn off it yet: a page of nine of the RunList asked
   * `status.state=finished` decodes, its rows newest finished first; one factory's page holds that factory's runs alone; and a token past
   * the last is answered with no row and said. Writes nothing.
   */
  name: 'finished-read',
  route: '/agents',
  expect: async (page) => {
    const first = await finished(page, undefined, []);
    if (first.runs.length === 0) throw new Refused('the seeded store has a finished run');
    if (first.runs.length !== Math.min(first.total, FINISHED_SIZE))
      throw new Refused(`the first page holds its rows — ${first.runs.length} of ${first.total}`);
    const stopped = first.runs.map((run) => run.finishedAt);
    if (stopped.join() !== [...stopped].sort().reverse().join())
      throw new Refused(`the rows are newest finished first — ${stopped.join(', ')}`);

    const ours = await finished(page, FACTORY, []);
    const others = ours.runs.filter((run) => run.factory !== FACTORY).map((run) => `${run.id} (${run.factory})`);
    if (others.length > 0) throw new Refused(`the page of ${FACTORY} holds its runs alone — ${others.join(', ')}`);
    if (ours.total > first.total) throw new Refused(`one factory holds no more than every factory — ${ours.total} of ${first.total}`);

    const token = `f.${Buffer.from(JSON.stringify(['1970-01-01T00:00:00.000Z', ''])).toString('base64url')}`;
    const past = await finished(page, undefined, [token]);
    if (past.runs.length !== 0) throw new Refused(`a token past the last gives no row — ${past.runs.length}`);
    const at = { trail: [token], next: past.continue, count: past.runs.length, total: past.total, size: FINISHED_SIZE };
    if (!pastLast(at)) throw new Refused('a page past the last is said');
    if (pageSaid(at) !== `Page 2 is past the last, ${Math.max(1, Math.ceil(first.total / FINISHED_SIZE))}.`)
      throw new Refused(`it is said so — ${pageSaid(at)}`);
  },
} satisfies PageSpec;
